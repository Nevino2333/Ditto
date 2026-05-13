type Priority = 'system' | 'high' | 'normal' | 'low';

interface TrafficRule {
  appId: string;
  priority: Priority;
  maxRequestsPerSecond: number;
  currentRPS: number;
  requestCount: number;
  windowStart: number;
  totalRequests: number;
  throttledRequests: number;
  lastRequestAt: number | null;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  system: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const DEFAULT_RPS_LIMITS: Record<Priority, number> = {
  system: 1000,
  high: 500,
  normal: 200,
  low: 50,
};

const WINDOW_MS = 1000;

export class TrafficShaper {
  private rules = new Map<string, TrafficRule>();
  private defaultPriority: Priority = 'normal';
  private autoPriorityEnabled: boolean = true;

  registerApp(appId: string, priority?: Priority, maxRPS?: number): void {
    const p = priority ?? this.defaultPriority;
    this.rules.set(appId, {
      appId,
      priority: p,
      maxRequestsPerSecond: maxRPS ?? DEFAULT_RPS_LIMITS[p],
      currentRPS: 0,
      requestCount: 0,
      windowStart: Date.now(),
      totalRequests: 0,
      throttledRequests: 0,
      lastRequestAt: null,
    });
  }

  unregisterApp(appId: string): void {
    this.rules.delete(appId);
  }

  checkRate(appId: string): { allowed: boolean; retryAfterMs?: number } {
    const rule = this.rules.get(appId);
    if (!rule) return { allowed: true };

    const now = Date.now();
    if (now - rule.windowStart >= WINDOW_MS) {
      rule.currentRPS = rule.requestCount;
      rule.requestCount = 0;
      rule.windowStart = now;
    }

    rule.totalRequests++;
    rule.lastRequestAt = now;

    if (rule.requestCount >= rule.maxRequestsPerSecond) {
      rule.throttledRequests++;
      return { allowed: false, retryAfterMs: WINDOW_MS - (now - rule.windowStart) };
    }

    rule.requestCount++;
    return { allowed: true };
  }

  getPriority(appId: string): Priority {
    return this.rules.get(appId)?.priority ?? 'normal';
  }

  comparePriority(a: string, b: string): number {
    const pa = this.getPriority(a);
    const pb = this.getPriority(b);
    return PRIORITY_ORDER[pa] - PRIORITY_ORDER[pb];
  }

  setAppPriority(appId: string, priority: Priority): void {
    const rule = this.rules.get(appId);
    if (rule) {
      rule.priority = priority;
      rule.maxRequestsPerSecond = DEFAULT_RPS_LIMITS[priority];
    }
  }

  setAutoPriority(enabled: boolean): void {
    this.autoPriorityEnabled = enabled;
  }

  autoAdjustPriorities(focusedAppId?: string): void {
    if (!this.autoPriorityEnabled) return;

    for (const [appId, rule] of this.rules) {
      if (appId === focusedAppId) {
        if (rule.priority !== 'system') {
          rule.priority = 'high';
          rule.maxRequestsPerSecond = DEFAULT_RPS_LIMITS['high'];
        }
      } else if (rule.priority === 'high' && appId !== focusedAppId) {
        rule.priority = 'normal';
        rule.maxRequestsPerSecond = DEFAULT_RPS_LIMITS['normal'];
      }

      if (rule.throttledRequests > rule.totalRequests * 0.3 && rule.totalRequests > 100) {
        if (rule.priority === 'low') {
          rule.maxRequestsPerSecond = Math.max(10, Math.floor(DEFAULT_RPS_LIMITS['low'] * 0.5));
        }
      }
    }
  }

  getStats(): TrafficRule[] {
    return [...this.rules.values()];
  }

  getAppStats(appId: string): TrafficRule | undefined {
    return this.rules.get(appId);
  }

  getOverallStats(): { totalApps: number; totalRequests: number; totalThrottled: number; throttleRate: number } {
    let totalRequests = 0;
    let totalThrottled = 0;
    for (const rule of this.rules.values()) {
      totalRequests += rule.totalRequests;
      totalThrottled += rule.throttledRequests;
    }
    return {
      totalApps: this.rules.size,
      totalRequests,
      totalThrottled,
      throttleRate: totalRequests > 0 ? totalThrottled / totalRequests : 0,
    };
  }
}
