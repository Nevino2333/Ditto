import type { IPCMessage } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

/**
 * Shadow DOM 沙盒（trusted 模式）。
 * 警告：无安全隔离，仅用于 native 应用（shell 信任的代码）。
 * 第三方应用必须用 IFrameSandbox。
 */
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
