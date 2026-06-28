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
});
