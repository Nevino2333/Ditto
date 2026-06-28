import { describe, it, expect, vi } from 'vitest';
import { ClientCell } from '../app-cell/cell';
import type { AppManifest, CellRuntimeConfig } from '@ditto/shared';

const manifest: AppManifest = {
  id: 'com.ditto.test',
  name: 'Test',
  version: '1.0.0',
  entry: '/index.html',
  sandbox: 'trusted',
  permissions: [],
  window: { width: 800, height: 600 },
};

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('ClientCell', () => {
  it('native 类型：loading → active → stopped', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    expect(cell.status).toBe('loading');
    await cell.activate();
    expect(cell.status).toBe('active');
    await cell.unload();
    expect(cell.status).toBe('stopped');
    document.body.removeChild(container);
  });

  it('activate 失败 → error 状态', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => { throw new Error('load fail'); } };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    expect(cell.status).toBe('error');
    expect(cell.error?.message).toContain('load fail');
    document.body.removeChild(container);
  });

  it('onError 触发', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => { throw new Error('x'); } };
    const cell = new ClientCell(manifest, config, { container });
    const fn = vi.fn();
    cell.onError(fn);
    await cell.activate();
    expect(fn).toHaveBeenCalled();
    document.body.removeChild(container);
  });

  it('pause/resume：active → paused → active', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    expect(cell.status).toBe('active');

    const pausedFn = vi.fn();
    const resumedFn = vi.fn();
    cell.onPaused(pausedFn);
    cell.onResumed(resumedFn);

    await cell.pause();
    expect(cell.status).toBe('paused');
    expect(pausedFn).toHaveBeenCalledTimes(1);

    await cell.resume();
    expect(cell.status).toBe('active');
    expect(resumedFn).toHaveBeenCalledTimes(1);

    await cell.unload();
    document.body.removeChild(container);
  });

  it('pause 幂等：重复 pause 不抛错', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    await cell.pause();
    await cell.pause(); // 已 paused，不抛错
    expect(cell.status).toBe('paused');
    await cell.unload();
    document.body.removeChild(container);
  });

  it('非法状态转换：loading → paused 抛错', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    expect(cell.status).toBe('loading');
    await expect(cell.pause()).rejects.toThrow(/Invalid cell state transition/);
    document.body.removeChild(container);
  });

  it('unload 幂等', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    await cell.unload();
    await cell.unload(); // 不抛错
    expect(cell.status).toBe('stopped');
    document.body.removeChild(container);
  });
});
