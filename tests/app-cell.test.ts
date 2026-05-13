import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppCellManager } from '../server/src/services/app-cell/manager';
import type { AppManifest } from '../packages/shared/src';

const sampleManifest: AppManifest = {
  id: 'com.ditto.test',
  name: 'Test App',
  version: '1.0.0',
  entry: 'frontend/index.html',
  sandbox: 'strict',
  permissions: [],
  type: 'app',
  window: { width: 800, height: 600 },
  backend: {
    entry: 'backend/index.ts',
    type: 'cell',
    healthCheck: '/health',
  },
};

describe('AppCellManager', () => {
  let manager: AppCellManager;

  beforeAll(() => {
    manager = new AppCellManager();
  });

  afterAll(async () => {
    await manager.destroyAll();
  });

  it('should register an app', () => {
    manager.registerApp('com.ditto.test', sampleManifest, '/tmp/test-backend');
    const apps = manager.getInstalledApps();
    expect(apps.has('com.ditto.test')).toBe(true);
  });

  it('should create a cell for a user', async () => {
    const cell = await manager.createCell('com.ditto.test', 'user-1');
    expect(cell).toBeDefined();
    expect(cell.toCellInstance().appId).toBe('com.ditto.test');
    expect(cell.toCellInstance().status).toBe('running');
    expect(cell.toCellInstance().userIds).toContain('user-1');
  });

  it('should reuse shared cell for same app', async () => {
    const cell1 = await manager.startCellForUser('com.ditto.test', 'user-1');
    const cell2 = await manager.startCellForUser('com.ditto.test', 'user-2');

    expect(cell1.toCellInstance().cellId).toBe(cell2.toCellInstance().cellId);
    expect(cell2.toCellInstance().userIds).toContain('user-2');
  });

  it('should create exclusive cell when requested', async () => {
    const cell = await manager.createCell('com.ditto.test', 'user-3', 'exclusive');
    expect(cell.replica).toBe('exclusive');
    expect(cell.toCellInstance().userIds).toContain('user-3');
  });

  it('should list all cells', () => {
    const cells = manager.getAllCells();
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it('should hibernate a cell', async () => {
    const cells = manager.getCellsByApp('com.ditto.test');
    const sharedCell = cells.find(c => c.replica === 'shared');
    if (sharedCell) {
      await manager.hibernateCell(sharedCell.toCellInstance().cellId);
      expect(sharedCell.toCellInstance().status).toBe('hibernated');
    }
  });

  it('should wake a hibernated cell', async () => {
    const cells = manager.getCellsByApp('com.ditto.test');
    const hibernatedCell = cells.find(c => c.toCellInstance().status === 'hibernated');
    if (hibernatedCell) {
      const success = await manager.wakeCell(hibernatedCell.toCellInstance().cellId);
      expect(success).toBe(true);
      expect(hibernatedCell.toCellInstance().status).toBe('running');
    }
  });

  it('should stop a cell for a user', async () => {
    await manager.stopCellForUser('com.ditto.test', 'user-2');
    const cells = manager.getCellsByApp('com.ditto.test');
    const sharedCell = cells.find(c => c.replica === 'shared');
    if (sharedCell) {
      expect(sharedCell.toCellInstance().userIds).not.toContain('user-2');
    }
  });

  it('should unregister an app and destroy its cells', async () => {
    manager.unregisterApp('com.ditto.test');
    expect(manager.getInstalledApps().has('com.ditto.test')).toBe(false);
    expect(manager.getCellsByApp('com.ditto.test')).toHaveLength(0);
  });
});
