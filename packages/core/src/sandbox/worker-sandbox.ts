import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

const DITTO_MESSAGE_TYPE = 'ditto-ipc';

export interface WorkerSandboxOptions {
  /**
   * Worker 代码来源。优先级：code > url。
   * - code：字符串源码，通过 Blob URL 注入（适用于动态生成代码 / 远程 fetch 后注入）
   * - url：直接 Worker URL（同源或 CORS 允许）
   */
  code?: string;
  url?: string;
  /** Worker 名称（debug 用）。 */
  name?: string;
  /** 是否允许 ES Module worker（type: 'module'）。默认 false（classic）。 */
  module?: boolean;
  /** 跨域 worker URL 时所需的 cross-origin 选项。 */
  credentials?: 'omit' | 'same-origin' | 'include';
}

/**
 * Worker 沙盒。
 *
 * 隔离模型：Worker 在独立全局环境运行，无 DOM / window 访问，
 * 仅通过 postMessage 与主线程通信。适用于：
 * - 后台计算任务
 * - CPU 密集型应用
 * - 不需要直接 DOM 访问的纯逻辑应用
 *
 * 安全特性：
 * - 无 allow-same-origin 等价（Worker 天然无同源 DOM 访问）
 * - importScripts / import 受 CORS 限制
 * - 通过消息白名单过滤非 ditto-ipc 消息
 *
 * 可见性：Worker 无 DOM，setVisible 通过 pause/resume 实现：
 * - visible=false → 暂停消息派发（缓冲到队列）
 * - visible=true → 恢复派发并清空队列
 */
export class WorkerSandbox {
  private appId: string;
  private worker: Worker | null = null;
  private host: HTMLElement | null = null;
  private messageHandlers = new Set<SandboxMessageHandler>();
  private paused = false;
  private pausedQueue: IPCMessage[] = [];
  private readonly module: boolean;
  private readonly credentials: 'omit' | 'same-origin' | 'include';

  constructor(appId: string, opts: WorkerSandboxOptions = {}) {
    this.appId = appId;
    this.module = opts.module ?? false;
    this.credentials = opts.credentials ?? 'same-origin';

    if (!opts.code && !opts.url) {
      throw DittoError.fromUnknown(
        new Error(`WorkerSandbox: code or url required for app "${appId}"`),
        'SANDBOX_CREATE_FAILED'
      );
    }

    const workerOptions: WorkerOptions = {
      name: opts.name ?? `ditto-worker-${appId}`,
      type: this.module ? 'module' : 'classic',
      credentials: this.credentials,
    };

    try {
      if (opts.url) {
        this.worker = new Worker(opts.url, workerOptions);
      } else {
        // 通过 Blob URL 注入源码（绕过同源 URL 限制）
        const blob = new Blob([opts.code!], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(blobUrl, workerOptions);
        // 挂起 revoke，待 worker 销毁后调用（避免加载中失效）
        (this.worker as any).__blobUrl = blobUrl;
      }
      this.worker.addEventListener('message', this.handleMessage);
      this.worker.addEventListener('error', this.handleError);
    } catch (e) {
      throw DittoError.fromUnknown(
        new Error(`WorkerSandbox: failed to create worker for "${appId}": ${(e as Error).message}`),
        'SANDBOX_CREATE_FAILED'
      );
    }
  }

  /**
   * 挂载。Worker 本身无 DOM，但可挂一个占位元素用于显示加载状态或调试信息。
   * @param container 父容器
   * @param _entryUrl 占位参数（Worker 不加载 URL，已在构造时创建）
   */
  mount(container: HTMLElement, _entryUrl?: string): void {
    this.host = document.createElement('div');
    this.host.dataset.appId = this.appId;
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.host.style.display = 'block';
    // 占位提示（可被应用通过 postMessage 替换）
    this.host.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">⚙️ Worker 运行中</div>`;
    container.appendChild(this.host);
  }

  /** 发送消息到 Worker。 */
  send(message: IPCMessage): void {
    if (this.worker) {
      this.worker.postMessage({ type: DITTO_MESSAGE_TYPE, message });
    }
  }

  /** 注册消息处理器。返回取消订阅函数。 */
  onMessage(handler: SandboxMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * 可见性控制。
   * Worker 无 DOM，因此实现为消息派发的暂停/恢复：
   * - visible=false：暂停派发，消息缓冲到队列
   * - visible=true：恢复派发，清空队列
   */
  setVisible(visible: boolean): void {
    this.paused = !visible;
    if (visible && this.pausedQueue.length > 0) {
      const queue = this.pausedQueue.splice(0);
      for (const msg of queue) {
        this.dispatch(msg);
      }
    }
  }

  /** 销毁 Worker 与占位 DOM。 */
  destroy(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleMessage);
      this.worker.removeEventListener('error', this.handleError);
      const blobUrl = (this.worker as any).__blobUrl;
      this.worker.terminate();
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ }
      }
      this.worker = null;
    }
    if (this.host) {
      this.host.remove();
      this.host = null;
    }
    this.messageHandlers.clear();
    this.pausedQueue.length = 0;
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.data?.type !== DITTO_MESSAGE_TYPE) return;
    if (!event.data?.message) return;
    const message = event.data.message as IPCMessage;
    if (this.paused) {
      // 暂停时缓冲（限制队列长度避免内存泄漏）
      if (this.pausedQueue.length < 100) {
        this.pausedQueue.push(message);
      }
      return;
    }
    this.dispatch(message);
  };

  private dispatch(message: IPCMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error(`[Ditto WorkerSandbox] Error in handler for "${this.appId}":`, e);
      }
    }
  }

  private handleError = (event: ErrorEvent): void => {
    console.error(`[Ditto WorkerSandbox] Worker error for "${this.appId}":`, event.message, event);
  };
}
