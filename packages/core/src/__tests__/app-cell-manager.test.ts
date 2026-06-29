import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppCellManager } from '../app-cell/manager';
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

// mock WebSocket：避免真实网络连接
class MockWS {
  static instances: MockWS[] = [];
  static OPEN = 1;
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sent: any[] = [];
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.readyState = 3; this.onclose?.({}); }
}

describe('AppCellManager', () => {
  let mgr: AppCellManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const ipc = { onDispatch: () => () => {}, send: vi.fn(), handleMessage: vi.fn() } as any;
    const perm = { request: async () => true } as any;
    mgr = new AppCellManager(ipc, perm, container);
    MockWS.instances = [];
    (global as any).WebSocket = MockWS;
  });
  afterEach(() => {
    delete (global as any).WebSocket;
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

  it('getActiveCells 只返回 active 状态的 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    expect(mgr.getActiveCells()).toHaveLength(2);
    await mgr.pauseCell('a');
    expect(mgr.getActiveCells()).toHaveLength(1);
    expect(mgr.getActiveCells()[0].appId).toBe('b');
  });

  it('pauseCell/resumeCell 切换状态', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    expect(mgr.getCell(manifest.id)?.status).toBe('active');
    await mgr.pauseCell(manifest.id);
    expect(mgr.getCell(manifest.id)?.status).toBe('paused');
    await mgr.resumeCell(manifest.id);
    expect(mgr.getCell(manifest.id)?.status).toBe('active');
  });

  it('pauseCell 不存在的 Cell 不抛错', async () => {
    await expect(mgr.pauseCell('nonexistent')).resolves.toBeUndefined();
  });

  it('resumeCell 不存在的 Cell 不抛错', async () => {
    await expect(mgr.resumeCell('nonexistent')).resolves.toBeUndefined();
  });

  it('stopCell 不存在的 Cell 不抛错', async () => {
    await expect(mgr.stopCell('nonexistent')).resolves.toBeUndefined();
  });

  it('onCellEvent 触发', async () => {
    const fn = vi.fn();
    mgr.onCellEvent('cell:active', fn);
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    expect(fn).toHaveBeenCalled();
  });

  it('onCellEvent cell:stopped 在 stopCell 后触发', async () => {
    const fn = vi.fn();
    mgr.onCellEvent('cell:stopped', fn);
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    await mgr.stopCell(manifest.id);
    expect(fn).toHaveBeenCalled();
  });

  it('destroy 停止所有 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    await mgr.destroy();
    expect(mgr.getAllCells()).toHaveLength(0);
  });

  // ===== dit 类型：bridge 自动连接 =====
  it('dit 类型：startCell 自动创建并连接 CellBridge', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const config: CellRuntimeConfig = {
      type: 'dit',
      origin: 'http://localhost:3001',
      backendCell: true,
    };
    const cell = await mgr.startCell(manifest.id, manifest, config);
    expect(cell.status).toBe('active');
    // 验证 WebSocket 已创建
    expect(MockWS.instances.length).toBe(1);
    expect(MockWS.instances[0].url).toContain('ws://localhost:3001/ws');
    await mgr.stopCell(manifest.id);
    fetchSpy.mockRestore();
  });

  it('dit 类型：stopCell 断开 bridge', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const config: CellRuntimeConfig = {
      type: 'dit',
      origin: 'http://localhost:3001',
      backendCell: true,
    };
    await mgr.startCell(manifest.id, manifest, config);
    const ws = MockWS.instances[0];
    expect(ws.readyState).toBe(1);
    await mgr.stopCell(manifest.id);
    // WS 应已关闭
    expect(ws.readyState).toBe(3);
    fetchSpy.mockRestore();
  });

  it('权限请求时调用 PermissionManager.request', async () => {
    const requestFn = vi.fn().mockResolvedValue(true);
    const perm = { request: requestFn } as any;
    const mgrWithPerm = new AppCellManager(
      { onDispatch: () => () => {}, send: vi.fn(), handleMessage: vi.fn() } as any,
      perm,
      container,
    );
    const manifestWithPerms: AppManifest = {
      ...manifest,
      id: 'com.ditto.perm-test',
      permissions: ['fs:read', 'fs:write'],
    };
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgrWithPerm.startCell(manifestWithPerms.id, manifestWithPerms, config);
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(requestFn).toHaveBeenNthCalledWith(1, 'com.ditto.perm-test', 'fs:read');
    expect(requestFn).toHaveBeenNthCalledWith(2, 'com.ditto.perm-test', 'fs:write');
    await mgrWithPerm.destroy();
  });
});
