import type { Context, Next } from 'hono';
import type { ResourceQuotaManager } from './quota';
import type { TrafficShaper } from './traffic-shaper';

export function createResourceFabricMiddleware(quotaManager: ResourceQuotaManager, trafficShaper: TrafficShaper) {
  return async (c: Context, next: Next) => {
    const appId = c.req.param('appId');
    const userId = c.get('userId') as string | undefined ?? c.header('X-User-Id');

    if (appId) {
      const rateCheck = trafficShaper.checkRate(appId);
      if (!rateCheck.allowed) {
        c.header('Retry-After', String(Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000)));
        c.header('X-RateLimit-Limit', String(trafficShaper.getAppStats(appId)?.maxRequestsPerSecond ?? 0));
        return c.json({
          error: 'Too many requests',
          retryAfter: rateCheck.retryAfterMs,
          appId,
        }, 429);
      }

      if (userId) {
        if (quotaManager.isOverQuota(appId, userId)) {
          const usagePct = quotaManager.getQuotaUsagePercent(appId, userId);
          c.header('X-Quota-Usage', String(Math.round(usagePct)));
          return c.json({
            error: 'Resource quota exceeded',
            appId,
            usagePercent: Math.round(usagePct),
          }, 429);
        }

        quotaManager.recordRequest(appId, userId);
      }
    }

    await next();

    if (appId && userId) {
      quotaManager.releaseConnection(appId, userId);
    }
  };
}
