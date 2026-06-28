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

  it('pause/resume 阶段 1 抛 NotSupported', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    await expect(cell.pause()).rejects.toThrow(/stage 2/i);
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
