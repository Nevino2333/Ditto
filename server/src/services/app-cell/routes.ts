import { Hono } from 'hono';
import type { AppCellManager } from './manager';
import type { ResourceQuotaManager } from '../resource-fabric/quota';
import type { TrafficShaper } from '../resource-fabric/traffic-shaper';
import type { ElasticScaler } from '../resource-fabric/elastic-scaler';
import { CellMembrane } from './cell-membrane';

type Variables = {
  userId?: string;
  appId?: string;
};

interface CellRouteDeps {
  cellManager: AppCellManager;
  quotaManager: ResourceQuotaManager;
  trafficShaper: TrafficShaper;
  elasticScaler: ElasticScaler;
}

export function createCellRoutes(deps: CellRouteDeps): Hono<{ Variables: Variables }> {
  const router = new Hono<{ Variables: Variables }>();
  const { cellManager, quotaManager, trafficShaper, elasticScaler } = deps;

  const membranes = new Map<string, CellMembrane>();

  function getMembrane(appId: string): CellMembrane {
    if (!membranes.has(appId)) {
      const membrane = new CellMembrane(appId, {}, { trafficShaper, quotaManager });
      membranes.set(appId, membrane);
    }
    return membranes.get(appId)!;
  }

  router.get('/health', (c) => {
    const cells = cellManager.getAllCells();
    const running = cells.filter(c => c.status === 'running').length;
    const hibernated = cells.filter(c => c.status === 'hibernated').length;
    return c.json({
      status: 'ok',
      totalCells: cells.length,
      runningCells: running,
      hibernatedCells: hibernated,
    });
  });

  router.get('/membrane/:appId', (c) => {
    const appId = c.req.param('appId');
    const membrane = membranes.get(appId);
    if (!membrane) {
      return c.json({ error: 'No membrane for this app' }, 404);
    }
    return c.json(membrane.getStats());
  });

  router.get('/:appId/health', async (c) => {
    const appId = c.req.param('appId');
    const cells = cellManager.getCellsByApp(appId);
    if (cells.length === 0) {
      const installed = cellManager.getInstalledApp(appId);
      if (installed) {
        return c.json({
          status: 'installed',
          appId,
          hasBackend: !!installed.manifest.backend,
        });
      }
      return c.json({ status: 'not_found', appId }, 404);
    }

    const runningCells = cells.filter(cell => cell.toCellInstance().status === 'running');
    const hibernatedCells = cells.filter(cell => cell.toCellInstance().status === 'hibernated');

    return c.json({
      status: runningCells.length > 0 ? 'running' : hibernatedCells.length > 0 ? 'hibernated' : 'not_running',
      appId,
      runningCells: runningCells.length,
      hibernatedCells: hibernatedCells.length,
      cells: cells.map(cell => ({
        cellId: cell.toCellInstance().cellId,
        status: cell.toCellInstance().status,
        memoryUsageMB: cell.getMemoryUsageMB(),
        cpuUsage: cell.getCpuUsage(),
        requestCount: cell.getRequestCount(),
        userIds: cell.toCellInstance().userIds,
      })),
    });
  });

  router.post('/:appId/start', async (c) => {
    const appId = c.req.param('appId');
    const membrane = getMembrane(appId);
    const userId = membrane.extractUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required', hint: 'Provide Authorization header or X-User-Id' }, 401);
    }

    const quotaCheck = quotaManager.checkQuota(appId, userId);
    if (!quotaCheck.allowed) {
      return c.json({
        error: quotaCheck.reason,
        suggestion: 'Close other apps to free resources',
      }, 503);
    }

    try {
      quotaManager.allocateQuota(appId, userId);
      trafficShaper.registerApp(appId);
      elasticScaler.registerCell(appId, userId);

      const cell = await cellManager.startCellForUser(appId, userId);
      const instance = cell.toCellInstance();

      return c.json({
        success: true,
        cellId: instance.cellId,
        appId,
        status: instance.status,
      });
    } catch (e) {
      quotaManager.releaseQuota(appId, userId);
      return c.json({ error: e instanceof Error ? e.message : 'Failed to start cell' }, 500);
    }
  });

  router.post('/:appId/stop', async (c) => {
    const appId = c.req.param('appId');
    const membrane = getMembrane(appId);
    const userId = membrane.extractUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    await cellManager.stopCellForUser(appId, userId);
    quotaManager.releaseQuota(appId, userId);
    elasticScaler.unregisterCell(appId, userId);

    const remainingCells = cellManager.getCellsByApp(appId);
    if (remainingCells.length === 0) {
      trafficShaper.unregisterApp(appId);
    }

    return c.json({ success: true, appId });
  });

  router.get('/:appId/status', (c) => {
    const appId = c.req.param('appId');
    const cells = cellManager.getCellsByApp(appId);
    return c.json({
      appId,
      cells: cells.map(cell => ({
        ...cell.toCellInstance(),
        memoryUsageMB: cell.getMemoryUsageMB(),
        cpuUsage: cell.getCpuUsage(),
        requestCount: cell.getRequestCount(),
      })),
    });
  });

  router.post('/:appId/hibernate', async (c) => {
    const appId = c.req.param('appId');
    const cells = cellManager.getCellsByApp(appId);
    for (const cell of cells) {
      await cellManager.hibernateCell(cell.toCellInstance().cellId);
    }
    return c.json({ success: true, appId, hibernatedCells: cells.length });
  });

  router.post('/:appId/wake', async (c) => {
    const appId = c.req.param('appId');
    const membrane = getMembrane(appId);
    const userId = membrane.extractUserId(c);
    const cells = cellManager.getCellsByApp(appId);
    let wokeCount = 0;
    for (const cell of cells) {
      if (cell.toCellInstance().status === 'hibernated') {
        const success = await cellManager.wakeCell(cell.toCellInstance().cellId);
        if (success) wokeCount++;
      }
    }
    if (userId) {
      elasticScaler.recordActivity(appId, userId);
    }
    return c.json({ success: true, appId, wokeCells: wokeCount });
  });

  router.all('/:appId/proxy/*', async (c) => {
    const appId = c.req.param('appId');
    const membrane = getMembrane(appId);

    const userId = membrane.extractUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const rateCheck = trafficShaper.checkRate(appId);
    if (!rateCheck.allowed) {
      return c.json({ error: 'Too many requests', retryAfterMs: rateCheck.retryAfterMs }, 429);
    }

    const cells = cellManager.getCellsByApp(appId);
    const runningCell = cells.find(cell => cell.toCellInstance().status === 'running');
    if (!runningCell) {
      return c.json({ error: 'No running cell for this app', hint: 'Start the cell first via POST /api/cell/:appId/start' }, 503);
    }

    runningCell.recordRequest();

    const proxyPath = c.req.path.replace(`/api/cell/${appId}/proxy/`, '/');
    const cellRouter = runningCell.getRouter();
    const routes = cellRouter.getRoutes();

    const matchingRoute = routes.find(r => {
      if (r.method !== c.req.method) return false;
      return matchRoute(r.path, proxyPath);
    });

    if (!matchingRoute) {
      return c.json({ error: 'Not found', path: proxyPath }, 404);
    }

    const req = {
      method: c.req.method,
      path: proxyPath,
      headers: Object.fromEntries(Object.entries(c.req.header())),
      query: c.req.query() ?? {},
      params: {},
      body: await c.req.json().catch(() => null),
      userId,
    };

    let statusCode = 200;
    let responseBody: unknown = null;

    const res = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { responseBody = data; },
      text(data: string) { responseBody = data; },
      binary(data: Uint8Array) { responseBody = data; },
    };

    try {
      await matchingRoute.handler(req, res);
    } catch (e) {
      return c.json({ error: 'Internal cell error', message: e instanceof Error ? e.message : String(e) }, 500);
    }

    return c.json(responseBody, statusCode);
  });

  return router;
}

function matchRoute(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern === '/*' || pattern === '*') return true;
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return false;
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) continue;
    if (patternParts[i] !== pathParts[i]) return false;
  }
  return true;
}
