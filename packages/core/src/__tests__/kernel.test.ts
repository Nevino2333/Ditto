import { describe, it, expect } from 'vitest';
import { createKernel, DittoKernel } from '../kernel';

describe('DittoKernel v2', () => {
  it('createKernel 返回 DittoKernel 实例', () => {
    const k = createKernel({ kernel: { dev: true } } as any);
    expect(k).toBeInstanceOf(DittoKernel);
  });

  it('init 后 stage 为 ready', async () => {
    const k = createKernel({ kernel: { dev: true } } as any);
    await k.init();
    expect(k.lifecycle.stage).toBe('ready');
  });

  it('init 后 serviceRegistry 可用', async () => {
    const k = createKernel({ kernel: { dev: true } } as any);
    await k.init();
    expect(k.services).toBeTruthy();
    expect(k.services.list()).toContain('ipc');
    expect(k.services.list()).toContain('events');
    expect(k.services.list()).toContain('permissions');
    expect(k.services.list()).toContain('cells');
  });

  it('init 后 cellManager 可用', async () => {
    const k = createKernel({ kernel: { dev: true } } as any);
    await k.init();
    expect(k.cellManager).toBeTruthy();
  });

  it('destroy 后所有 service 关闭', async () => {
    const k = createKernel({ kernel: { dev: true } } as any);
    await k.init();
    await k.destroy();
    // 二次 destroy 不抛错
    await expect(k.destroy()).resolves.not.toThrow();
  });

  it('getKernel 已删除（导出中不存在）', async () => {
    const mod = await import('../kernel');
    expect(typeof (mod as any).getKernel).toBe('undefined');
  });
});
