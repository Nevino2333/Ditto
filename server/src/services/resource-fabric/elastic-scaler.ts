import type { ResourceQuotaManager } from './quota';
import type { AppCellManager } from '../app-cell/manager';

interface ScalerConfig {
  highLoadThreshold: number;
  lowLoadThreshold: number;
  checkIntervalMs: number;
  hibernateAfterMs: number;
  wakeTimeoutMs: number;
  maxMemoryMB: number;
  maxCpuPercent: number;
}

const DEFAULT_SCALER_CONFIG: ScalerConfig = {
  highLoadThreshold: 0.8,
  lowLoadThreshold: 0.3,
  checkIntervalMs: 30000,
  hibernateAfterMs: 900000,
  wakeTimeoutMs: 3000,
  maxMemoryMB: 1024,
  maxCpuPercent: 80,
};

interface CellLoadInfo {
  appId: string;
  userId: string;
  lastActivityAt: number;
  cpuUsage: number;
  memoryUsageMB: number;
  requestCount: number;
}

export class ElasticScaler {
  private config: ScalerConfig;
  private quotaManager: ResourceQuotaManager;
  private cellManager?: AppCellManager;
  private cellLoads = new Map<string, CellLoadInfo>();
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private onHibernate?: (appId: string, userId: string) => Promise<void>;
  private onWake?: (appId: string, userId: string) => Promise<boolean>;
  private onThrottle?: (appId: string, userId: string) => void;

  constructor(quotaManager: ResourceQuotaManager, config?: Partial<ScalerConfig>) {
    this.quotaManager = quotaManager;
    this.config = { ...DEFAULT_SCALER_CONFIG, ...config };
  }

  setCellManager(manager: AppCellManager): void {
    this.cellManager = manager;
  }

  start(): void {
    if (this.checkTimer) return;
    this.checkTimer = setInterval(() => this.check(), this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  registerCell(appId: string, userId: string): void {
    const key = `${userId}:${appId}`;
    this.cellLoads.set(key, {
      appId,
      userId,
      lastActivityAt: Date.now(),
      cpuUsage: 0,
      memoryUsageMB: 0,
      requestCount: 0,
    });
  }

  unregisterCell(appId: string, userId: string): void {
    this.cellLoads.delete(`${userId}:${appId}`);
  }

  updateCellLoad(appId: string, userId: string, load: Partial<Pick<CellLoadInfo, 'cpuUsage' | 'memoryUsageMB' | 'requestCount'>>): void {
    const key = `${userId}:${appId}`;
    const info = this.cellLoads.get(key);
    if (!info) return;
    Object.assign(info, load, { lastActivityAt: Date.now() });
  }

  recordActivity(appId: string, userId: string): void {
    const key = `${userId}:${appId}`;
    const info = this.cellLoads.get(key);
    if (info) {
      info.lastActivityAt = Date.now();
    }
  }

  shouldHibernate(appId: string, userId: string): boolean {
    const key = `${userId}:${appId}`;
    const info = this.cellLoads.get(key);
    if (!info) return false;
    return Date.now() - info.lastActivityAt > this.config.hibernateAfterMs;
  }

  getOverallCpuUsage(): number {
    let totalCpu = 0;
    let count = 0;
    for (const info of this.cellLoads.values()) {
      totalCpu += info.cpuUsage;
      count++;
    }
    return count > 0 ? totalCpu / count : 0;
  }

  getOverallMemoryMB(): number {
    let total = 0;
    for (const info of this.cellLoads.values()) {
      total += info.memoryUsageMB;
    }
    return total;
  }

  getLoadInfo(): CellLoadInfo[] {
    return [...this.cellLoads.values()];
  }

  setHandlers(handlers: {
    onHibernate?: (appId: string, userId: string) => Promise<void>;
    onWake?: (appId: string, userId: string) => Promise<boolean>;
    onThrottle?: (appId: string, userId: string) => void;
  }): void {
    if (handlers.onHibernate) this.onHibernate = handlers.onHibernate;
    if (handlers.onWake) this.onWake = handlers.onWake;
    if (handlers.onThrottle) this.onThrottle = handlers.onThrottle;
  }

  updateConfig(config: Partial<ScalerConfig>): void {
    Object.assign(this.config, config);
  }

  getConfig(): ScalerConfig {
    return { ...this.config };
  }

  private async check(): Promise<void> {
    this.syncMetricsFromCells();

    const overallCpu = this.getOverallCpuUsage();
    const overallMem = this.getOverallMemoryMB();

    if (overallCpu > this.config.maxCpuPercent || overallMem > this.config.maxMemoryMB) {
      await this.handleHighLoad();
    } else if (overallCpu < this.config.lowLoadThreshold * 100) {
      await this.handleLowLoad();
    }
  }

  private syncMetricsFromCells(): void {
    if (!this.cellManager) return;

    for (const [key, info] of this.cellLoads) {
      const cells = this.cellManager.getCellsByApp(info.appId);
      const matchingCell = cells.find(c => c.toCellInstance().userIds.includes(info.userId));

      if (matchingCell) {
        const instance = matchingCell.toCellInstance();
        info.cpuUsage = matchingCell.getCpuUsage();
        info.memoryUsageMB = matchingCell.getMemoryUsageMB();
        info.requestCount = matchingCell.getRequestCount();
        if (instance.lastActivityAt) {
          info.lastActivityAt = instance.lastActivityAt;
        }
      }
    }
  }

  private async handleHighLoad(): Promise<void> {
    const cells = [...this.cellLoads.values()].sort((a, b) => b.cpuUsage - a.cpuUsage);

    for (const cell of cells) {
      if (cell.cpuUsage > this.config.maxCpuPercent || cell.memoryUsageMB > this.config.maxMemoryMB) {
        if (this.quotaManager.isOverQuota(cell.appId, cell.userId)) {
          this.onThrottle?.(cell.appId, cell.userId);
        }
      }
    }

    const idleCells = cells.filter(c => Date.now() - c.lastActivityAt > this.config.hibernateAfterMs / 2);
    for (const cell of idleCells.slice(0, Math.ceil(idleCells.length * 0.3))) {
      await this.onHibernate?.(cell.appId, cell.userId);
    }
  }

  private async handleLowLoad(): Promise<void> {
    const now = Date.now();
    for (const info of this.cellLoads.values()) {
      if (now - info.lastActivityAt > this.config.hibernateAfterMs) {
        await this.onHibernate?.(info.appId, info.userId);
      }
    }
  }
}
