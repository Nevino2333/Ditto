import { Hono } from 'hono';
import type { AppCellManager } from '../app-cell/manager';
import type { ResourceQuotaManager } from '../resource-fabric/quota';
import type { TrafficShaper } from '../resource-fabric/traffic-shaper';
import type { ElasticScaler } from '../resource-fabric/elastic-scaler';
import { getCellMetrics } from '../app-cell/cell-context';

interface AdminRouteDeps {
  cellManager: AppCellManager;
  quotaManager: ResourceQuotaManager;
  trafficShaper?: TrafficShaper;
  elasticScaler?: ElasticScaler;
}

export function createAdminRoutes(deps: AdminRouteDeps): Hono {
  const router = new Hono();
  const { cellManager, quotaManager, trafficShaper, elasticScaler } = deps;

  router.get('/cells', (c) => {
    const cells = cellManager.getAllCells();
    return c.json({
      cells: cells.map(cell => ({
        ...cell,
      })),
      total: cells.length,
      running: cells.filter(c => c.status === 'running').length,
      hibernated: cells.filter(c => c.status === 'hibernated').length,
      error: cells.filter(c => c.status === 'error').length,
    });
  });

  router.post('/cells/:cellId/start', async (c) => {
    const cellId = c.req.param('cellId');
    const success = await cellManager.wakeCell(cellId);
    if (!success) {
      return c.json({ error: 'Cell not found or wake failed' }, 404);
    }
    return c.json({ success: true, cellId });
  });

  router.post('/cells/:cellId/stop', async (c) => {
    const cellId = c.req.param('cellId');
    await cellManager.destroyCell(cellId);
    return c.json({ success: true, cellId });
  });

  router.post('/cells/:cellId/hibernate', async (c) => {
    const cellId = c.req.param('cellId');
    await cellManager.hibernateCell(cellId);
    return c.json({ success: true, cellId });
  });

  router.get('/cells/:cellId', (c) => {
    const cellId = c.req.param('cellId');
    const cell = cellManager.getCell(cellId);
    if (!cell) {
      return c.json({ error: 'Cell not found' }, 404);
    }
    return c.json({
      ...cell.toCellInstance(),
      memoryUsageMB: cell.getMemoryUsageMB(),
      cpuUsage: cell.getCpuUsage(),
      requestCount: cell.getRequestCount(),
    });
  });

  router.get('/cells/:cellId/metrics', (c) => {
    const cellId = c.req.param('cellId');
    const cell = cellManager.getCell(cellId);
    if (!cell) {
      return c.json({ error: 'Cell not found' }, 404);
    }
    const appId = cell.toCellInstance().appId;
    const metrics = getCellMetrics(appId);
    return c.json({
      cellId,
      appId,
      memoryUsageMB: cell.getMemoryUsageMB(),
      cpuUsage: cell.getCpuUsage(),
      requestCount: cell.getRequestCount(),
      customMetrics: metrics,
    });
  });

  router.get('/metrics', (c) => {
    const cells = cellManager.getAllCells();
    const appIds = [...new Set(cells.map(c => c.appId))];

    const appMetrics: Record<string, any> = {};
    for (const appId of appIds) {
      appMetrics[appId] = getCellMetrics(appId);
    }

    return c.json({
      timestamp: Date.now(),
      cells: {
        total: cells.length,
        running: cells.filter(c => c.status === 'running').length,
        hibernated: cells.filter(c => c.status === 'hibernated').length,
        error: cells.filter(c => c.status === 'error').length,
      },
      resources: quotaManager.getSystemStats(),
      traffic: trafficShaper?.getOverallStats(),
      scaler: elasticScaler ? {
        config: elasticScaler.getConfig(),
        overallCpu: elasticScaler.getOverallCpuUsage(),
        overallMemoryMB: elasticScaler.getOverallMemoryMB(),
        loadInfo: elasticScaler.getLoadInfo(),
      } : null,
      appMetrics,
    });
  });

  router.get('/quotas', (c) => {
    const quotas = quotaManager.getAllQuotas();
    const stats = quotaManager.getSystemStats();
    return c.json({
      quotas: quotas.map(q => ({
        appId: q.appId,
        userId: q.userId,
        quota: q.quota,
        usage: q.currentUsage,
        requestCount: q.requestCount,
        lastRequestAt: q.lastRequestAt,
      })),
      stats,
      total: quotas.length,
    });
  });

  router.put('/quotas/app/:appId', async (c) => {
    const appId = c.req.param('appId');
    const body = await c.req.json();
    quotaManager.setAppQuota(appId, body);
    return c.json({ success: true, appId });
  });

  router.put('/quotas/user/:userId', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    quotaManager.setUserLimits(userId, body);
    return c.json({ success: true, userId });
  });

  router.get('/installed-apps', (c) => {
    const apps = cellManager.getInstalledApps();
    const result = [...apps.entries()].map(([id, data]) => {
      const cells = cellManager.getCellsByApp(id);
      return {
        id,
        name: data.manifest.name,
        version: data.manifest.version,
        description: data.manifest.description,
        type: data.manifest.type ?? 'app',
        hasBackend: !!data.manifest.backend,
        runningCells: cells.filter(c => c.toCellInstance().status === 'running').length,
        hibernatedCells: cells.filter(c => c.toCellInstance().status === 'hibernated').length,
        totalCells: cells.length,
      };
    });
    return c.json({ apps: result, total: result.length });
  });

  router.get('/traffic', (c) => {
    if (!trafficShaper) {
      return c.json({ error: 'Traffic shaper not available' }, 503);
    }
    return c.json({
      apps: trafficShaper.getStats(),
      overall: trafficShaper.getOverallStats(),
    });
  });

  router.put('/traffic/:appId/priority', async (c) => {
    if (!trafficShaper) {
      return c.json({ error: 'Traffic shaper not available' }, 503);
    }
    const appId = c.req.param('appId');
    const body = await c.req.json();
    const priority = body.priority as 'system' | 'high' | 'normal' | 'low';
    if (!['system', 'high', 'normal', 'low'].includes(priority)) {
      return c.json({ error: 'Invalid priority level' }, 400);
    }
    trafficShaper.setAppPriority(appId, priority);
    return c.json({ success: true, appId, priority });
  });

  router.get('/scaler/config', (c) => {
    if (!elasticScaler) {
      return c.json({ error: 'Elastic scaler not available' }, 503);
    }
    return c.json(elasticScaler.getConfig());
  });

  router.put('/scaler/config', async (c) => {
    if (!elasticScaler) {
      return c.json({ error: 'Elastic scaler not available' }, 503);
    }
    const body = await c.req.json();
    elasticScaler.updateConfig(body);
    return c.json({ success: true, config: elasticScaler.getConfig() });
  });

  router.get('/scaler/load', (c) => {
    if (!elasticScaler) {
      return c.json({ error: 'Elastic scaler not available' }, 503);
    }
    return c.json({
      overallCpu: elasticScaler.getOverallCpuUsage(),
      overallMemoryMB: elasticScaler.getOverallMemoryMB(),
      loadInfo: elasticScaler.getLoadInfo(),
    });
  });

  return router;
}
