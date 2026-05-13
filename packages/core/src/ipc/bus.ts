import type { IPCMessage, IPCChannel } from '@ditto/shared';
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

let msgCounter = 0;
function generateMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export class IPCBus {
  private id: string;
  private emitter = new EventEmitter();
  private handlers = new Map<string, Set<IPCHandler>>();
  private pendingRequests = new Map<string, PendingRequest>();
  private middlewares: IPCMiddleware[] = [];
  private bridgeTarget: Window | null = null;
  private bridgeOrigin = '*';
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
    return () => {
      const set = this.handlers.get(channel);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this.handlers.delete(channel);
      }
    };
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
    message.requestId = requestId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(DittoError.ipcTimeout(channel, timeout ?? this.defaultTimeout));
      }, timeout ?? this.defaultTimeout);

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

  connectBridge(targetWindow: Window, targetOrigin = '*'): void {
    this.bridgeTarget = targetWindow;
    this.bridgeOrigin = targetOrigin;

    if (this.bridgeListener) {
      window.removeEventListener('message', this.bridgeListener);
    }

    this.bridgeListener = (event: MessageEvent) => {
      if (event.data?.type !== DITTO_MSG_TYPE) return;
      if (!event.data?.message) return;

      if (this.bridgeOrigin !== '*' && event.origin !== this.bridgeOrigin) return;

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
      for (const handler of set) {
        try {
          handler(message);
        } catch (e) {
          console.error(`[Ditto IPC] Handler error on "${message.channel}":`, e);
        }
      }
    }

    this.emitter.emit('message', message);
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

  private dispatch(message: IPCMessage): void {
    if (this.middlewares.length > 0) {
      let index = 0;
      const next = (msg: IPCMessage) => {
        if (index < this.middlewares.length) {
          const middleware = this.middlewares[index++];
          middleware(msg, next);
        } else {
          this.finalDispatch(msg);
        }
      };
      next(message);
    } else {
      this.finalDispatch(message);
    }
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
