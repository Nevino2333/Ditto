import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CellMembrane } from '../server/src/services/app-cell/cell-membrane';

// 创建最小化 Hono Context mock
function makeCtx(opts: { authHeader?: string; userId?: string; path?: string } = {}): any {
  const headers: Record<string, string> = {};
  if (opts.authHeader) headers['Authorization'] = opts.authHeader;
  if (opts.userId) headers['X-User-Id'] = opts.userId;
  return {
    req: {
      header: (name: string) => headers[name],
      path: opts.path ?? '/api/cell/com.ditto.test/data',
    },
    header: vi.fn(),
    set: vi.fn(),
    json: vi.fn().mockImplementation((data: any, status?: number) => ({ data, status })),
  };
}

describe('CellMembrane', () => {
  let membrane: CellMembrane;

  beforeEach(() => {
    membrane = new CellMembrane('com.ditto.test');
  });

  it('构造时初始化 appId 与默认配置', () => {
    const stats = membrane.getStats();
    expect(stats.appId).toBe('com.ditto.test');
    expect(stats.totalRequests).toBe(0);
    expect(stats.blockedRequests).toBe(0);
  });

  it('extractUserId：X-User-Id 合法时返回', () => {
    const ctx = makeCtx({ userId: 'user-123' });
    expect(membrane.extractUserId(ctx)).toBe('user-123');
  });

  it('extractUserId：X-User-Id 含非法字符时返回 undefined', () => {
    const ctx = makeCtx({ userId: 'user;drop' });
    expect(membrane.extractUserId(ctx)).toBeUndefined();
  });

  it('extractUserId：X-User-Id 为空字符串时返回 undefined', () => {
    const ctx = makeCtx({ userId: '' });
    expect(membrane.extractUserId(ctx)).toBeUndefined();
  });

  it('extractUserId：Bearer JWT 合法时解析 sub', () => {
    // 构造最小化 JWT：header.payload.signature
    const payload = btoa(JSON.stringify({ sub: 'user-from-jwt' }));
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    const ctx = makeCtx({ authHeader: `Bearer ${token}` });
    expect(membrane.extractUserId(ctx)).toBe('user-from-jwt');
  });

  it('extractUserId：Bearer 非法 token 返回 undefined', () => {
    const ctx = makeCtx({ authHeader: 'Bearer short' });
    expect(membrane.extractUserId(ctx)).toBeUndefined();
  });

  it('extractUserId：Basic Auth 解码出 userId', () => {
    const encoded = btoa('alice:secret');
    const ctx = makeCtx({ authHeader: `Basic ${encoded}` });
    expect(membrane.extractUserId(ctx)).toBe('alice');
  });

  it('extractUserId：无任何凭证返回 undefined', () => {
    const ctx = makeCtx();
    expect(membrane.extractUserId(ctx)).toBeUndefined();
  });

  it('中间件：authRequired 但无 userId 时返回 401', async () => {
    const mw = membrane.createMiddleware();
    const ctx = makeCtx();
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Authentication required' }),
      401
    );
    expect(next).not.toHaveBeenCalled();
    expect(membrane.getStats().authFailures).toBe(1);
    expect(membrane.getStats().blockedRequests).toBe(1);
    expect(membrane.getStats().totalRequests).toBe(1);
  });

  it('中间件：有 userId 时调用 next 并注入安全响应头', async () => {
    const mw = membrane.createMiddleware();
    const ctx = makeCtx({ userId: 'alice' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    // 应设置 userId 到 context
    expect(ctx.set).toHaveBeenCalledWith('userId', 'alice');
    expect(ctx.set).toHaveBeenCalledWith('appId', 'com.ditto.test');
    // 应注入安全响应头
    expect(ctx.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(ctx.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('中间件：authRequired=false 时无凭证也通过', async () => {
    membrane.updateConfig({ authRequired: false });
    const mw = membrane.createMiddleware();
    const ctx = makeCtx();
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('setAllowedPaths：路径不在白名单返回 403', async () => {
    membrane.setAllowedPaths(['/health', '/counter']);
    const mw = membrane.createMiddleware();
    const ctx = makeCtx({ userId: 'alice', path: '/api/cell/com.ditto.test/forbidden' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Path not allowed' }),
      403
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('setAllowedPaths：路径在白名单通过', async () => {
    membrane.setAllowedPaths(['/health', '/counter']);
    const mw = membrane.createMiddleware();
    const ctx = makeCtx({ userId: 'alice', path: '/api/cell/com.ditto.test/health' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('setAllowedPaths：通配符 /* 允许所有路径', async () => {
    membrane.setAllowedPaths(['/*']);
    const mw = membrane.createMiddleware();
    const ctx = makeCtx({ userId: 'alice', path: '/api/cell/com.ditto.test/anywhere' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('setAllowedPaths：通配符 /api/* 允许匹配前缀的路径', async () => {
    membrane.setAllowedPaths(['/api/*']);
    const mw = membrane.createMiddleware();
    const ctx = makeCtx({ userId: 'alice', path: '/api/cell/com.ditto.test/api/users' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('updateConfig 修改配置生效', async () => {
    membrane.updateConfig({ authRequired: false, maxRequestBodyBytes: 1024 });
    const mw = membrane.createMiddleware();
    const ctx = makeCtx();
    const next = vi.fn();
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('getStats 累计请求数', async () => {
    const mw = membrane.createMiddleware();
    // 3 次请求：1 次失败（无凭证），2 次成功
    await mw(makeCtx(), vi.fn());
    await mw(makeCtx({ userId: 'a' }), vi.fn());
    await mw(makeCtx({ userId: 'b' }), vi.fn());
    const stats = membrane.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.blockedRequests).toBe(1);
    expect(stats.authFailures).toBe(1);
  });

  it('流量整形：超过速率限制返回 429', async () => {
    const trafficShaper = {
      checkRate: vi.fn().mockReturnValue({ allowed: false, retryAfterMs: 5000 }),
    };
    const membraneWithShaper = new CellMembrane('com.ditto.test', {}, { trafficShaper: trafficShaper as any });
    const mw = membraneWithShaper.createMiddleware();
    const ctx = makeCtx({ userId: 'alice' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too many requests' }),
      429
    );
    expect(ctx.header).toHaveBeenCalledWith('Retry-After', '5');
    expect(next).not.toHaveBeenCalled();
    expect(membraneWithShaper.getStats().rateLimitedRequests).toBe(1);
  });

  it('配额超限返回 429', async () => {
    const quotaManager = {
      isOverQuota: vi.fn().mockReturnValue(true),
      recordRequest: vi.fn(),
      releaseConnection: vi.fn(),
    };
    const membraneWithQuota = new CellMembrane('com.ditto.test', {}, { quotaManager: quotaManager as any });
    const mw = membraneWithQuota.createMiddleware();
    const ctx = makeCtx({ userId: 'alice' });
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Resource quota exceeded' }),
      429
    );
    expect(next).not.toHaveBeenCalled();
    expect(membraneWithQuota.getStats().quotaExceededRequests).toBe(1);
  });

  it('配额未超限时调用 recordRequest', async () => {
    const quotaManager = {
      isOverQuota: vi.fn().mockReturnValue(false),
      recordRequest: vi.fn(),
      releaseConnection: vi.fn(),
    };
    const membraneWithQuota = new CellMembrane('com.ditto.test', {}, { quotaManager: quotaManager as any });
    const mw = membraneWithQuota.createMiddleware();
    const ctx = makeCtx({ userId: 'alice' });
    await mw(ctx, vi.fn());
    expect(quotaManager.recordRequest).toHaveBeenCalledWith('com.ditto.test', 'alice');
    expect(quotaManager.releaseConnection).toHaveBeenCalledWith('com.ditto.test', 'alice');
  });
});
