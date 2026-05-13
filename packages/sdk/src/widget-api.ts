import { ref, onUnmounted } from 'vue';
import { useDittoIPC } from './ipc-api';
import type { WidgetSize } from '@ditto/shared';

export function useDittoWidget() {
  const { send, request, onMessage } = useDittoIPC();
  const data = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const error = ref<Error | null>(null);

  function updateData(newData: Record<string, unknown>): void {
    data.value = { ...data.value, ...newData };
    send('widget:update', { data: data.value });
  }

  function getData(): Record<string, unknown> {
    return data.value;
  }

  function requestRefresh(): void {
    send('widget:refresh', {});
  }

  function resize(size: WidgetSize): void {
    send('widget:resize', { size });
  }

  function notifyHost(event: string, payload?: unknown): void {
    send('widget:event', { event, payload });
  }

  async function requestIslandSlot(content: string, options?: {
    icon?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    expandable?: boolean;
    actions?: { label: string; action: string }[];
  }): Promise<string | null> {
    loading.value = true;
    try {
      const result = await request<{ slotId: string | null }>('island:request', {
        content,
        ...options,
      });
      return result.slotId;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  function updateIslandSlot(slotId: string, content: string, options?: {
    icon?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }): void {
    send('island:update', { slotId, content, ...options });
  }

  function removeIslandSlot(slotId: string): void {
    send('island:remove', { slotId });
  }

  const unsub = onMessage('widget:data', (_, payload) => {
    const incoming = payload as Record<string, unknown> | undefined;
    if (incoming) {
      data.value = { ...data.value, ...incoming };
    }
  });

  onUnmounted(() => {
    unsub();
  });

  return {
    data,
    loading,
    error,
    updateData,
    getData,
    requestRefresh,
    resize,
    notifyHost,
    requestIslandSlot,
    updateIslandSlot,
    removeIslandSlot,
  };
}
