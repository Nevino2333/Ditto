import { describe, it, expect, vi } from 'vitest';
import { LifecycleOrchestrator, type LifecycleStage } from '../lifecycle-orchestrator';

describe('LifecycleOrchestrator', () => {
  it('init 按顺序执行所有 stage', async () => {
    const order: LifecycleStage[] = [];
    const orch = new LifecycleOrchestrator();
    for (const stage of ['storage', 'events', 'ipc', 'permissions', 'services', 'cells', 'ready'] as LifecycleStage[]) {
      orch.onStage(stage, () => { order.push(stage); });
    }
    await orch.init({} as any);
    expect(order).toEqual(['storage', 'events', 'ipc', 'permissions', 'services', 'cells', 'ready']);
  });

  it('单 stage 失败不中断后续', async () => {
    const orch = new LifecycleOrchestrator();
    const errors: string[] = [];
    orch.onStage('ipc', () => { throw new Error('ipc boom'); });
    orch.onStage('permissions', () => { errors.push('reached'); });
    await orch.init({} as any);
    expect(errors).toEqual(['reached']);
  });

  it('destroy 逆序执行所有 stage（含失败）', async () => {
    const order: string[] = [];
    const orch = new LifecycleOrchestrator();
    orch.onStage('storage', { onDestroy: () => { order.push('storage'); } } as any);
    orch.onStage('ipc', { onDestroy: () => { throw new Error('x'); } } as any);
    orch.onStage('events', { onDestroy: () => { order.push('events'); } } as any);
    await orch.init({} as any);
    await orch.destroy({} as any);
    expect(order).toEqual(['events', 'storage']); // 逆序，ipc 失败但继续
  });

  it('init 后 stage 为 ready', async () => {
    const orch = new LifecycleOrchestrator();
    await orch.init({} as any);
    expect(orch.stage).toBe('ready');
  });
});
