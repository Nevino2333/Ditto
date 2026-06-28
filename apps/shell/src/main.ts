import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createKernel } from '@ditto/core';
import { getThemeEngine } from '@ditto/theme';
import { useAppStore, useWindowStore } from '@ditto/services';
import App from './App.vue';
import type { AppManifest } from '@ditto/shared';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

async function bootstrap() {
  const kernel = createKernel({ kernel: { dev: true } });
  await kernel.init();

  const themeEngine = getThemeEngine();
  const appStore = useAppStore();
  const windowStore = useWindowStore();

  const builtinApps: AppManifest[] = [
    {
      id: 'com.ditto.files',
      name: '文件管理器',
      version: '0.1.0',
      description: 'Ditto 文件管理器',
      icon: '📁',
      entry: 'files/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 800, height: 600, minWidth: 400, minHeight: 300, resizable: true, maximizable: true },
    },
    {
      id: 'com.ditto.settings',
      name: '系统设置',
      version: '0.1.0',
      description: 'Ditto 系统设置',
      icon: '⚙️',
      entry: 'settings/index.html',
      category: 'system',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 640, height: 480, minWidth: 400, minHeight: 300, resizable: true, maximizable: true },
    },
    {
      id: 'com.ditto.about',
      name: '关于 Ditto',
      version: '0.1.0',
      description: '关于 Ditto WebOS',
      icon: 'ℹ️',
      entry: 'about/index.html',
      category: 'system',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 480, height: 360, minWidth: 320, minHeight: 240, resizable: true, maximizable: true },
    },
    {
      id: 'com.ditto.market',
      name: 'Ditto Market',
      version: '0.1.0',
      description: 'Ditto 应用市场',
      icon: '🛒',
      entry: 'market/index.html',
      category: 'system',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 960, height: 680, minWidth: 640, minHeight: 480, resizable: true, maximizable: true },
    },
  ];

  for (const manifest of builtinApps) {
    appStore.registerApp(manifest, true);
  }

  await syncInstalledApps(appStore);

  window.addEventListener('resize', () => {
    windowStore.updateDeviceMode();
  });

  app.mount('#app');
}

async function syncInstalledApps(appStore: ReturnType<typeof useAppStore>) {
  try {
    const serverUrl = window.location.origin;
    const res = await fetch(`${serverUrl}/api/market/installed`);
    if (!res.ok) return;
    const data = await res.json();
    const installedApps = data.apps ?? [];
    for (const app of installedApps) {
      const manifest: AppManifest = {
        id: app.appId,
        name: app.appName,
        version: app.installedVersion,
        description: '',
        icon: app.icon ?? '📦',
        entry: 'frontend/index.html',
        category: 'installed',
        sandbox: 'trusted',
        permissions: [],
        window: { width: 800, height: 600, minWidth: 400, minHeight: 300, resizable: true, maximizable: true },
      };
      appStore.registerApp(manifest, false);
    }
  } catch {}
}

bootstrap();
