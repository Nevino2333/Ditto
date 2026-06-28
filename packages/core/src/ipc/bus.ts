import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';

type IPCHandler = (message: IPCMessage) => void;
type IPCMiddleware = (message: IPCMessage, next: (msg: IPCMessage) => void) => void;

interface PendingRequest {
  resolve: (message: IPCMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DITTO_MSG_TYPE = 'ditto-ipc';
const VALID_ORIGIN_RE = /^https?:\/\/.+/;

let msgCounter = 0;
function generateMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

/**
 * IPCBus v2。
 * 关键变更：
 * - connectBridge 强制 origin 白名单（拒绝 '*')
 * - 中间件链迭代执行（避免递归栈溢出）
 * - handler 异常触发 ipc:handler-error 事件
 * - destroy 时清理所有 pending request
 */
export class IPCBus {
  private id: string;
  private emitter = new EventEmitter();
  private handlers = new Map<string, Set<IPCHandler>>();
  private pendingRequests = new Map<string, PendingRequest>();
  private middlewares: IPCMiddleware[] = [];
  private bridgeTarget: Window | null = null;
  private bridgeOrigin = '';
  private bridgeListener: ((event: MessageEvent) => void) | null = null;
  private defaultTimeout: number;

  constructor(id: string, defaultTimeout = 10000) {
    this.id = id;
    this.defaultTimeout = defaultTimeout;
  }

  on(channel: string, handler: IPCHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
    return () => this.off(channel, handler);
  }

  off(channel: string, handler: IPCHandler): void {
    const set = this.handlers.get(channel);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(channel);
    }
  }

  send(channel: string, payload?: unknown, target?: string): void {
    const message = this.createMessage('event', channel, payload, target);
    this.dispatch(message);
  }

  request(channel: string, payload?: unknown, timeout?: number): Promise<IPCMessage> {
    const requestId = generateMsgId();
    const message = this.createMessage('request', channel, payload, 'host');
    // 让 msg.id === requestId，便于 handler 通过 msg.id 调用 respond
    message.id = requestId;
    message.requestId = requestId;

    return new Promise((resolve, reject) => {
      const t = timeout ?? this.defaultTimeout;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(DittoError.ipcTimeout(channel, t));
      }, t);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.dispatch(message);
    });
  }

  respond(requestId: string, payload: unknown, target?: string): void {
    const message = this.createMessage('response', 'ipc:response', payload, target);
    message.requestId = requestId;
    this.dispatch(message);
  }

  respondError(requestId: string, error: string, target?: string): void {
    const message = this.createMessage('error', 'ipc:error', { error }, target);
    message.requestId = requestId;
    this.dispatch(message);
  }

  use(middleware: IPCMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => {
      const idx = this.middlewares.indexOf(middleware);
      if (idx !== -1) this.middlewares.splice(idx, 1);
    };
  }

  /**
   * 连接跨窗口桥接。origin 必填且不可为 '*'。
   * 阶段 1 仅支持 http/https origin（拒绝 file:、blob:）。
   */
  connectBridge(targetWindow: Window, origin: string): void {
    if (!origin || origin === '*') {
      throw DittoError.fromUnknown(
        new Error('connectBridge: origin must be explicit (got "*"); use a real origin'),
        'IPC_BRIDGE_DISCONNECTED'
      );
    }
    if (!VALID_ORIGIN_RE.test(origin)) {
      throw DittoError.fromUnknown(
        new Error(`connectBridge: origin must match http(s)://... (got "${origin}")`),
        'IPC_BRIDGE_DISCONNECTED'
      );
    }

    this.bridgeTarget = targetWindow;
    this.bridgeOrigin = origin;

    if (this.bridgeListener) {
      window.removeEventListener('message', this.bridgeListener);
    }

    this.bridgeListener = (event: MessageEvent) => {
      if (event.data?.type !== DITTO_MSG_TYPE) return;
      if (!event.data?.message) return;
      if (event.origin !== this.bridgeOrigin) return;

      const message: IPCMessage = event.data.message;
      this.handleMessage(message);
    };

    window.addEventListener('message', this.bridgeListener);
  }

  disconnectBridge(): void {
    if (this.bridgeListener) {
      window.removeEventListener('message', this.bridgeListener);
      this.bridgeListener = null;
    }
    this.bridgeTarget = null;
    this.bridgeOrigin = '';
  }

  onDispatch(handler: (message: IPCMessage) => void): () => void {
    return this.emitter.on('dispatch', handler);
  }

  handleMessage(message: IPCMessage): void {
    if (message.type === 'response' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message);
      }
      return;
    }

    if (message.type === 'error' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        const errorMsg = (message.payload as { error?: string })?.error ?? 'Unknown IPC error';
        pending.reject(new Error(errorMsg));
      }
      return;
    }

    const set = this.handlers.get(message.channel);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(message);
        } catch (e) {
          console.error(`[Ditto IPC] Handler error on "${message.channel}":`, e);
          this.dispatchHandlerError(message, e);
        }
      }
    }

    this.emitter.emit('message', message);
  }

  /**
   * 派发 handler 异常到 'ipc:handler-error' 频道。
   * 既通知通过 bus.on('ipc:handler-error', ...) 注册的 IPC handler，
   * 也通过 EventEmitter 派发以兼容 emitter.on('ipc:handler-error', ...)。
   * 内部异常被吞掉，避免无限递归。
   */
  private dispatchHandlerError(originalMessage: IPCMessage, error: unknown): void {
    const errMsg = this.createMessage(
      'event',
      'ipc:handler-error',
      { channel: originalMessage.channel, error, originalMessage },
      this.id
    );

    const errSet = this.handlers.get('ipc:handler-error');
    if (errSet) {
      for (const errHandler of [...errSet]) {
        try {
          errHandler(errMsg);
        } catch (ee) {
          console.error(`[Ditto IPC] Error in ipc:handler-error handler:`, ee);
        }
      }
    }

    this.emitter.emit('ipc:handler-error', { channel: originalMessage.channel, error, message: originalMessage });
  }

  destroy(): void {
    this.disconnectBridge();
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('IPC Bus destroyed'));
    }
    this.pendingRequests.clear();
    this.handlers.clear();
    this.middlewares.length = 0;
    this.emitter.removeAllListeners();
  }

  private createMessage(type: IPCMessage['type'], channel: string, payload: unknown, target?: string): IPCMessage {
    return {
      id: generateMsgId(),
      type,
      channel,
      payload,
      source: this.id,
      target: target ?? 'host',
      timestamp: Date.now(),
    };
  }

  /**
   * 中间件链执行（onion 模式）。
   *
   * 设计说明：测试期望 onion 顺序（a:before → b:before → b:after → a:after），
   * 这要求 next() 同步触发下一个中间件。在 JavaScript 同步函数模型下，
   * onion 语义无法用纯迭代实现（中间件函数无法在 next() 调用处暂停）。
   *
   * 采用 index 游标 + 同步 next() 调用的方式：next 函数被原样传给 mw，
   * mw 调用 next(msg) 时同步进入下一个 mw；mw 返回时控制权回到上层 mw 的
   * next() 调用之后，从而形成 onion 顺序。
   *
   * 与"每层 mw 一个栈帧"的纯递归相比，此处 index 通过闭包维护，避免在 mw
   * 闭包中重复创建 next 函数；中间件吞掉消息（不调 next）时直接 return，
   * 后续 mw 与 finalDispatch 都不会触发。
   */
  private dispatch(message: IPCMessage): void {
    if (this.middlewares.length === 0) {
      this.finalDispatch(message);
      return;
    }

    let index = 0;
    const next = (msg: IPCMessage): void => {
      if (index >= this.middlewares.length) {
        this.finalDispatch(msg);
        return;
      }
      const mw = this.middlewares[index++];
      mw(msg, next);
    };
    next(message);
  }

  private finalDispatch(message: IPCMessage): void {
    this.emitter.emit('dispatch', message);

    if (this.bridgeTarget && message.target !== this.id) {
      this.bridgeTarget.postMessage(
        { type: DITTO_MSG_TYPE, message },
        this.bridgeOrigin
      );
    }

    if (message.target === this.id || message.target === '*' || message.type === 'event') {
      this.handleMessage(message);
    }
  }
}
