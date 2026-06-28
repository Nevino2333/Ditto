import { EventEmitter } from './event/emitter';

export type LifecycleStage =
  | 'storage'
  | 'events'
  | 'ipc'
  | 'permissions'
  | 'services'
  | 'cells'
  | 'ready';

export interface StageHandler {
  onInit?: () => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}

const STAGE_ORDER: LifecycleStage[] = [
  'storage',
  'events',
  'ipc',
  'permissions',
  'services',
  'cells',
  'ready',
];

/**
 * 阶段化生命周期编排。
 * - init 按 STAGE_ORDER 顺序执行 onInit
 * - destroy 逆序执行 onDestroy
 * - 单 stage 失败不中断后续（错误隔离）
 */
export class LifecycleOrchestrator {
  private _stage: LifecycleStage = 'storage';
  private handlers = new Map<LifecycleStage, StageHandler[]>();
  private emitter = new EventEmitter();

  get stage(): LifecycleStage {
    return this._stage;
  }

  onStage(stage: LifecycleStage, handler: StageHandler | (() => void | Promise<void>)): () => void {
    const h: StageHandler = typeof handler === 'function' ? { onInit: handler } : handler;
    if (!this.handlers.has(stage)) {
      this.handlers.set(stage, []);
    }
    this.handlers.get(stage)!.push(h);
    return () => {
      const arr = this.handlers.get(stage);
      if (arr) {
        const idx = arr.indexOf(h);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  onStageError(handler: (stage: LifecycleStage, error: unknown) => void): () => void {
    return this.emitter.on('stage-error', handler as any);
  }

  async init(kernel: unknown): Promise<void> {
    for (const stage of STAGE_ORDER) {
      this._stage = stage;
      const handlers = this.handlers.get(stage) ?? [];
      for (const h of handlers) {
        if (h.onInit) {
          try {
            await h.onInit();
          } catch (e) {
            console.error(`[Ditto Lifecycle] stage "${stage}" init failed:`, e);
            this.emitter.emit('stage-error', { stage, error: e });
            // 不中断，继续下一 stage
          }
        }
      }
    }
    this._stage = 'ready';
  }

  async destroy(kernel: unknown): Promise<void> {
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      const stage = STAGE_ORDER[i];
      const handlers = this.handlers.get(stage) ?? [];
      for (const h of handlers) {
        if (h.onDestroy) {
          try {
            await h.onDestroy();
          } catch (e) {
            console.error(`[Ditto Lifecycle] stage "${stage}" destroy failed:`, e);
            this.emitter.emit('stage-error', { stage, error: e });
          }
        }
      }
    }
  }
}
