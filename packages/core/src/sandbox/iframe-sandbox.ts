import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

const DITTO_MESSAGE_TYPE = 'ditto-ipc';

export interface IFrameSandboxOptions {
  origin: string;
  /** sandbox 属性，默认 allow-scripts（不含 allow-same-origin，安全收紧）。 */
  sandboxAttributes?: string;
  /** trusted 应用可显式加 allow-same-origin。 */
  allowSameOrigin?: boolean;
}

/**
 * IFrame 沙盒（strict 模式）。
 * 安全收紧：默认 sandbox=allow-scripts，移除 allow-same-origin；
 * origin 强制白名单，不再接受 '*'。
 */
export class IFrameSandbox {
  private iframe: HTMLIFrameElement | null = null;
  private appId: string;
  private messageHandlers = new Set<SandboxMessageHandler>();
  private allowedOrigin: string;
  private sandboxAttributes: string;

  constructor(appId: string, opts: IFrameSandboxOptions | string) {
    this.appId = appId;
    // 兼容旧字符串调用（内部迁移用）
    const o: IFrameSandboxOptions = typeof opts === 'string' ? { origin: opts } : opts;
    if (!o.origin) {
      throw DittoError.fromUnknown(
        new Error(`IFrameSandbox: origin required for app "${appId}"`),
        'SANDBOX_CREATE_FAILED'
      );
    }
    this.allowedOrigin = o.origin;
    const attrs = o.sandboxAttributes ?? 'allow-scripts';
    this.sandboxAttributes = o.allowSameOrigin ? `${attrs} allow-same-origin` : attrs;
  }

  mount(container: HTMLElement, entryUrl: string): void {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', this.sandboxAttributes);
    this.iframe.setAttribute('src', entryUrl);
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = 'none';
    this.iframe.style.display = 'block';
    this.iframe.dataset.appId = this.appId;
    container.appendChild(this.iframe);
    window.addEventListener('message', this.handleMessage);
  }

  send(message: IPCMessage): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(
        { type: DITTO_MESSAGE_TYPE, message },
        this.allowedOrigin
      );
    }
  }

  onMessage(handler: SandboxMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.messageHandlers.clear();
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.data?.type !== DITTO_MESSAGE_TYPE) return;
    if (!event.data?.message) return;
    if (event.origin !== this.allowedOrigin) {
      console.warn(`[Ditto IFrameSandbox] Rejected message from origin: ${event.origin}`);
      return;
    }
    if (this.iframe && event.source !== this.iframe.contentWindow) return;

    const message: IPCMessage = event.data.message;
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error(`[Ditto Sandbox] Error in message handler for "${this.appId}":`, e);
      }
    }
  };
}
