import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppCellManager } from '../app-cell/manager';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../permission/manager';
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

describe('AppCellManager', () => {
  let mgr: AppCellManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const ipc = { onDispatch: () => () => {}, send: vi.fn() } as any;
    const perm = { request: async () => true } as any;
    mgr = new AppCellManager(ipc, perm, container);
  });

  it('startCell 创建并激活 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = await mgr.startCell(manifest.id, manifest, config);
    expect(cell.status).toBe('active');
    expect(mgr.getCell(manifest.id)).toBe(cell);
  });

  it('重复 startCell 抛错', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    await expect(mgr.startCell(manifest.id, manifest, config)).rejects.toThrow();
  });

  it('stopCell 停止并移除', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    await mgr.stopCell(manifest.id);
    expect(mgr.getCell(manifest.id)).toBeUndefined();
  });

  it('getAllCells 返回所有', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    expect(mgr.getAllCells()).toHaveLength(2);
  });

  it('onCellEvent 触发', async () => {
    const fn = vi.fn();
    mgr.onCellEvent('cell:active', fn);
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    expect(fn).toHaveBeenCalled();
  });

  it('destroy 停止所有 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    await mgr.destroy();
    expect(mgr.getAllCells()).toHaveLength(0);
  });
});
