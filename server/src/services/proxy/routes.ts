import { Hono } from 'hono';

interface ProxyRule {
  allowedDomains: string[];
  blockedDomains: string[];
  maxContentSize: number;
  timeout: number;
  enableCache: boolean;
}

const defaultRules: ProxyRule = {
  allowedDomains: [],
  blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0', '::1'],
  maxContentSize: 50 * 1024 * 1024,
  timeout: 30000,
  enableCache: true,
};

const responseCache = new Map<string, {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
  contentType: string;
  cachedAt: number;
  expiresAt: number;
}>();

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isDomainAllowed(url: string, rules: ProxyRule): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;

  if (rules.blockedDomains.some(
    (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
  )) return false;

  if (rules.allowedDomains.length > 0) {
    return rules.allowedDomains.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );
  }

  return true;
}

export const proxyRoutes = new Hono();

proxyRoutes.post('/fetch', async (c) => {
  const targetUrl = c.req.header('X-Proxy-Target');
  const method = c.req.header('X-Proxy-Method') ?? 'GET';

  if (!targetUrl) {
    return c.json({ error: 'Missing X-Proxy-Target header' }, 400);
  }

  if (!isDomainAllowed(targetUrl, defaultRules)) {
    return c.json({ error: 'Domain not allowed by proxy policy' }, 403);
  }

  if (defaultRules.enableCache) {
    const cached = responseCache.get(targetUrl);
    if (cached && Date.now() < cached.expiresAt) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': cached.contentType,
          'X-Proxy-Status': String(cached.status),
          'X-Proxy-StatusText': cached.statusText,
          'X-Proxy-Cached': 'true',
          ...Object.fromEntries(
            Object.entries(cached.headers).map(([k, v]) => [`X-Proxy-${k}`, v])
          ),
        },
      });
    }
  }

  try {
    let requestBody: string | undefined;
    const reqContentType = c.req.header('Content-Type');

    if (method !== 'GET' && method !== 'HEAD') {
      try {
        const bodyData = await c.req.json();
        if (bodyData && typeof bodyData === 'object' && 'body' in bodyData && bodyData.body) {
          requestBody = String(bodyData.body);
        }
      } catch { }
    }

    const requestHeaders: Record<string, string> = {};
    const forwardedHeaders = ['Authorization', 'Accept', 'Accept-Language', 'Content-Type'];
    for (const h of forwardedHeaders) {
      const val = c.req.header(h);
      if (val) requestHeaders[h] = val;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), defaultRules.timeout);

    const response = await fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const body = await response.arrayBuffer();

    if (body.byteLength > defaultRules.maxContentSize) {
      return c.json({ error: 'Response too large' }, 502);
    }

    const responseHeaders: Record<string, string> = {};
    const safeHeaders = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'date'];
    response.headers.forEach((value, key) => {
      if (safeHeaders.includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    const responseContentType = response.headers.get('content-type') ?? 'application/octet-stream';

    if (defaultRules.enableCache && response.ok) {
      const cacheControl = response.headers.get('cache-control');
      let maxAge = 3600;
      if (cacheControl) {
        const match = cacheControl.match(/max-age=(\d+)/);
        if (match) maxAge = parseInt(match[1]);
      }

      responseCache.set(targetUrl, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body,
        contentType: responseContentType,
        cachedAt: Date.now(),
        expiresAt: Date.now() + maxAge * 1000,
      });

      if (responseCache.size > 500) {
        const oldest = [...responseCache.entries()]
          .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
        for (let i = 0; i < 100 && i < oldest.length; i++) {
          responseCache.delete(oldest[i][0]);
        }
      }
    }

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': responseContentType,
        'X-Proxy-Status': String(response.status),
        'X-Proxy-StatusText': response.statusText,
        ...Object.fromEntries(
          Object.entries(responseHeaders).map(([k, v]) => [`X-Proxy-${k}`, v])
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy fetch failed';
    return c.json({ error: message }, 502);
  }
});

proxyRoutes.get('/cache/stats', (c) => {
  let totalSize = 0;
  for (const entry of responseCache.values()) {
    totalSize += entry.body.byteLength;
  }
  return c.json({
    count: responseCache.size,
    totalSize,
    maxSize: defaultRules.maxContentSize,
  });
});

proxyRoutes.delete('/cache', (c) => {
  responseCache.clear();
  return c.json({ success: true });
});

proxyRoutes.get('/rules', (c) => {
  return c.json({
    allowedDomains: defaultRules.allowedDomains,
    blockedDomains: defaultRules.blockedDomains,
    maxContentSize: defaultRules.maxContentSize,
    timeout: defaultRules.timeout,
    enableCache: defaultRules.enableCache,
  });
});

proxyRoutes.put('/rules', async (c) => {
  const body = await c.req.json<Partial<ProxyRule>>();
  if (body.allowedDomains !== undefined) defaultRules.allowedDomains = body.allowedDomains;
  if (body.blockedDomains !== undefined) defaultRules.blockedDomains = body.blockedDomains;
  if (body.maxContentSize !== undefined) defaultRules.maxContentSize = body.maxContentSize;
  if (body.timeout !== undefined) defaultRules.timeout = body.timeout;
  if (body.enableCache !== undefined) defaultRules.enableCache = body.enableCache;
  return c.json({ success: true, rules: defaultRules });
});
