import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createAuthRoutes } from './services/auth/routes';
import { vfsRoutes } from './services/vfs/routes';
import { appRegistryRoutes } from './services/app-registry/routes';
import { proxyRoutes } from './services/proxy/routes';
import { createWebSocketHandler } from './services/realtime/ws-handler';
import { AppCellManager } from './services/app-cell/manager';
import { createCellRoutes } from './services/app-cell/routes';
import { ResourceQuotaManager } from './services/resource-fabric/quota';
import { TrafficShaper } from './services/resource-fabric/traffic-shaper';
import { FairScheduler } from './services/resource-fabric/fair-scheduler';
import { ElasticScaler } from './services/resource-fabric/elastic-scaler';
import { createResourceFabricMiddleware } from './services/resource-fabric/middleware';
import { createAdminRoutes } from './services/admin/routes';
import { createInstallRoutes } from './services/app-install/routes';
import { createMarketRoutes } from './services/market/routes';

const app = new Hono();

const cellManager = new AppCellManager();
cellManager.setApp(app);

const quotaManager = new ResourceQuotaManager();
const trafficShaper = new TrafficShaper();
const fairScheduler = new FairScheduler(quotaManager);
const elasticScaler = new ElasticScaler(quotaManager);
elasticScaler.setCellManager(cellManager);

cellManager.setWSHandler((appId, channel, payload, target) => {
  if (target && target !== '*' && target !== 'host') {
    const targetCells = cellManager.getCellsByApp(target);
    for (const cell of targetCells) {
      if (cell.toCellInstance().status === 'running') {
        cell.getIpcBridge().receiveFromHost(channel, payload);
      }
    }
  } else {
    cellManager.deliverIPCMessage(appId, channel, payload);
  }
});

elasticScaler.setHandlers({
  onHibernate: async (appId, userId) => {
    const cells = cellManager.getCellsByApp(appId);
    for (const cell of cells) {
      if (cell.toCellInstance().userIds.includes(userId)) {
        await cellManager.hibernateCell(cell.toCellInstance().cellId);
        elasticScaler.unregisterCell(appId, userId);
      }
    }
  },
  onWake: async (appId, userId) => {
    try {
      await cellManager.startCellForUser(appId, userId);
      elasticScaler.registerCell(appId, userId);
      return true;
    } catch {
      return false;
    }
  },
  onThrottle: (appId, userId) => {
    trafficShaper.setAppPriority(appId, 'low');
  },
});

elasticScaler.start();
cellManager.startHibernateChecker();

const appsDir = process.env.APPS_DIR ?? path.join(process.cwd(), 'data', 'apps');
fs.mkdirSync(appsDir, { recursive: true });

app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Filename', 'X-Decrypt-Password'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-Quota-Usage', 'Retry-After'],
}));

app.use('/api/cell/*', createResourceFabricMiddleware(quotaManager, trafficShaper));

app.get('/', (c) => c.json({
  name: 'Ditto Server',
  version: '0.1.0',
  status: 'running',
  endpoints: {
    apps: '/api/apps',
    cell: '/api/cell',
    admin: '/api/admin',
    auth: '/api/auth',
    vfs: '/api/vfs',
    health: '/api/health',
  },
}));

app.route('/api/auth', createAuthRoutes());
app.route('/api/vfs', vfsRoutes);
app.route('/api/apps', appRegistryRoutes);
app.route('/api/proxy', proxyRoutes);

app.route('/api/cell', createCellRoutes({
  cellManager,
  quotaManager,
  trafficShaper,
  elasticScaler,
}));
app.route('/api/apps', createInstallRoutes(cellManager, appsDir));
app.route('/api/market', createMarketRoutes({
  cellManager,
  appsDir,
  githubToken: process.env.GITHUB_TOKEN,
  localDataDir: process.env.MARKET_DATA_DIR,
}));
app.route('/api/admin', createAdminRoutes({
  cellManager,
  quotaManager,
  trafficShaper,
  elasticScaler,
}));

app.get('/api/health', (c) => {
  const cells = cellManager.getAllCells();
  const stats = quotaManager.getSystemStats();
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    cells: {
      total: cells.length,
      running: cells.filter(c => c.status === 'running').length,
      hibernated: cells.filter(c => c.status === 'hibernated').length,
    },
    resources: stats,
  });
});

const port = Number(process.env.PORT ?? 3001);

console.log(`🦎 Ditto Server starting on port ${port}...`);

const server = Bun.serve({
  port,
  fetch: app.fetch,
  websocket: createWebSocketHandler(cellManager) as any,
});

console.log(`🦎 Ditto Server running at http://localhost:${port}`);
console.log(`📡 WebSocket endpoint at ws://localhost:${port}/ws`);
console.log(`📦 Apps directory: ${appsDir}`);

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  elasticScaler.stop();
  cellManager.stopHibernateChecker();
  await cellManager.destroyAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Interrupted, shutting down...');
  elasticScaler.stop();
  cellManager.stopHibernateChecker();
  await cellManager.destroyAll();
  process.exit(0);
});

export type AppType = typeof app;
