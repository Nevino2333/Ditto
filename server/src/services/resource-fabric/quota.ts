import type { ResourceQuota, UserResourceUsage } from '@ditto/shared';

const DEFAULT_CELL_QUOTA: ResourceQuota = {
  memoryMB: 128,
  cpuPercent: 10,
  maxConnections: 100,
  storageGB: 1,
};

const DEFAULT_USER_LIMITS = {
  maxCells: 5,
  maxMemoryMB: 640,
};

interface QuotaEntry {
  appId: string;
  userId: string;
  quota: ResourceQuota;
  currentUsage: {
    memoryMB: number;
    cpuPercent: number;
    connections: number;
    storageGB: number;
  };
  requestCount: number;
  lastRequestAt: number | null;
}

export class ResourceQuotaManager {
  private quotas = new Map<string, QuotaEntry>();
  private userLimits = new Map<string, { maxCells: number; maxMemoryMB: number }>();
  private customQuotas = new Map<string, ResourceQuota>();

  getQuotaKey(appId: string, userId: string): string {
    return `${userId}:${appId}`;
  }

  allocateQuota(appId: string, userId: string, customQuota?: Partial<ResourceQuota>): ResourceQuota {
    const key = this.getQuotaKey(appId, userId);
    const base = this.customQuotas.get(appId) ?? DEFAULT_CELL_QUOTA;
    const quota: ResourceQuota = { ...base, ...customQuota };

    this.quotas.set(key, {
      appId,
      userId,
      quota,
      currentUsage: { memoryMB: 0, cpuPercent: 0, connections: 0, storageGB: 0 },
      requestCount: 0,
      lastRequestAt: null,
    });

    return quota;
  }

  releaseQuota(appId: string, userId: string): void {
    const key = this.getQuotaKey(appId, userId);
    this.quotas.delete(key);
  }

  checkQuota(appId: string, userId: string): { allowed: boolean; reason?: string } {
    const key = this.getQuotaKey(appId, userId);
    if (this.quotas.has(key)) {
      return { allowed: true };
    }

    const userUsage = this.getUserUsage(userId);
    const limits = this.userLimits.get(userId) ?? DEFAULT_USER_LIMITS;

    if (userUsage.totalCells >= limits.maxCells) {
      return { allowed: false, reason: `已达到应用数量上限 (${limits.maxCells})，请关闭其他应用后重试` };
    }
    if (userUsage.totalMemoryMB >= limits.maxMemoryMB) {
      return { allowed: false, reason: `已达到内存上限 (${limits.maxMemoryMB}MB)，请关闭其他应用后重试` };
    }

    return { allowed: true };
  }

  recordRequest(appId: string, userId: string): void {
    const key = this.getQuotaKey(appId, userId);
    const entry = this.quotas.get(key);
    if (!entry) return;
    entry.requestCount++;
    entry.lastRequestAt = Date.now();
    entry.currentUsage.connections++;
  }

  releaseConnection(appId: string, userId: string): void {
    const key = this.getQuotaKey(appId, userId);
    const entry = this.quotas.get(key);
    if (!entry) return;
    entry.currentUsage.connections = Math.max(0, entry.currentUsage.connections - 1);
  }

  updateUsage(appId: string, userId: string, usage: Partial<QuotaEntry['currentUsage']>): void {
    const key = this.getQuotaKey(appId, userId);
    const entry = this.quotas.get(key);
    if (!entry) return;
    Object.assign(entry.currentUsage, usage);
  }

  isOverQuota(appId: string, userId: string): boolean {
    const key = this.getQuotaKey(appId, userId);
    const entry = this.quotas.get(key);
    if (!entry) return false;

    return (
      entry.currentUsage.memoryMB > entry.quota.memoryMB ||
      entry.currentUsage.cpuPercent > entry.quota.cpuPercent ||
      entry.currentUsage.connections > entry.quota.maxConnections ||
      entry.currentUsage.storageGB > entry.quota.storageGB
    );
  }

  getQuotaUsagePercent(appId: string, userId: string): number {
    const key = this.getQuotaKey(appId, userId);
    const entry = this.quotas.get(key);
    if (!entry) return 0;

    const memoryPct = entry.currentUsage.memoryMB / entry.quota.memoryMB;
    const cpuPct = entry.currentUsage.cpuPercent / entry.quota.cpuPercent;
    const connPct = entry.currentUsage.connections / entry.quota.maxConnections;

    return Math.max(memoryPct, cpuPct, connPct) * 100;
  }

  getUserUsage(userId: string): UserResourceUsage {
    let totalCells = 0;
    let totalMemoryMB = 0;
    let totalCpuPercent = 0;

    for (const entry of this.quotas.values()) {
      if (entry.userId === userId) {
        totalCells++;
        totalMemoryMB += entry.currentUsage.memoryMB;
        totalCpuPercent += entry.currentUsage.cpuPercent;
      }
    }

    const limits = this.userLimits.get(userId) ?? DEFAULT_USER_LIMITS;
    return {
      userId,
      totalCells,
      totalMemoryMB,
      totalCpuPercent,
      maxCells: limits.maxCells,
      maxMemoryMB: limits.maxMemoryMB,
    };
  }

  setAppQuota(appId: string, quota: Partial<ResourceQuota>): void {
    const existing = this.customQuotas.get(appId) ?? DEFAULT_CELL_QUOTA;
    this.customQuotas.set(appId, { ...existing, ...quota });
  }

  setUserLimits(userId: string, limits: { maxCells?: number; maxMemoryMB?: number }): void {
    const existing = this.userLimits.get(userId) ?? { ...DEFAULT_USER_LIMITS };
    if (limits.maxCells !== undefined) existing.maxCells = limits.maxCells;
    if (limits.maxMemoryMB !== undefined) existing.maxMemoryMB = limits.maxMemoryMB;
    this.userLimits.set(userId, existing);
  }

  getAllQuotas(): QuotaEntry[] {
    return [...this.quotas.values()];
  }

  getAppQuota(appId: string, userId: string): QuotaEntry | undefined {
    return this.quotas.get(this.getQuotaKey(appId, userId));
  }

  getSystemStats(): { totalQuotas: number; totalUsers: number; totalApps: number; overallMemoryMB: number; overallCpuPercent: number } {
    const users = new Set<string>();
    const apps = new Set<string>();
    let totalMem = 0;
    let totalCpu = 0;

    for (const entry of this.quotas.values()) {
      users.add(entry.userId);
      apps.add(entry.appId);
      totalMem += entry.currentUsage.memoryMB;
      totalCpu += entry.currentUsage.cpuPercent;
    }

    return {
      totalQuotas: this.quotas.size,
      totalUsers: users.size,
      totalApps: apps.size,
      overallMemoryMB: totalMem,
      overallCpuPercent: totalCpu,
    };
  }
}
