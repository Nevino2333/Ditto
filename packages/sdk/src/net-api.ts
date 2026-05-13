import { ref, onUnmounted } from 'vue';
import { useDittoIPC } from './ipc-api';

export function useDittoNet() {
  const { request, send } = useDittoIPC();
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetch(url: string, options?: RequestInit): Promise<Response> {
    loading.value = true;
    error.value = null;
    try {
      const result = await request<{ ok: boolean; status: number; body: ArrayBuffer; headers: Record<string, string> }>('net:fetch', {
        url,
        method: options?.method ?? 'GET',
        headers: options?.headers,
        body: options?.body,
      });
      return new Response(result.body, {
        status: result.status,
        headers: new Headers(result.headers),
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getText(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
  }

  async function getJSON<T = unknown>(url: string): Promise<T> {
    const response = await fetch(url);
    return response.json();
  }

  async function getBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    return response.blob();
  }

  return { fetch, getText, getJSON, getBlob, loading, error };
}
