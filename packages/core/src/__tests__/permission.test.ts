import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionManager } from '../permission/manager';
import type { Capability } from '@ditto/shared';

describe('PermissionManager v2', () => {
  let pm: PermissionManager;

  beforeEach(() => {
    pm = new PermissionManager({ dev: true }); // dev 模式自动授权
  });

  it('dev 模式下 request 自动授权', async () => {
    const granted = await pm.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(true);
    expect(pm.isGranted('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('生产模式下未授权返回 false', async () => {
    const prod = new PermissionManager({ dev: false });
    const granted = await prod.request('com.ditto.x', 'fs:write');
    expect(granted).toBe(false);
    expect(prod.isGranted('com.ditto.x', 'fs:write')).toBe(false);
  });

  it('grant/revoke 显式操作', () => {
    pm.grant('com.ditto.x', 'net:fetch');
    expect(pm.isGranted('com.ditto.x', 'net:fetch')).toBe(true);
    pm.revoke('com.ditto.x', 'net:fetch');
    expect(pm.isGranted('com.ditto.x', 'net:fetch')).toBe(false);
  });

  it('persist/loadFromStorage 往返', () => {
    pm.grant('com.ditto.x', 'fs:read');
    pm.grant('com.ditto.x', 'fs:write');
    const data = pm.persist();
    expect(data['com.ditto.x']).toEqual(['fs:read', 'fs:write']);

    const pm2 = new PermissionManager({ dev: false });
    pm2.loadFromStorage(data);
    expect(pm2.isGranted('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('不同应用权限隔离', () => {
    pm.grant('com.ditto.a', 'fs:read');
    expect(pm.isGranted('com.ditto.b', 'fs:read')).toBe(false);
  });

  it('生产模式无 interactivePrompt 时默认拒绝', async () => {
    const prod = new PermissionManager({ dev: false });
    const granted = await prod.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(false);
  });

  it('生产模式 interactivePrompt 用户授权后持久化', async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const prod = new PermissionManager({ dev: false, interactivePrompt: prompt });
    const granted = await prod.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(true);
    expect(prompt).toHaveBeenCalledWith('com.ditto.x', 'fs:read');
    expect(prod.isGranted('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('生产模式 interactivePrompt 用户拒绝返回 false', async () => {
    const prompt = vi.fn().mockResolvedValue(false);
    const prod = new PermissionManager({ dev: false, interactivePrompt: prompt });
    const granted = await prod.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(false);
    expect(prod.isGranted('com.ditto.x', 'fs:read')).toBe(false);
  });

  it('setInteractivePrompt 动态注入回调', async () => {
    const prod = new PermissionManager({ dev: false });
    // 初始无回调，拒绝
    expect(await prod.request('com.ditto.x', 'fs:read')).toBe(false);
    // 注入回调
    prod.setInteractivePrompt(async () => true);
    expect(await prod.request('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('已授权能力不触发 prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const prod = new PermissionManager({ dev: false, interactivePrompt: prompt });
    await prod.request('com.ditto.x', 'fs:read');
    prompt.mockClear();
    // 第二次请求已授权能力
    const granted = await prod.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });
});
