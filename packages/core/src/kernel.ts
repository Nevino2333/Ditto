import { IPCBus } from './ipc/bus';
import { EventEmitter } from './event/emitter';
import { PluginLoader } from './plugin/loader';
import { PersistenceStore } from './persistence/store';
import { PermissionManager } from './sandbox/permission';
import type { DittoConfig } from '@ditto/shared';
import { defaultConfig, mergeConfig } from '@ditto/shared';

export type KernelState = 'created' | 'initializing' | 'ready' | 'destroying' | 'destroyed';

export type KernelLifecycleHook = {
  beforeInit?: (kernel: DittoKernel) => void | Promise<void>;
  afterInit?: (kernel: DittoKernel) => void | Promise<void>;
  beforeDestroy?: (kernel: DittoKernel) => void | Promise<void>;
  afterDestroy?: (kernel: DittoKernel) => void | Promise<void>;
};

export class DittoKernel {
  readonly ipc: IPCBus;
  readonly events: EventEmitter;
  readonly store: PersistenceStore;
  readonly permissions: PermissionManager;
  readonly plugins: PluginLoader;
  readonly config: DittoConfig;

  private _state: KernelState = 'created';
  private lifecycleHooks: KernelLifecycleHook[] = [];

  constructor(config?: Partial<DittoConfig>) {
    this.config = mergeConfig(config ?? {});
    this.ipc = new IPCBus(this.config.kernel.id);
    this.events = new EventEmitter();
    this.store = new PersistenceStore();
    this.permissions = new PermissionManager(
      this.config.permissions.persistDecisions ? this.store : undefined
    );
    this.plugins = new PluginLoader(this.ipc, this.permissions);
  }

  get state(): KernelState {
    return this._state;
  }

  addLifecycleHook(hook: KernelLifecycleHook): void {
    this.lifecycleHooks.push(hook);
  }

  removeLifecycleHook(hook: KernelLifecycleHook): void {
    const idx = this.lifecycleHooks.indexOf(hook);
    if (idx !== -1) this.lifecycleHooks.splice(idx, 1);
  }

  async init(): Promise<void> {
    if (this._state === 'ready') return;
    if (this._state === 'initializing') {
      throw new Error('[Ditto Kernel] Already initializing');
    }

    this._state = 'initializing';

    for (const hook of this.lifecycleHooks) {
      if (hook.beforeInit) await hook.beforeInit(this);
    }

    this.events.emit('kernel:initializing', undefined);

    try {
      if (this.config.permissions.persistDecisions) {
        const savedPermissions = this.store.get<Record<string, string>>('permissions');
        if (savedPermissions) {
          this.permissions.loadFromStorage(savedPermissions);
        }
      }

      this.ipc.onDispatch((message) => {
        this.plugins.routeMessage(message);
      });

      this._state = 'ready';
      this.events.emit('kernel:ready', undefined);

      for (const hook of this.lifecycleHooks) {
        if (hook.afterInit) await hook.afterInit(this);
      }
    } catch (e) {
      this._state = 'created';
      this.events.emit('kernel:error', e);
      throw e;
    }
  }

  isInitialized(): boolean {
    return this._state === 'ready';
  }

  async destroy(): Promise<void> {
    if (this._state === 'destroyed' || this._state === 'destroying') return;

    this._state = 'destroying';

    for (const hook of this.lifecycleHooks) {
      if (hook.beforeDestroy) await hook.beforeDestroy(this);
    }

    this.events.emit('kernel:destroying', undefined);

    try {
      await this.plugins.destroy();
      this.ipc.destroy();
      this.events.removeAllListeners();
      this._state = 'destroyed';

      for (const hook of this.lifecycleHooks) {
        if (hook.afterDestroy) await hook.afterDestroy(this);
      }
    } catch (e) {
      this._state = 'destroyed';
      console.error('[Ditto Kernel] Error during destroy:', e);
    }
  }
}

let kernelInstance: DittoKernel | null = null;

export function createKernel(config?: Partial<DittoConfig>): DittoKernel {
  kernelInstance = new DittoKernel(config);
  return kernelInstance;
}

export function getKernel(): DittoKernel {
  if (!kernelInstance) {
    kernelInstance = new DittoKernel();
  }
  return kernelInstance;
}
