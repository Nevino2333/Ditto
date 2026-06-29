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

  // ===== web 类型 =====
  it('web 类型：loading → active → stopped（iframe 沙盒挂载）', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = {
      type: 'web',
      url: 'https://example.com/app',
      origin: 'https://example.com',
    };
    const cell = new ClientCell(manifest, config, { container });
    expect(cell.status).toBe('loading');
    await cell.activate();
    expect(cell.status).toBe('active');
    // 验证 iframe 已挂载
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/app');
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    await cell.unload();
    expect(cell.status).toBe('stopped');
    // 验证 iframe 已移除
    expect(container.querySelector('iframe')).toBeNull();
    document.body.removeChild(container);
  });

  it('web 类型：pause 隐藏 iframe，resume 恢复显示', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = {
      type: 'web',
      url: 'https://example.com/app',
      origin: 'https://example.com',
    };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    const iframe = container.querySelector('iframe')!;
    expect(iframe.style.display).toBe('block');
    await cell.pause();
    expect(iframe.style.display).toBe('none');
    await cell.resume();
    expect(iframe.style.display).toBe('block');
    await cell.unload();
    document.body.removeChild(container);
  });

  // ===== pwa 类型 =====
  it('pwa 类型：使用 startUrl 挂载 iframe', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = {
      type: 'pwa',
      manifestUrl: 'https://app.example.com/manifest.json',
      startUrl: 'https://app.example.com/index.html',
    };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    expect(cell.status).toBe('active');
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://app.example.com/index.html');
    await cell.unload();
    document.body.removeChild(container);
  });

  it('pwa 类型：未提供 startUrl 时回退到 manifestUrl', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = {
      type: 'pwa',
      manifestUrl: 'https://app.example.com/manifest.json',
    };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://app.example.com/manifest.json');
    await cell.unload();
    document.body.removeChild(container);
  });

  // ===== dit 类型 =====
  it('dit 类型：激活后挂载前端 iframe 并调用 bridge.notifyStart', async () => {
    const container = makeContainer();
    const bridge = {
      notifyStart: vi.fn().mockResolvedValue(undefined),
      notifyStop: vi.fn().mockResolvedValue(undefined),
      notifyHibernate: vi.fn().mockResolvedValue(undefined),
      notifyWake: vi.fn().mockResolvedValue(undefined),
    };
    const config: CellRuntimeConfig = {
      type: 'dit',
      origin: 'http://localhost:3001',
      backendCell: true,
    };
    const cell = new ClientCell(manifest, config, { container, bridge: bridge as any });
    await cell.activate();
    expect(cell.status).toBe('active');
    // 验证 iframe URL 指向前端
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('http://localhost:3001/api/apps/com.ditto.test/frontend/index.html');
    // 验证调用了 notifyStart
    expect(bridge.notifyStart).toHaveBeenCalledWith('com.ditto.test');
    await cell.unload();
    // 验证卸载时调用了 notifyStop
    expect(bridge.notifyStop).toHaveBeenCalledWith('com.ditto.test');
    document.body.removeChild(container);
  });

  it('dit 类型：pause 调用 notifyHibernate，resume 调用 notifyWake', async () => {
    const container = makeContainer();
    const bridge = {
      notifyStart: vi.fn().mockResolvedValue(undefined),
      notifyStop: vi.fn().mockResolvedValue(undefined),
      notifyHibernate: vi.fn().mockResolvedValue(undefined),
      notifyWake: vi.fn().mockResolvedValue(undefined),
    };
    const config: CellRuntimeConfig = {
      type: 'dit',
      origin: 'http://localhost:3001',
      backendCell: true,
    };
    const cell = new ClientCell(manifest, config, { container, bridge: bridge as any });
    await cell.activate();
    await cell.pause();
    expect(bridge.notifyHibernate).toHaveBeenCalledWith('com.ditto.test');
    await cell.resume();
    expect(bridge.notifyWake).toHaveBeenCalledWith('com.ditto.test');
    await cell.unload();
    document.body.removeChild(container);
  });

  it('dit 类型：未提供 bridge 时不抛错（仅前端模式）', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = {
      type: 'dit',
      origin: 'http://localhost:3001',
      backendCell: false,
    };
    const cell = new ClientCell(manifest, config, { container });
    await cell.activate();
    expect(cell.status).toBe('active');
    await cell.unload();
    document.body.removeChild(container);
  });

  // ===== 权限请求 =====
  it('激活时调用 requestPermission 回调', async () => {
    const container = makeContainer();
    const requestPermission = vi.fn().mockResolvedValue(true);
    const manifestWithPerms: AppManifest = {
      ...manifest,
      permissions: ['fs:read', 'net:fetch'],
    };
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifestWithPerms, config, { container, requestPermission });
    await cell.activate();
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(requestPermission).toHaveBeenNthCalledWith(1, 'fs:read');
    expect(requestPermission).toHaveBeenNthCalledWith(2, 'net:fetch');
    await cell.unload();
    document.body.removeChild(container);
  });

  // ===== 事件 =====
  it('onActive/onStopped/onPaused/onResumed 事件触发', async () => {
    const container = makeContainer();
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { container });
    const activeFn = vi.fn();
    const pausedFn = vi.fn();
    const resumedFn = vi.fn();
    const stoppedFn = vi.fn();
    cell.onActive(activeFn);
    cell.onPaused(pausedFn);
    cell.onResumed(resumedFn);
    cell.onStopped(stoppedFn);
    await cell.activate();
    expect(activeFn).toHaveBeenCalledTimes(1);
    await cell.pause();
    expect(pausedFn).toHaveBeenCalledTimes(1);
    await cell.resume();
    expect(resumedFn).toHaveBeenCalledTimes(1);
    await cell.unload();
    expect(stoppedFn).toHaveBeenCalledTimes(1);
    document.body.removeChild(container);
  });
});
