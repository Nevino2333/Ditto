import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CellRouter } from '../server/src/services/app-cell/cell-router';

describe('CellRouter', () => {
  let router: CellRouter;

  beforeEach(() => {
    router = new CellRouter();
  });

  it('get/post/put/delete 注册路由', () => {
    router.get('/list', vi.fn());
    router.post('/create', vi.fn());
    router.put('/update', vi.fn());
    router.delete('/remove', vi.fn());

    const routes = router.getRoutes();
    expect(routes).toHaveLength(4);
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/list' });
    expect(routes[1]).toMatchObject({ method: 'POST', path: '/create' });
    expect(routes[2]).toMatchObject({ method: 'PUT', path: '/update' });
    expect(routes[3]).toMatchObject({ method: 'DELETE', path: '/remove' });
  });

  it('getRoutes 返回数组副本（不可外部修改）', () => {
    router.get('/a', vi.fn());
    const routes = router.getRoutes();
    routes.push({ method: 'POST', path: '/b', handler: vi.fn() });
    // 再次获取应为原始长度
    expect(router.getRoutes()).toHaveLength(1);
  });

  it('ws 注册 WebSocket 路由', () => {
    const handler = vi.fn();
    router.ws('/realtime', handler);
    const wsRoutes = router.getWSRoutes();
    expect(wsRoutes).toHaveLength(1);
    expect(wsRoutes[0]).toMatchObject({ path: '/realtime', handler });
  });

  it('getWSRoutes 返回数组副本', () => {
    router.ws('/a', vi.fn());
    const wsRoutes = router.getWSRoutes();
    wsRoutes.push({ path: '/b', handler: vi.fn() });
    expect(router.getWSRoutes()).toHaveLength(1);
  });

  it('middleware 注册中间件', () => {
    const mw1 = vi.fn().mockResolvedValue(undefined);
    const mw2 = vi.fn().mockResolvedValue(undefined);
    router.middleware(mw1);
    router.middleware(mw2);
    expect(router.getMiddlewares()).toHaveLength(2);
  });

  it('setOnRequest 设置请求回调', () => {
    const fn = vi.fn();
    router.setOnRequest(fn);
    // 仅验证 setter 不抛错；实际触发在 applyToHono 中
    expect(() => router.setOnRequest(fn)).not.toThrow();
  });

  it('applyToHono 在 Hono 实例上注册路由', async () => {
    // 使用最小化的 mock Hono
    const handlers: Record<string, Function> = {};
    const mockApp = {
      get: (path: string, h: Function) => { handlers[`GET ${path}`] = h; },
      post: (path: string, h: Function) => { handlers[`POST ${path}`] = h; },
      put: (path: string, h: Function) => { handlers[`PUT ${path}`] = h; },
      delete: (path: string, h: Function) => { handlers[`DELETE ${path}`] = h; },
    };

    const handler = vi.fn(async (req: any, res: any) => {
      res.status(200).json({ ok: true, value: req.body?.x });
    });
    router.post('/echo', handler);
    router.applyToHono(mockApp as any, '/api/cell/com.ditto.test');

    // 验证 Hono 注册了正确路径
    expect(handlers['POST /api/cell/com.ditto.test/echo']).toBeDefined();

    // 模拟请求
    const c = {
      req: {
        method: 'POST',
        path: '/api/cell/com.ditto.test/echo',
        header: () => 'application/json',
        query: () => ({}),
        param: () => ({}),
        json: async () => ({ x: 42 }),
      },
      get: () => undefined,
      json: (data: any, status?: number) => ({ data, status }),
    };
    const result = await handlers['POST /api/cell/com.ditto.test/echo'](c);
    expect(handler).toHaveBeenCalled();
    expect(result.data).toEqual({ ok: true, value: 42 });
  });

  it('applyToHono：handler 抛错时返回 500 错误', async () => {
    const handlers: Record<string, Function> = {};
    const mockApp = {
      get: (path: string, h: Function) => { handlers[`GET ${path}`] = h; },
      post: () => {},
      put: () => {},
      delete: () => {},
    };
    router.get('/fail', vi.fn().mockImplementation(async () => { throw new Error('boom'); }));
    router.applyToHono(mockApp as any, '/api/cell/x');

    const c = {
      req: {
        method: 'GET',
        path: '/api/cell/x/fail',
        header: () => '',
        query: () => ({}),
        param: () => ({}),
      },
      get: () => undefined,
      json: (data: any, status?: number) => ({ data, status }),
    };
    const result = await handlers['GET /api/cell/x/fail'](c);
    expect(result.status).toBe(500);
    expect(result.data.error).toBe('Internal cell error');
    expect(result.data.message).toBe('boom');
  });

  it('applyToHono：中间件返回响应时短路并返回 403', async () => {
    const handlers: Record<string, Function> = {};
    const mockApp = {
      get: (path: string, h: Function) => { handlers[`GET ${path}`] = h; },
      post: () => {}, put: () => {}, delete: () => {},
    };
    // 中间件返回响应（拒绝）
    router.middleware(vi.fn().mockResolvedValue({ error: 'forbidden' }));
    const routeHandler = vi.fn();
    router.get('/secure', routeHandler);
    router.applyToHono(mockApp as any, '/api/cell/secure');

    const c = {
      req: {
        method: 'GET',
        path: '/api/cell/secure/secure',
        header: () => '',
        query: () => ({}),
        param: () => ({}),
      },
      get: () => undefined,
      json: (data: any, status?: number) => ({ data, status }),
    };
    const result = await handlers['GET /api/cell/secure/secure'](c);
    expect(result.status).toBe(403);
    // 路由 handler 不应被调用
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it('applyToHono：onRequest 回调在每次请求时触发', async () => {
    const handlers: Record<string, Function> = {};
    const mockApp = {
      get: (path: string, h: Function) => { handlers[`GET ${path}`] = h; },
      post: () => {}, put: () => {}, delete: () => {},
    };
    const onRequest = vi.fn();
    router.setOnRequest(onRequest);
    router.get('/ping', vi.fn().mockImplementation(async (_req: any, res: any) => { res.json({ ok: 1 }); }));
    router.applyToHono(mockApp as any, '/api/cell/x');

    const c = {
      req: { method: 'GET', path: '/api/cell/x/ping', header: () => '', query: () => ({}), param: () => ({}) },
      get: () => undefined,
      json: (data: any) => ({ data }),
    };
    await handlers['GET /api/cell/x/ping'](c);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });
});
