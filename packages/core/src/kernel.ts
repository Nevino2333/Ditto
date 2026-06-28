import type { DittoConfig, DeepPartial } from '@ditto/shared';
import { mergeConfig } from '@ditto/shared';
import { EventEmitter } from './event/emitter';
import { PersistenceStore } from './persistence/store';
import { IPCBus } from './ipc/bus';
import { PermissionManager } from './permission/manager';
import { ServiceRegistry } from './service-registry';
import { LifecycleOrchestrator } from './lifecycle-orchestrator';
import { AppCellManager } from './app-cell/manager';

export type KernelState = 'created' | 'initializing' | 'ready' | 'destroying' | 'destroyed';

/**
 * DittoKernel v2：以 Cell 为中心的服务编排器。
 *
 * 关键变更：
 * - 删除全局单例 getKernel()，改用 createKernel() 显式创建
 * - 用 ServiceRegistry 编排服务，而非硬挂成员
 * - 用 LifecycleOrchestrator 阶段化启动，单 stage 失败不中断
 * - AppCellManager 替代 PluginLoader + AppRuntime
 */
export class DittoKernel {
  readonly config: DittoConfig;
  readonly services: ServiceRegistry;
  readonly lifecycle: LifecycleOrchestrator;
  readonly events: EventEmitter;
  readonly store: PersistenceStore;
  readonly ipc: IPCBus;
  readonly permissions: PermissionManager;
  readonly cellManager: AppCellManager;

  private _state: KernelState = 'created';
  private containerEl: HTMLElement | null = null;

  constructor(config?: DeepPartial<DittoConfig>) {
    this.config = mergeConfig(config ?? {});
    this.services = new ServiceRegistry();
    this.lifecycle = new LifecycleOrchestrator();
    this.events = new EventEmitter();
    this.store = new PersistenceStore();
    this.ipc = new IPCBus(this.config.kernel.id);
    this.permissions = new PermissionManager({
      dev: this.config.kernel.dev ?? false,
      store: this.store,
    });

    // cellManager 在 init 时创建（需要 container）
    this.cellManager = null as unknown as AppCellManager;

    this.registerStages();
  }

  setContainer(element: HTMLElement): void {
    this.containerEl = element;
  }

  async init(): Promise<void> {
    if (this._state === 'ready') return;
    if (this._state === 'initializing') {
      throw new Error('[Ditto Kernel] Already initializing');
    }

    this._state = 'initializing';
    this.events.emit('kernel:initializing', undefined);

    try {
      await this.lifecycle.init(this);

      // 创建 cellManager（如果未创建）
      if (!(this.cellManager as unknown as AppCellManager)?.getAllCells) {
        const container = this.containerEl ?? document.body;
        (this as any).cellManager = new AppCellManager(this.ipc, this.permissions, container);
      }

      this._state = 'ready';
      this.events.emit('kernel:ready', undefined);
    } catch (e) {
      this._state = 'created';
      this.events.emit('kernel:error', e);
      throw e;
    }
  }

  isInitialized(): boolean {
    return this._state === 'ready';
  }

  get state(): KernelState {
    return this._state;
  }

  async destroy(): Promise<void> {
    if (this._state === 'destroyed' || this._state === 'destroying') return;

    this._state = 'destroying';
    this.events.emit('kernel:destroying', undefined);

    try {
      await this.lifecycle.destroy(this);
      await this.services.shutdown();
      this.ipc.destroy();
      this.events.removeAllListeners();
    } catch (e) {
      console.error('[Ditto Kernel] Error during destroy:', e);
    }

    this._state = 'destroyed';
  }

  private registerStages(): void {
    // storage stage
    this.lifecycle.onStage('storage', {
      onInit: () => {
        // PersistenceStore 已在构造函数创建，这里可加载持久化数据
      },
      onDestroy: () => {
        this.store.clear();
      },
    });

    // events stage（已构造，无需额外操作）
    this.lifecycle.onStage('events', {
      onInit: () => {},
    });

    // ipc stage
    this.lifecycle.onStage('ipc', {
      onInit: () => {
        this.services.register('ipc', () => this.ipc);
      },
    });

    // permissions stage
    this.lifecycle.onStage('permissions', {
      onInit: () => {
        this.permissions.loadFromStore();
        this.services.register('permissions', () => this.permissions);
      },
    });

    // services stage（阶段 2 注册更多服务）
    this.lifecycle.onStage('services', {
      onInit: () => {
        this.services.register('events', () => this.events);
        this.services.register('store', () => this.store);
      },
    });

    // cells stage
    this.lifecycle.onStage('cells', {
      onInit: () => {
        const container = this.containerEl ?? document.body;
        const cm = new AppCellManager(this.ipc, this.permissions, container);
        (this as any).cellManager = cm;
        this.services.register('cells', () => cm);
      },
      onDestroy: async () => {
        if ((this.cellManager as unknown as AppCellManager)?.destroy) {
          await (this.cellManager as unknown as AppCellManager).destroy();
        }
      },
    });
  }
}

export function createKernel(config?: DeepPartial<DittoConfig>): DittoKernel {
  return new DittoKernel(config);
}

// getKernel() 已删除（破坏性变更）。
// 迁移：import { createKernel } from '@ditto/core'; const kernel = createKernel(config);
