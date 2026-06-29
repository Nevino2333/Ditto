import type { AppManifest, CellRuntimeConfig, ClientCellStatus, Capability } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';
import type { CellSandbox } from '../sandbox';
import { createSandbox } from '../sandbox';
import type { CellBridge } from './bridge';
import { assertTransition } from './lifecycle';

type ErrorHandler = (err: Error) => void;

export interface ClientCellDeps {
  /** 容器元素，沙盒挂载用。 */
  container: HTMLElement;
  /** dit 类型的 WS 桥接（其他类型可不提供）。 */
  bridge?: CellBridge;
  /** 权限请求回调，返回 false 则拒绝。 */
  requestPermission?: (capability: Capability) => Promise<boolean>;
}

/**
 * ClientCell：客户端应用实例。
 * 与服务端 CellInstance 对称，承担应用全生命周期。
 * 支持 native/web/pwa/dit 四种类型；activate/pause/resume/unload 全部实现。
 */
export class ClientCell {
  private _status: ClientCellStatus = 'loading';
  private _error: Error | undefined;
  private _sandbox: CellSandbox | null = null;
  private _component: unknown = null;
  private emitter = new EventEmitter();

  constructor(
    readonly manifest: AppManifest,
    private config: CellRuntimeConfig,
    private deps: ClientCellDeps,
  ) {}

  get appId(): string { return this.manifest.id; }
  get status(): ClientCellStatus { return this._status; }
  get error(): Error | undefined { return this._error; }
  get sandbox(): CellSandbox | null { return this._sandbox; }

  async activate(): Promise<void> {
    if (this._status === 'active') return;

    try {
      // 权限请求
      if (this.deps.requestPermission) {
        for (const perm of this.manifest.permissions) {
          await this.deps.requestPermission(perm as any);
        }
      }

      // 创建沙盒
      const mode = this.config.type === 'native' ? 'shadow-trusted' : 'iframe-strict';
      const opts = this.config.type === 'native'
        ? {}
        : { origin: (this.config as any).origin ?? window.location.origin };
      this._sandbox = createSandbox(this.appId, mode, opts);

      // 挂载
      if (this.config.type === 'native') {
        this._component = await this.config.componentLoader();
        this._sandbox.mount(this.deps.container, '<div id="app"></div>');
      } else if (this.config.type === 'web' || this.config.type === 'pwa') {
        const url = this.config.type === 'web'
          ? this.config.url
          : (this.config.startUrl ?? this.config.manifestUrl);
        this._sandbox.mount(this.deps.container, url);
      } else if (this.config.type === 'dit') {
        const frontendUrl = `${this.config.origin}/api/apps/${this.appId}/frontend/index.html`;
        this._sandbox.mount(this.deps.container, frontendUrl);
        if (this.config.backendCell && this.deps.bridge) {
          await this.deps.bridge.notifyStart(this.appId);
        }
      }

      assertTransition(this._status, 'active');
      this._status = 'active';
      this.emitter.emit('cell:active', this);
    } catch (e) {
      this._error = e instanceof Error ? e : new Error(String(e));
      if (canTransitionToError(this._status)) {
        this._status = 'error';
      }
      this.emitter.emit('cell:error', { appId: this.appId, error: this._error });
    }
  }

  async pause(): Promise<void> {
    if (this._status === 'paused') return;
    assertTransition(this._status, 'paused');

    try {
      // 通知服务端 hibernate（dit 类型且有后端才调用）
      if (this.config.type === 'dit' && this.config.backendCell && this.deps.bridge) {
        await this.deps.bridge.notifyHibernate(this.appId);
      }
      // 隐藏沙盒 DOM（保留 state，释放视觉资源）
      this._sandbox?.setVisible(false);
      this._status = 'paused';
      this.emitter.emit('cell:paused', this);
    } catch (e) {
      this._error = e instanceof Error ? e : new Error(String(e));
      this.emitter.emit('cell:error', { appId: this.appId, error: this._error });
      throw e;
    }
  }

  async resume(): Promise<void> {
    if (this._status === 'active') return;
    assertTransition(this._status, 'active');

    try {
      // 通知服务端 wake（dit 类型且有后端才调用）
      if (this.config.type === 'dit' && this.config.backendCell && this.deps.bridge) {
        await this.deps.bridge.notifyWake(this.appId);
      }
      // 恢复沙盒显示
      this._sandbox?.setVisible(true);
      this._status = 'active';
      this.emitter.emit('cell:resumed', this);
    } catch (e) {
      this._error = e instanceof Error ? e : new Error(String(e));
      this.emitter.emit('cell:error', { appId: this.appId, error: this._error });
      throw e;
    }
  }

  async unload(): Promise<void> {
    if (this._status === 'stopped') return;

    try {
      if (this.config.type === 'dit' && this.config.backendCell && this.deps.bridge) {
        await this.deps.bridge.notifyStop(this.appId);
      }
      this._sandbox?.destroy();
      this._sandbox = null;
      this._component = null;
    } catch (e) {
      console.error(`[Ditto Cell] unload error for ${this.appId}:`, e);
    }

    if (canTransitionToStopped(this._status)) {
      this._status = 'stopped';
    }
    this.emitter.emit('cell:stopped', this);
  }

  onError(handler: ErrorHandler): () => void {
    return this.emitter.on('cell:error', handler as any);
  }

  onActive(handler: () => void): () => void {
    return this.emitter.on('cell:active', handler as any);
  }

  onStopped(handler: () => void): () => void {
    return this.emitter.on('cell:stopped', handler as any);
  }

  onPaused(handler: () => void): () => void {
    return this.emitter.on('cell:paused', handler as any);
  }

  onResumed(handler: () => void): () => void {
    return this.emitter.on('cell:resumed', handler as any);
  }
}

function canTransitionToError(from: ClientCellStatus): boolean {
  return from === 'loading' || from === 'active';
}

function canTransitionToStopped(from: ClientCellStatus): boolean {
  return from !== 'stopped';
}
