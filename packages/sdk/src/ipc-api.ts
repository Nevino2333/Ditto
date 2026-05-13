import { ref, onUnmounted } from 'vue';

type MessageHandler = (channel: string, payload: unknown) => void;

const DITTO_MSG_TYPE = 'ditto-ipc';

export function useDittoIPC() {
  const handlers = new Set<() => void>();

  function send(channel: string, payload?: unknown, target?: string): void {
    const message = {
      type: DITTO_MSG_TYPE,
      channel,
      payload,
      target: target ?? 'host',
      source: 'sdk',
      timestamp: Date.now(),
    };
    if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    } else if (window.opener) {
      window.opener.postMessage(message, '*');
    }
  }

  function request<T = unknown>(channel: string, payload?: unknown, timeout = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`IPC request timeout on channel "${channel}"`));
      }, timeout);

      function onMessage(event: MessageEvent) {
        if (event.data?.type !== DITTO_MSG_TYPE) return;
        if (event.data?.channel !== `${channel}:response`) return;
        if (event.data?.payload?.requestId !== requestId) return;
        cleanup();
        if (event.data.payload.error) {
          reject(new Error(event.data.payload.error));
        } else {
          resolve(event.data.payload.data as T);
        }
      }

      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
      }

      window.addEventListener('message', onMessage);
      send(channel, { ...(payload as Record<string, unknown>), requestId });
    });
  }

  function onMessage(channel: string, handler: MessageHandler): () => void {
    function listener(event: MessageEvent) {
      if (event.data?.type !== DITTO_MSG_TYPE) return;
      if (event.data?.channel !== channel) return;
      handler(channel, event.data.payload);
    }
    window.addEventListener('message', listener);
    const unsubscribe = () => {
      window.removeEventListener('message', listener);
    };
    handlers.add(unsubscribe);
    return unsubscribe;
  }

  onUnmounted(() => {
    for (const unsub of handlers) {
      unsub();
    }
    handlers.clear();
  });

  return { send, request, onMessage };
}
