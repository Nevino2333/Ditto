import type { ProxyConfig, ProxyRequestOptions, ProxyResponse } from './types';
import { defaultProxyConfig } from './types';
import { ProxyCache } from './cache';

type ProxyConfigChangeHandler = (config: ProxyConfig) => void;

export class NetProxy {
  private config: ProxyConfig;
  private cache: ProxyCache;
  private configHandlers = new Set<ProxyConfigChangeHandler>();
  private connectivityCache = new Map<string, { reachable: boolean; checkedAt: number }>();
  private connectivityTTL = 60000;

  constructor(config?: Partial<ProxyConfig>) {
    this.config = { ...defaultProxyConfig, ...config };
    this.cache = new ProxyCache(this.config);
    this.loadSavedConfig();
  }

  getConfig(): ProxyConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...partial };
    this.cache.updateConfig(this.config);
    this.saveConfig();
    this.notifyConfigChange();
  }

  async request(url: string, options: ProxyRequestOptions = {}): Promise<ProxyResponse> {
    if (this.isBlocked(url)) {
      return {
        ok: false,
        status: 403,
        statusText: 'Blocked by policy',
        headers: {},
        body: new ArrayBuffer(0),
        contentType: 'text/plain',
        fromCache: false,
        viaProxy: false,
      };
    }

    if (!options.forceRefresh) {
      const cached = await this.cache.get(url);
      if (cached) {
        return {
          ok: cached.status >= 200 && cached.status < 300,
          status: cached.status,
          statusText: '',
          headers: cached.headers,
          body: cached.body,
          contentType: cached.contentType,
          fromCache: true,
          viaProxy: false,
        };
      }
    }

    const shouldProxy = this.shouldUseProxy(url, options.forceProxy);

    if (shouldProxy) {
      return this.proxyRequest(url, options);
    }

    try {
      const response = await this.directRequest(url, options);
      if (response.ok && this.isCacheable(url)) {
        await this.cacheResponse(url, response);
      }
      return response;
    } catch (directError) {
      if (this.config.mode === 'auto' && this.config.enabled) {
        console.warn(`[Ditto NetProxy] Direct request failed for ${url}, falling back to proxy`);
        this.markUnreachable(url);
        try {
          return await this.proxyRequest(url, options);
        } catch (proxyError) {
          return this.createErrorResponse(url, directError);
        }
      }
      return this.createErrorResponse(url, directError);
    }
  }

  async getText(url: string, options?: ProxyRequestOptions): Promise<string> {
    const response = await this.request(url, options);
    return new TextDecoder().decode(response.body);
  }

  async getJSON<T = unknown>(url: string, options?: ProxyRequestOptions): Promise<T> {
    const text = await this.getText(url, options);
    return JSON.parse(text);
  }

  async getBlob(url: string, options?: ProxyRequestOptions): Promise<Blob> {
    const response = await this.request(url, options);
    return new Blob([response.body], { type: response.contentType });
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async getCacheStats(): Promise<{ count: number; size: number }> {
    return this.cache.getStats();
  }

  onConfigChange(handler: ProxyConfigChangeHandler): () => void {
    this.configHandlers.add(handler);
    return () => this.configHandlers.delete(handler);
  }

  private shouldUseProxy(url: string, forceProxy?: boolean): boolean {
    if (forceProxy) return true;
    if (this.config.mode === 'never') return false;
    if (this.config.mode === 'always') return this.config.enabled;
    if (!this.config.enabled) return false;

    if (!this.isAllowed(url)) return false;

    const domain = this.extractDomain(url);
    const cached = this.connectivityCache.get(domain);
    if (cached && Date.now() - cached.checkedAt < this.connectivityTTL) {
      return !cached.reachable;
    }

    return false;
  }

  private async directRequest(url: string, options: ProxyRequestOptions): Promise<ProxyResponse> {
    const controller = new AbortController();
    const timeout = options.timeout ?? this.config.requestTimeout;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      this.markReachable(url);

      const body = await response.arrayBuffer();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        fromCache: false,
        viaProxy: false,
      };
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  private async proxyRequest(url: string, options: ProxyRequestOptions): Promise<ProxyResponse> {
    const serverUrl = this.config.serverUrl;
    if (!serverUrl) throw new Error('Proxy server URL not configured');

    const proxyEndpoint = `${serverUrl}/api/proxy/fetch`;
    const controller = new AbortController();
    const timeout = options.timeout ?? this.config.requestTimeout;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Target': url,
          'X-Proxy-Method': options.method ?? 'GET',
          ...(options.headers ?? {}),
        },
        body: options.body instanceof ArrayBuffer
          ? JSON.stringify({ url, method: options.method ?? 'GET', body: null, headers: options.headers })
          : JSON.stringify({
              url,
              method: options.method ?? 'GET',
              body: options.body ? String(options.body) : null,
              headers: options.headers,
            }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const body = await response.arrayBuffer();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key.startsWith('x-proxy-')) {
          headers[key.replace('x-proxy-', '')] = value;
        }
      });

      const result: ProxyResponse = {
        ok: response.ok,
        status: parseInt(response.headers.get('x-proxy-status') ?? String(response.status)),
        statusText: response.headers.get('x-proxy-statustext') ?? '',
        headers,
        body,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        fromCache: false,
        viaProxy: true,
      };

      if (result.ok && this.isCacheable(url)) {
        await this.cacheResponse(url, result);
      }

      return result;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  private async cacheResponse(url: string, response: ProxyResponse): Promise<void> {
    await this.cache.set(url, {
      status: response.status,
      headers: response.headers,
      body: response.body,
      contentType: response.contentType,
    });
  }

  private createErrorResponse(url: string, error: unknown): ProxyResponse {
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : 'Network error',
      headers: {},
      body: new ArrayBuffer(0),
      contentType: 'text/plain',
      fromCache: false,
      viaProxy: false,
    };
  }

  private isBlocked(url: string): boolean {
    if (this.config.blockedDomains.length === 0) return false;
    const domain = this.extractDomain(url);
    return this.config.blockedDomains.some(
      (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
    );
  }

  private isAllowed(url: string): boolean {
    if (this.config.allowedDomains.length === 0) return true;
    const domain = this.extractDomain(url);
    return this.config.allowedDomains.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );
  }

  private isCacheable(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      return true;
    } catch {
      return false;
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private markReachable(url: string): void {
    const domain = this.extractDomain(url);
    this.connectivityCache.set(domain, { reachable: true, checkedAt: Date.now() });
  }

  private markUnreachable(url: string): void {
    const domain = this.extractDomain(url);
    this.connectivityCache.set(domain, { reachable: false, checkedAt: Date.now() });
  }

  private notifyConfigChange(): void {
    for (const handler of this.configHandlers) {
      try { handler(this.config); } catch { /* ignore */ }
    }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('ditto:proxy-config', JSON.stringify(this.config));
    } catch { /* ignore */ }
  }

  private loadSavedConfig(): void {
    try {
      const saved = localStorage.getItem('ditto:proxy-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...defaultProxyConfig, ...parsed };
        this.cache.updateConfig(this.config);
      }
    } catch { /* ignore */ }
  }
}

let instance: NetProxy | null = null;

export function getNetProxy(): NetProxy {
  if (!instance) {
    instance = new NetProxy();
  }
  return instance;
}
