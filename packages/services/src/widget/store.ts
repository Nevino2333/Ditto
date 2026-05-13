import { defineStore } from 'pinia';
import type { WidgetManifest, WidgetInstance, WidgetSize } from '@ditto/shared';
import { generateId } from '@ditto/shared';

const SIZE_MAP: Record<WidgetSize, { width: number; height: number }> = {
  small: { width: 160, height: 160 },
  medium: { width: 320, height: 160 },
  large: { width: 320, height: 320 },
};

export const useWidgetStore = defineStore('ditto-widgets', {
  state: () => ({
    registeredWidgets: [] as WidgetManifest[],
    instances: [] as WidgetInstance[],
  }),

  getters: {
    standaloneWidgets: (state): WidgetManifest[] =>
      state.registeredWidgets.filter((w) => !w.appId),
    appWidgets: (state) => (appId: string): WidgetManifest[] =>
      state.registeredWidgets.filter((w) => w.appId === appId),
    runningInstances: (state): WidgetInstance[] =>
      state.instances.filter((i) => i.status === 'running'),
    instancesByApp: (state) => (appId: string): WidgetInstance[] =>
      state.instances.filter((i) => i.appId === appId),
  },

  actions: {
    registerWidget(manifest: WidgetManifest): void {
      if (this.registeredWidgets.some((w) => w.id === manifest.id)) return;
      this.registeredWidgets.push(manifest);
    },

    unregisterWidget(widgetId: string): void {
      this.registeredWidgets = this.registeredWidgets.filter((w) => w.id !== widgetId);
      this.instances = this.instances.filter((i) => i.widgetId !== widgetId);
    },

    registerAppWidgets(appId: string, manifests: WidgetManifest[]): void {
      for (const m of manifests) {
        this.registerWidget({ ...m, appId });
      }
    },

    unregisterAppWidgets(appId: string): void {
      const widgetIds = this.registeredWidgets
        .filter((w) => w.appId === appId)
        .map((w) => w.id);
      for (const id of widgetIds) {
        this.unregisterWidget(id);
      }
    },

    addWidget(widgetId: string, position?: { x: number; y: number }): WidgetInstance | null {
      const manifest = this.registeredWidgets.find((w) => w.id === widgetId);
      if (!manifest) return null;

      const dims = SIZE_MAP[manifest.size];
      const instance: WidgetInstance = {
        id: generateId(),
        widgetId,
        appId: manifest.appId,
        manifest,
        position: position ?? { x: 20, y: 20 },
        size: manifest.size,
        status: 'loading',
      };

      this.instances.push(instance);

      requestAnimationFrame(() => {
        const inst = this.instances.find((i) => i.id === instance.id);
        if (inst) {
          inst.status = 'running';
          inst.lastUpdated = Date.now();
        }
      });

      return instance;
    },

    removeWidget(instanceId: string): void {
      const idx = this.instances.findIndex((i) => i.id === instanceId);
      if (idx !== -1) {
        this.instances[idx].status = 'stopped';
        this.instances.splice(idx, 1);
      }
    },

    moveWidget(instanceId: string, position: { x: number; y: number }): void {
      const inst = this.instances.find((i) => i.id === instanceId);
      if (inst) {
        inst.position = { x: Math.max(0, position.x), y: Math.max(0, position.y) };
      }
    },

    resizeWidget(instanceId: string, size: WidgetSize): void {
      const inst = this.instances.find((i) => i.id === instanceId);
      if (inst) {
        inst.size = size;
      }
    },

    updateWidgetData(instanceId: string): void {
      const inst = this.instances.find((i) => i.id === instanceId);
      if (inst && inst.status === 'running') {
        inst.lastUpdated = Date.now();
      }
    },

    setError(instanceId: string, error: Error): void {
      const inst = this.instances.find((i) => i.id === instanceId);
      if (inst) {
        inst.status = 'error';
        inst.error = error;
      }
    },
  },
});
