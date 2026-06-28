import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceQuotaManager } from '../server/src/services/resource-fabric/quota';
import { TrafficShaper } from '../server/src/services/resource-fabric/traffic-shaper';
import { FairScheduler } from '../server/src/services/resource-fabric/fair-scheduler';
import { ElasticScaler } from '../server/src/services/resource-fabric/elastic-scaler';

describe('ResourceQuotaManager', () => {
  let quotaManager: ResourceQuotaManager;

  beforeEach(() => {
    quotaManager = new ResourceQuotaManager();
  });

  it('should allocate a quota', () => {
    const quota = quotaManager.allocateQuota('com.test.app', 'user-1');
    expect(quota.memoryMB).toBe(128);
    expect(quota.cpuPercent).toBe(10);
    expect(quota.maxConnections).toBe(100);
  });

  it('should check quota limits', () => {
    for (let i = 0; i < 5; i++) {
      quotaManager.allocateQuota(`com.test.app${i}`, 'user-1');
    }
    const result = quotaManager.checkQuota('com.test.app6', 'user-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('已达到应用数量上限');
  });

  it('should detect over-quota', () => {
    quotaManager.allocateQuota('com.test.app', 'user-1');
    quotaManager.updateUsage('com.test.app', 'user-1', { memoryMB: 200 });
    expect(quotaManager.isOverQuota('com.test.app', 'user-1')).toBe(true);
  });

  it('should release a quota', () => {
    quotaManager.allocateQuota('com.test.app', 'user-1');
    quotaManager.releaseQuota('com.test.app', 'user-1');
    expect(quotaManager.getAppQuota('com.test.app', 'user-1')).toBeUndefined();
  });

  it('should report user usage', () => {
    quotaManager.allocateQuota('com.test.app1', 'user-1');
    quotaManager.allocateQuota('com.test.app2', 'user-1');
    const usage = quotaManager.getUserUsage('user-1');
    expect(usage.totalCells).toBe(2);
  });
});

describe('TrafficShaper', () => {
  let shaper: TrafficShaper;

  beforeEach(() => {
    shaper = new TrafficShaper();
  });

  it('should register an app with priority', () => {
    shaper.registerApp('com.test.app', 'high');
    expect(shaper.getPriority('com.test.app')).toBe('high');
  });

  it('should allow requests within rate limit', () => {
    shaper.registerApp('com.test.app', 'normal');
    const result = shaper.checkRate('com.test.app');
    expect(result.allowed).toBe(true);
  });

  it('should compare priorities', () => {
    shaper.registerApp('com.test.high', 'high');
    shaper.registerApp('com.test.low', 'low');
    expect(shaper.comparePriority('com.test.high', 'com.test.low')).toBeLessThan(0);
  });

  it('should unregister an app', () => {
    shaper.registerApp('com.test.app');
    shaper.unregisterApp('com.test.app');
    expect(shaper.getPriority('com.test.app')).toBe('normal');
  });
});

describe('FairScheduler', () => {
  let quotaManager: ResourceQuotaManager;
  let scheduler: FairScheduler;

  beforeEach(() => {
    quotaManager = new ResourceQuotaManager();
    scheduler = new FairScheduler(quotaManager);
  });

  it('should allow starting cells within quota', () => {
    const result = scheduler.canStartCell('com.test.app', 'user-1');
    expect(result.allowed).toBe(true);
  });

  it('should select user for scheduling', () => {
    const winner = scheduler.selectUserForScheduling(['user-1', 'user-2']);
    expect(winner).toBeDefined();
    expect(['user-1', 'user-2']).toContain(winner);
  });
});

describe('ElasticScaler', () => {
  let quotaManager: ResourceQuotaManager;
  let scaler: ElasticScaler;

  beforeEach(() => {
    quotaManager = new ResourceQuotaManager();
    scaler = new ElasticScaler(quotaManager, { checkIntervalMs: 1000, hibernateAfterMs: 100 });
  });

  it('should register and track cells', () => {
    scaler.registerCell('com.test.app', 'user-1');
    expect(scaler.shouldHibernate('com.test.app', 'user-1')).toBe(false);
  });

  it('should detect cells ready for hibernation', async () => {
    scaler.registerCell('com.test.app', 'user-1');
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(scaler.shouldHibernate('com.test.app', 'user-1')).toBe(true);
  });

  it('should record activity to prevent hibernation', async () => {
    scaler.registerCell('com.test.app', 'user-1');
    await new Promise(resolve => setTimeout(resolve, 50));
    scaler.recordActivity('com.test.app', 'user-1');
    expect(scaler.shouldHibernate('com.test.app', 'user-1')).toBe(false);
  });

  it('should stop cleanly', () => {
    scaler.start();
    scaler.stop();
  });
});
