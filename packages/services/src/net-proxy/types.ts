export interface ProxyConfig {
  enabled: boolean;
  serverUrl: string;
  mode: 'auto' | 'always' | 'never';
  allowedDomains: string[];
  blockedDomains: string[];
  cacheEnabled: boolean;
  cacheMaxAge: number;
  requestTimeout: number;
}

export const defaultProxyConfig: ProxyConfig = {
  enabled: false,
  serverUrl: '',
  mode: 'auto',
  allowedDomains: [],
  blockedDomains: [],
  cacheEnabled: true,
  cacheMaxAge: 3600000,
  requestTimeout: 30000,
};

export interface ProxyCacheEntry {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  contentType: string;
  cachedAt: number;
  expiresAt: number;
}

export interface ProxyRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeout?: number;
  forceProxy?: boolean;
  forceRefresh?: boolean;
  contentType?: string;
}

export interface ProxyResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
  contentType: string;
  fromCache: boolean;
  viaProxy: boolean;
}
