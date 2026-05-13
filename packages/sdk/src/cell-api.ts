import { ref, onUnmounted } from 'vue';
import { useDittoIPC } from './ipc-api';

interface CellFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  autoWake?: boolean;
}

interface CellFetchResult<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

const DEFAULT_TIMEOUT = 15000;
const MAX_RETRIES = 2;

export function useDittoCell() {
  const { send, onMessage } = useDittoIPC();
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const backendStatus = ref<'unknown' | 'running' | 'hibernated' | 'stopped' | 'error'>('unknown');
  let wsConnection: WebSocket | null = null;
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = getStoredToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const userId = getStoredUserId();
    if (userId) {
      headers['X-User-Id'] = userId;
    }

    return headers;
  }

  function getStoredToken(): string | null {
    try {
      return localStorage.getItem('ditto_auth_token') ?? null;
    } catch {
      return null;
    }
  }

  function getStoredUserId(): string | null {
    try {
      return localStorage.getItem('ditto_user_id') ?? null;
    } catch {
      return null;
    }
  }

  async function cellFetch<T = unknown>(appId: string, path: string, options?: CellFetchOptions): Promise<CellFetchResult<T>> {
    loading.value = true;
    error.value = null;

    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const autoWake = options?.autoWake ?? true;

    try {
      if (autoWake && backendStatus.value !== 'running') {
        await ensureBackendRunning(appId);
      }

      const serverUrl = window.location.origin;
      const url = `${serverUrl}/api/cell/${appId}${path}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method: options?.method ?? 'GET',
        headers: {
          ...getAuthHeaders(),
          ...options?.headers,
        },
        signal: controller.signal,
      };

      if (options?.body && options.method !== 'GET') {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let data: T;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as unknown as T;
      }

      if (response.status === 401) {
        error.value = new Error('Authentication required. Please log in.');
      } else if (response.status === 503 && autoWake) {
        const woken = await startBackend(appId);
        if (woken) {
          return cellFetch(appId, path, { ...options, autoWake: false });
        }
        error.value = new Error('Backend is unavailable and could not be started.');
      }

      return { data, status: response.status, headers };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === 'AbortError') {
        error.value = new Error(`Request timed out after ${timeout}ms`);
      } else {
        error.value = err;
      }
      throw error.value;
    } finally {
      loading.value = false;
    }
  }

  async function cellGet<T = unknown>(appId: string, path: string): Promise<T> {
    const result = await cellFetch<T>(appId, path, { method: 'GET' });
    return result.data;
  }

  async function cellPost<T = unknown>(appId: string, path: string, body?: unknown): Promise<T> {
    const result = await cellFetch<T>(appId, path, { method: 'POST', body });
    return result.data;
  }

  async function cellPut<T = unknown>(appId: string, path: string, body?: unknown): Promise<T> {
    const result = await cellFetch<T>(appId, path, { method: 'PUT', body });
    return result.data;
  }

  async function cellDelete<T = unknown>(appId: string, path: string): Promise<T> {
    const result = await cellFetch<T>(appId, path, { method: 'DELETE' });
    return result.data;
  }

  async function checkBackendHealth(appId: string): Promise<{ status: string; runningCells?: number; hibernatedCells?: number }> {
    try {
      const serverUrl = window.location.origin;
      const response = await fetch(`${serverUrl}/api/cell/${appId}/health`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        backendStatus.value = data.status === 'running' ? 'running' : data.status === 'hibernated' ? 'hibernated' : 'stopped';
        return data;
      }
      backendStatus.value = 'error';
      return { status: 'error' };
    } catch {
      backendStatus.value = 'error';
      return { status: 'error' };
    }
  }

  async function startBackend(appId: string): Promise<boolean> {
    try {
      const serverUrl = window.location.origin;
      const response = await fetch(`${serverUrl}/api/cell/${appId}/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        backendStatus.value = 'running';
        return true;
      }
      if (response.status === 503) {
        const data = await response.json().catch(() => null);
        console.warn('[DittoCell] Quota exceeded:', data?.error);
      }
      return false;
    } catch {
      backendStatus.value = 'error';
      return false;
    }
  }

  async function stopBackend(appId: string): Promise<boolean> {
    try {
      const serverUrl = window.location.origin;
      const response = await fetch(`${serverUrl}/api/cell/${appId}/stop`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        backendStatus.value = 'stopped';
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function ensureBackendRunning(appId: string, retries = MAX_RETRIES): Promise<boolean> {
    const health = await checkBackendHealth(appId);
    if (health.status === 'running') return true;

    if (health.status === 'hibernated') {
      const serverUrl = window.location.origin;
      const wakeResponse = await fetch(`${serverUrl}/api/cell/${appId}/wake`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (wakeResponse.ok) {
        backendStatus.value = 'running';
        return true;
      }
    }

    const started = await startBackend(appId);
    if (started) return true;

    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return ensureBackendRunning(appId, retries - 1);
    }

    return false;
  }

  function connectWebSocket(appId: string): WebSocket | null {
    if (wsConnection?.readyState === WebSocket.OPEN) return wsConnection;

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const userId = getStoredUserId();
      const token = getStoredToken();
      ws.send(JSON.stringify({
        type: 'auth',
        userId: userId ?? 'anonymous',
        appId,
        token,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'cell-ipc' && data.appId === appId) {
          const handlers = ipcHandlers.get(data.channel);
          if (handlers) {
            for (const handler of handlers) {
              handler(data.payload);
            }
          }
        }
      } catch { }
    };

    ws.onclose = () => {
      wsReconnectTimer = setTimeout(() => {
        connectWebSocket(appId);
      }, 3000);
    };

    wsConnection = ws;
    return ws;
  }

  function disconnectWebSocket(): void {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  }

  const ipcHandlers = new Map<string, Set<(payload: unknown) => void>>();

  function sendToBackend(appId: string, channel: string, payload: unknown): void {
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'cell-ipc',
        appId,
        channel,
        payload,
      }));
    } else {
      send('cell:ipc', { appId, channel, payload }, 'host');
    }
  }

  function onBackendMessage(channel: string, handler: (payload: unknown) => void): () => void {
    if (!ipcHandlers.has(channel)) {
      ipcHandlers.set(channel, new Set());
    }
    ipcHandlers.get(channel)!.add(handler);
    return () => {
      ipcHandlers.get(channel)?.delete(handler);
    };
  }

  onUnmounted(() => {
    disconnectWebSocket();
    ipcHandlers.clear();
  });

  return {
    loading,
    error,
    backendStatus,
    cellFetch,
    cellGet,
    cellPost,
    cellPut,
    cellDelete,
    checkBackendHealth,
    startBackend,
    stopBackend,
    ensureBackendRunning,
    sendToBackend,
    onBackendMessage,
    connectWebSocket,
    disconnectWebSocket,
  };
}
