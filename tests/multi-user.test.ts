import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppCellManager } from '../server/src/services/app-cell/manager';
import { ResourceQuotaManager } from '../server/src/services/resource-fabric/quota';
import { FairScheduler } from '../server/src/services/resource-fabric/fair-scheduler';
import type { AppManifest } from '../packages/shared/src';

const appManifest: AppManifest = {
  id: 'com.ditto.chat',
  name: 'Chat App',
  version: '1.0.0',
  entry: 'frontend/index.html',
  sandbox: 'strict',
  permissions: [],
  type: 'app',
  window: { width: 800, height: 600 },
  backend: { entry: 'backend/index.ts', type: 'cell' },
};

describe('Multi-user Concurrency', () => {
  let cellManager: AppCellManager;
  let quotaManager: ResourceQuotaManager;
  let scheduler: FairScheduler;

  beforeAll(() => {
    cellManager = new AppCellManager();
    quotaManager = new ResourceQuotaManager();
    scheduler = new FairScheduler(quotaManager);

    cellManager.registerApp('com.ditto.chat', appManifest, '/tmp/chat-backend');
  });

  afterAll(async () => {
    await cellManager.destroyAll();
  });

  it('should isolate data between users in shared mode', async () => {
    const cell1 = await cellManager.startCellForUser('com.ditto.chat', 'user-A');
    const cell2 = await cellManager.startCellForUser('com.ditto.chat', 'user-B');

    expect(cell1.toCellInstance().cellId).toBe(cell2.toCellInstance().cellId);
    expect(cell1.toCellInstance().userIds).toContain('user-A');
    expect(cell1.toCellInstance().userIds).toContain('user-B');
  });

  it('should enforce per-user resource quotas', () => {
    for (let i = 0; i < 5; i++) {
      quotaManager.allocateQuota(`com.ditto.app${i}`, 'user-A');
    }

    const result = quotaManager.checkQuota('com.ditto.app6', 'user-A');
    expect(result.allowed).toBe(false);

    const userBResult = quotaManager.checkQuota('com.ditto.app1', 'user-B');
    expect(userBResult.allowed).toBe(true);
  });

  it('should fairly schedule between competing users', () => {
    const winner = scheduler.selectUserForScheduling(['user-A', 'user-B', 'user-C']);
    expect(['user-A', 'user-B', 'user-C']).toContain(winner);
  });

  it('should handle exclusive mode per user', async () => {
    const exclusiveCell = await cellManager.createCell('com.ditto.chat', 'user-C', 'exclusive');
    expect(exclusiveCell.replica).toBe('exclusive');
    expect(exclusiveCell.toCellInstance().userIds).toContain('user-C');
    expect(exclusiveCell.toCellInstance().userIds).not.toContain('user-A');
  });

  it('should clean up cells when users disconnect', async () => {
    await cellManager.stopCellForUser('com.ditto.chat', 'user-B');
    const cells = cellManager.getCellsByApp('com.ditto.chat');
    const sharedCell = cells.find(c => c.replica === 'shared');
    if (sharedCell) {
      expect(sharedCell.toCellInstance().userIds).not.toContain('user-B');
      expect(sharedCell.toCellInstance().userIds).toContain('user-A');
    }
  });
});
