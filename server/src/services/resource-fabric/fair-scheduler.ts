import type { ResourceQuotaManager } from './quota';

interface SchedulerConfig {
  maxCellsPerUser: number;
  maxMemoryPerUserMB: number;
  fairShareWeight: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxCellsPerUser: 5,
  maxMemoryPerUserMB: 640,
  fairShareWeight: 0.5,
};

export class FairScheduler {
  private config: SchedulerConfig;
  private quotaManager: ResourceQuotaManager;
  private userRequestCounts = new Map<string, number>();
  private userLastScheduled = new Map<string, number>();

  constructor(quotaManager: ResourceQuotaManager, config?: Partial<SchedulerConfig>) {
    this.quotaManager = quotaManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canStartCell(appId: string, userId: string): { allowed: boolean; reason?: string } {
    return this.quotaManager.checkQuota(appId, userId);
  }

  recordRequest(userId: string): void {
    const count = this.userRequestCounts.get(userId) ?? 0;
    this.userRequestCounts.set(userId, count + 1);
  }

  selectUserForScheduling(candidates: string[]): string | null {
    if (candidates.length === 0) return null;

    const scored = candidates.map((userId) => {
      const usage = this.quotaManager.getUserUsage(userId);
      const requestCount = this.userRequestCounts.get(userId) ?? 0;
      const lastScheduled = this.userLastScheduled.get(userId) ?? 0;
      const timeSinceLastSchedule = Date.now() - lastScheduled;

      const usageScore = 1 - (usage.totalCells / this.config.maxCellsPerUser);
      const fairnessScore = Math.min(requestCount / 100, 1);
      const timeScore = Math.min(timeSinceLastSchedule / 60000, 1);

      const score = (usageScore * this.config.fairShareWeight) +
                    (fairnessScore * (1 - this.config.fairShareWeight) * 0.5) +
                    (timeScore * (1 - this.config.fairShareWeight) * 0.5);

      return { userId, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0].userId;
    this.userLastScheduled.set(winner, Date.now());
    return winner;
  }

  resetWindow(): void {
    this.userRequestCounts.clear();
  }

  updateConfig(config: Partial<SchedulerConfig>): void {
    Object.assign(this.config, config);
  }
}
