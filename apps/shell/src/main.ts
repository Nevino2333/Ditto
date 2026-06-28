import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createKernel } from '@ditto/core';
import { getThemeEngine } from '@ditto/theme';
import { useAppStore, useWindowStore, registerKernelServices } from '@ditto/services';
import App from './App.vue';
import type { AppManifest, ThemeTokens } from '@ditto/shared';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

async function bootstrap() {
  const kernel = createKernel({ kernel: { dev: true } });
  await kernel.init();
  // 阶段 2：注册 8 个 UI 服务到 kernel ServiceRegistry
  registerKernelServices(kernel);
  // 暴露 kernel 给组件树（provide/inject）
  app.provide('kernel', kernel);

  const themeEngine = getThemeEngine();
  applyKernelThemeConfig(kernel, themeEngine);
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

/**
 * 将 DittoConfig.theme 配置项连接到 ThemeEngine：
 * - customTokens：启动时应用到基底主题（创建为 'ditto-custom'）
 * - defaultScheme：若用户未保存主题，按配置初始化
 * - followSystem：监听 prefers-color-scheme 实时跟随
 */
function applyKernelThemeConfig(kernel: ReturnType<typeof createKernel>, themeEngine: ReturnType<typeof getThemeEngine>) {
  const themeConfig = kernel.config.theme;

  // 1) 应用自定义 token：创建为派生主题
  if (themeConfig.customTokens) {
    const baseScheme = themeConfig.defaultScheme;
    const baseTheme = themeEngine.getAvailableThemes().find((t) => t.colorScheme === baseScheme);
    if (baseTheme) {
      themeEngine.createTheme('ditto-custom', `自定义 (${baseTheme.name})`, baseScheme, themeConfig.customTokens as Partial<ThemeTokens>);
    }
  }

  // 2) 默认配色方案：若 localStorage 无保存值，按配置切换
  try {
    const saved = localStorage.getItem('ditto:theme');
    if (!saved) {
      const target = themeEngine.getAvailableThemes().find((t) => t.colorScheme === themeConfig.defaultScheme);
      if (target) themeEngine.setTheme(target.id);
    }
  } catch { /* localStorage 不可用，忽略 */ }

  // 3) 跟随系统配色（prefers-color-scheme）
  if (themeConfig.followSystem && typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystem = (isDark: boolean) => {
      const scheme = isDark ? 'dark' : 'light';
      const target = themeEngine.getAvailableThemes().find((t) => t.colorScheme === scheme);
      if (target) themeEngine.setTheme(target.id);
    };
    // 初始应用
    applySystem(mq.matches);
    // 监听变化（注意旧版浏览器可能不支持 addEventListener，使用 addListener 回退）
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', (e) => applySystem(e.matches));
    } else if (typeof (mq as any).addListener === 'function') {
      (mq as any).addListener((e: MediaQueryListEvent) => applySystem(e.matches));
    }
  }
}

bootstrap();
