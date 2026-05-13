import { defineStore } from 'pinia';
import type { AppManifest } from '@ditto/shared';
import { useWindowStore } from '../window-manager';

interface RegisteredApp {
  manifest: AppManifest;
  pinned: boolean;
}

export interface AppInstance {
  id: string;
  appId: string;
  windowId: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  startedAt: number;
}

const APP_ID_REGEX = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+/;

function validateManifest(manifest: AppManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id) {
    errors.push('App manifest must have an id');
  } else if (!APP_ID_REGEX.test(manifest.id)) {
    errors.push(`App id "${manifest.id}" must be in reverse-domain format (e.g. com.example.app)`);
  }

  if (!manifest.name || manifest.name.trim().length === 0) {
    errors.push('App manifest must have a non-empty name');
  }

  if (!manifest.version) {
    errors.push('App manifest must have a version');
  } else if (!SEMVER_REGEX.test(manifest.version)) {
    errors.push(`App version "${manifest.version}" should follow semver (e.g. 1.0.0)`);
  }

  if (!manifest.entry) {
    errors.push('App manifest must have an entry');
  }

  if (!manifest.sandbox || !['strict', 'trusted'].includes(manifest.sandbox)) {
    errors.push('App manifest sandbox must be "strict" or "trusted"');
  }

  if (!manifest.window) {
    errors.push('App manifest must have window configuration');
  } else {
    if (manifest.window.width < 100 || manifest.window.height < 100) {
      errors.push('Window size must be at least 100x100');
    }
    if (manifest.window.minWidth && manifest.window.minWidth < 50) {
      errors.push('Window minWidth must be at least 50');
    }
    if (manifest.window.minHeight && manifest.window.minHeight < 50) {
      errors.push('Window minHeight must be at least 50');
    }
  }

  return errors;
}

export const useAppStore = defineStore('ditto-apps', {
  state: () => ({
    registeredApps: [] as RegisteredApp[],
    instances: [] as AppInstance[],
  }),

  getters: {
    apps: (state): AppManifest[] =>
      state.registeredApps.map((r) => r.manifest),
    pinnedApps: (state): AppManifest[] =>
      state.registeredApps.filter((r) => r.pinned).map((r) => r.manifest),
    runningAppIds(): string[] {
      return this.instances
        .filter((i) => i.status === 'running')
        .map((i) => i.appId);
    },
    runningApps(): AppManifest[] {
      const runningIds = new Set(this.runningAppIds);
      return this.registeredApps
        .filter((r) => runningIds.has(r.manifest.id))
        .map((r) => r.manifest);
    },
    runningInstances: (state): AppInstance[] =>
      state.instances.filter((i) => i.status === 'running'),
  },

  actions: {
    registerApp(manifest: AppManifest, pinned = false): string[] | null {
      if (this.registeredApps.some((r) => r.manifest.id === manifest.id)) return null;

      const errors = validateManifest(manifest);
      if (errors.length > 0) {
        console.error(`[Ditto AppManager] Invalid manifest for "${manifest.id}":`, errors);
        return errors;
      }

      this.registeredApps.push({ manifest, pinned });
      return null;
    },

    unregisterApp(appId: string) {
      const idx = this.registeredApps.findIndex((r) => r.manifest.id === appId);
      if (idx !== -1) {
        this.registeredApps.splice(idx, 1);
      }
    },

    pinApp(appId: string) {
      const app = this.registeredApps.find((r) => r.manifest.id === appId);
      if (app) app.pinned = true;
    },

    unpinApp(appId: string) {
      const app = this.registeredApps.find((r) => r.manifest.id === appId);
      if (app) app.pinned = false;
    },

    async launchApp(appId: string): Promise<string | null> {
      const registered = this.registeredApps.find((r) => r.manifest.id === appId);
      if (!registered) return null;

      const windowStore = useWindowStore();
      windowStore.openWindow(registered.manifest);

      const windowId = windowStore.windows[windowStore.windows.length - 1]?.id;
      if (!windowId) return null;

      const instance: AppInstance = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        appId,
        windowId,
        status: 'starting',
        startedAt: Date.now(),
      };

      this.instances.push(instance);

      requestAnimationFrame(() => {
        const inst = this.instances.find((i) => i.id === instance.id);
        if (inst) inst.status = 'running';
      });

      return instance.id;
    },

    async terminateApp(instanceId: string): Promise<void> {
      const instance = this.instances.find((i) => i.id === instanceId);
      if (!instance) return;

      instance.status = 'stopping';

      const windowStore = useWindowStore();
      windowStore.closeWindow(instance.windowId);

      const idx = this.instances.findIndex((i) => i.id === instanceId);
      if (idx !== -1) {
        this.instances.splice(idx, 1);
      }
    },

    async terminateAllApps(): Promise<void> {
      const running = [...this.instances].reverse();
      for (const instance of running) {
        await this.terminateApp(instance.id);
      }
    },

    getInstanceByWindowId(windowId: string): AppInstance | undefined {
      return this.instances.find((i) => i.windowId === windowId);
    },

    getInstancesByAppId(appId: string): AppInstance[] {
      return this.instances.filter((i) => i.appId === appId);
    },
  },
});
