import { ref } from 'vue';
import { useDittoIPC } from './ipc-api';

interface AppInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
}

type AppLifecycleEvent = 'init' | 'mount' | 'unmount' | 'suspend' | 'resume' | 'destroy';

interface LifecycleHandler {
  (event: AppLifecycleEvent): void | Promise<void>;
}

export function useDittoApp() {
  const { send, request, onMessage } = useDittoIPC();
  const isReady = ref(false);
  const appInfo = ref<AppInfo | null>(null);
  const lifecycleHandlers = new Map<AppLifecycleEvent, Set<LifecycleHandler>>();

  function registerApp(info: AppInfo): void {
    appInfo.value = info;
    send('app:register', info);
  }

  function onLifecycle(event: AppLifecycleEvent, handler: LifecycleHandler): () => void {
    if (!lifecycleHandlers.has(event)) {
      lifecycleHandlers.set(event, new Set());
    }
    lifecycleHandlers.get(event)!.add(handler);
    return () => {
      lifecycleHandlers.get(event)?.delete(handler);
    };
  }

  function ready(): void {
    isReady.value = true;
    send('app:ready', { id: appInfo.value?.id });
  }

  function exit(): void {
    send('app:exit', { id: appInfo.value?.id });
  }

  function suspend(): void {
    send('app:suspend', { id: appInfo.value?.id });
  }

  async function requestPermission(permission: string): Promise<boolean> {
    const result = await request<{ granted: boolean }>('app:request-permission', { permission });
    return result.granted;
  }

  function getManifest(): AppInfo | null {
    return appInfo.value;
  }

  onMessage('app:lifecycle', (_channel, payload) => {
    const lifecycleEvent = (payload as { event: AppLifecycleEvent })?.event;
    if (!lifecycleEvent) return;

    const handlers = lifecycleHandlers.get(lifecycleEvent);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(lifecycleEvent);
        } catch (e) {
          console.error(`[Ditto SDK] Lifecycle handler error for ${lifecycleEvent}:`, e);
        }
      }
    }
  });

  return {
    isReady,
    appInfo,
    registerApp,
    onLifecycle,
    ready,
    exit,
    suspend,
    requestPermission,
    getManifest,
  };
}
