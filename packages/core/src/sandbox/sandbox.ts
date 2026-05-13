import type { IPCMessage } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

const DITTO_MESSAGE_TYPE = 'ditto-ipc';

export class IFrameSandbox {
  private iframe: HTMLIFrameElement | null = null;
  private appId: string;
  private messageHandlers = new Set<SandboxMessageHandler>();
  private allowedOrigin: string;

  constructor(appId: string, allowedOrigin = '*') {
    this.appId = appId;
    this.allowedOrigin = allowedOrigin;
  }

  mount(container: HTMLElement, entryUrl: string): void {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
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

    if (this.allowedOrigin !== '*' && event.origin !== this.allowedOrigin) {
      console.warn(`[Ditto IFrameSandbox] Rejected message from origin: ${event.origin}`);
      return;
    }

    if (this.iframe && event.source !== this.iframe.contentWindow) {
      return;
    }

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

export class ShadowSandbox {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private appId: string;
  private messageHandlers = new Set<SandboxMessageHandler>();

  constructor(appId: string) {
    this.appId = appId;
  }

  mount(container: HTMLElement, content: string): void {
    this.host = document.createElement('div');
    this.host.dataset.appId = this.appId;
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = content;
    container.appendChild(this.host);
  }

  mountComponent(container: HTMLElement, componentEl: HTMLElement): void {
    this.host = document.createElement('div');
    this.host.dataset.appId = this.appId;
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.appendChild(componentEl);
    container.appendChild(this.host);
  }

  send(message: IPCMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error(`[Ditto ShadowSandbox] Error for "${this.appId}":`, e);
      }
    }
  }

  onMessage(handler: SandboxMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getShadowRoot(): ShadowRoot | null {
    return this.shadow;
  }

  destroy(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      this.shadow = null;
    }
    this.messageHandlers.clear();
  }
}

export type Sandbox = IFrameSandbox | ShadowSandbox;

export function createSandbox(appId: string, mode: 'strict' | 'trusted', allowedOrigin?: string): Sandbox {
  if (mode === 'strict') {
    return new IFrameSandbox(appId, allowedOrigin);
  }
  return new ShadowSandbox(appId);
}
