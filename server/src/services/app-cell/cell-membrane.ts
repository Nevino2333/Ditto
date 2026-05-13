import type { Hono, Context, Next } from 'hono';
import type { TrafficShaper } from '../resource-fabric/traffic-shaper';
import type { ResourceQuotaManager } from '../resource-fabric/quota';

interface MembraneConfig {
  maxRequestBodyBytes: number;
  enableCORS: boolean;
  corsOrigins: string[];
  safeResponseHeaders: Record<string, string>;
  stripRequestHeaders: string[];
  authRequired: boolean;
}

const DEFAULT_MEMBRANE_CONFIG: MembraneConfig = {
  maxRequestBodyBytes: 10 * 1024 * 1024,
  enableCORS: true,
  corsOrigins: ['*'],
  safeResponseHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  },
  stripRequestHeaders: [
    'host',
    'connection',
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-forwarded-host',
  ],
  authRequired: true,
};

interface MembraneStats {
  totalRequests: number;
  blockedRequests: number;
  authFailures: number;
  rateLimitedRequests: number;
  quotaExceededRequests: number;
  lastRequestAt: number | null;
}

export class CellMembrane {
  private config: MembraneConfig;
  private appId: string;
  private trafficShaper?: TrafficShaper;
  private quotaManager?: ResourceQuotaManager;
  private stats: MembraneStats;
  private allowedPaths: Set<string> | null = null;

  constructor(
    appId: string,
    config?: Partial<MembraneConfig>,
    deps?: { trafficShaper?: TrafficShaper; quotaManager?: ResourceQuotaManager }
  ) {
    this.appId = appId;
    this.config = { ...DEFAULT_MEMBRANE_CONFIG, ...config };
    this.trafficShaper = deps?.trafficShaper;
    this.quotaManager = deps?.quotaManager;
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      authFailures: 0,
      rateLimitedRequests: 0,
      quotaExceededRequests: 0,
      lastRequestAt: null,
    };
  }

  setAllowedPaths(paths: string[]): void {
    this.allowedPaths = new Set(paths);
  }

  createMiddleware() {
    return async (c: Context, next: Next) => {
      this.stats.totalRequests++;
      this.stats.lastRequestAt = Date.now();

      const userId = this.extractUserId(c);

      if (this.config.authRequired && !userId) {
        this.stats.authFailures++;
        this.stats.blockedRequests++;
        return c.json({
          error: 'Authentication required',
          hint: 'Provide Authorization header or X-User-Id header',
        }, 401);
      }

      if (this.allowedPaths && !this.isPathAllowed(c.req.path)) {
        this.stats.blockedRequests++;
        return c.json({ error: 'Path not allowed', path: c.req.path }, 403);
      }

      if (this.trafficShaper) {
        const rateCheck = this.trafficShaper.checkRate(this.appId);
        if (!rateCheck.allowed) {
          this.stats.rateLimitedRequests++;
          this.stats.blockedRequests++;
          c.header('Retry-After', String(Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000)));
          return c.json({
            error: 'Too many requests',
            retryAfterMs: rateCheck.retryAfterMs,
          }, 429);
        }
      }

      if (userId && this.quotaManager) {
        if (this.quotaManager.isOverQuota(this.appId, userId)) {
          this.stats.quotaExceededRequests++;
          this.stats.blockedRequests++;
          return c.json({ error: 'Resource quota exceeded' }, 429);
        }
        this.quotaManager.recordRequest(this.appId, userId);
      }

      if (userId) {
        c.set('userId', userId);
      }

      c.set('appId', this.appId);

      await next();

      for (const [key, value] of Object.entries(this.config.safeResponseHeaders)) {
        c.header(key, value);
      }

      if (userId && this.quotaManager) {
        this.quotaManager.releaseConnection(this.appId, userId);
      }
    };
  }

  extractUserId(c: Context): string | undefined {
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        return this.validateToken(token);
      }
      if (authHeader.startsWith('Basic ')) {
        return this.extractBasicAuthUser(authHeader.slice(6));
      }
    }

    const userId = c.req.header('X-User-Id');
    if (userId && this.isValidUserId(userId)) {
      return userId;
    }

    return undefined;
  }

  getStats(): MembraneStats & { appId: string } {
    return { appId: this.appId, ...this.stats };
  }

  updateConfig(config: Partial<MembraneConfig>): void {
    Object.assign(this.config, config);
  }

  private validateToken(token: string): string | undefined {
    if (!token || token.length < 8) return undefined;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.sub && typeof payload.sub === 'string') {
          return payload.sub;
        }
      }
    } catch {
    }
    return undefined;
  }

  private extractBasicAuthUser(encoded: string): string | undefined {
    try {
      const decoded = atob(encoded);
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        return decoded.slice(0, colonIdx);
      }
    } catch {
    }
    return undefined;
  }

  private isValidUserId(userId: string): boolean {
    return userId.length > 0 && userId.length <= 256 && /^[\w.@-]+$/.test(userId);
  }

  private isPathAllowed(requestPath: string): boolean {
    if (!this.allowedPaths) return true;
    const cellPrefix = `/api/cell/${this.appId}`;
    const relativePath = requestPath.startsWith(cellPrefix)
      ? requestPath.slice(cellPrefix.length)
      : requestPath;

    if (this.allowedPaths.has(relativePath)) return true;
    if (this.allowedPaths.has('/*')) return true;

    for (const allowed of this.allowedPaths) {
      if (allowed.includes('*')) {
        const regex = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$');
        if (regex.test(relativePath)) return true;
      }
    }

    return false;
  }
}
