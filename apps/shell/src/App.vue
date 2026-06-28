<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { DDesktop, DTaskbar, DWindow, DStartMenu, DContextMenu, DNotification, DDialog, DWidgetBoard } from '@ditto/ui';
import { useWindowStore, useAppStore, useNotificationStore, useDialogStore, useWidgetStore } from '@ditto/services';
import { getThemeEngine, adaptExternalTokens, applyTypographyTokens } from '@ditto/theme';
import type { ExternalThemeTokens } from '@ditto/theme';
import type { AppManifest } from '@ditto/shared';

// 懒加载内置应用：减小首屏 bundle，按需加载
const AppLoading = { template: '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;">加载中…</div>' };
const FileManager = defineAsyncComponent({ loader: () => import('./apps/FileManager.vue'), loadingComponent: AppLoading });
const Settings = defineAsyncComponent({ loader: () => import('./apps/Settings.vue'), loadingComponent: AppLoading });
const About = defineAsyncComponent({ loader: () => import('./apps/About.vue'), loadingComponent: AppLoading });
const Market = defineAsyncComponent({ loader: () => import('./apps/Market.vue'), loadingComponent: AppLoading });
const Terminal = defineAsyncComponent({ loader: () => import('./apps/Terminal.vue'), loadingComponent: AppLoading });
const TextEditor = defineAsyncComponent({ loader: () => import('./apps/TextEditor.vue'), loadingComponent: AppLoading });
const SystemMonitor = defineAsyncComponent({ loader: () => import('./apps/SystemMonitor.vue'), loadingComponent: AppLoading });
const Chat = defineAsyncComponent({ loader: () => import('./apps/Chat.vue'), loadingComponent: AppLoading });
const ResourceHub = defineAsyncComponent({ loader: () => import('./apps/ResourceHub.vue'), loadingComponent: AppLoading });

const windowStore = useWindowStore();
const appStore = useAppStore();
const widgetStore = useWidgetStore();
const notificationStore = useNotificationStore();
const dialogStore = useDialogStore();
const themeEngine = getThemeEngine();

const startMenuVisible = ref(false);
const contextMenu = ref({ visible: false, x: 0, y: 0, items: [] as { label: string; icon?: string; action?: () => void; divider?: boolean }[] });
const clock = ref('');
const appIframes = ref<Record<string, string>>({});
const widgetIframes = ref<Record<string, string>>({});

let clockTimer: ReturnType<typeof setInterval>;
let unsubscribeTheme: (() => void) | null = null;

/** 广播消息到所有应用 iframe（让第三方应用收到宿主推送的事件） */
function broadcastToIframes(channel: string, payload: unknown) {
  const message = { type: 'ditto-ipc', channel, payload, source: 'host', timestamp: Date.now() };
  document.querySelectorAll('iframe').forEach((frame) => {
    try { frame.contentWindow?.postMessage(message, '*'); } catch { /* 跨域被阻止，忽略 */ }
  });
}

function updateClock() {
  clock.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function onIPCMessage(event: MessageEvent) {
  if (event.data?.type !== 'ditto-ipc') return;

  const channel = event.data.channel;
  const payload = event.data.payload;
  const requestId = payload?.requestId;

  function respond(data: unknown, error?: string) {
    if (!requestId) return;
    const res = { type: 'ditto-ipc', channel: `${channel}:response`, payload: { requestId, data, error }, source: 'host', timestamp: Date.now() };
    (event.source as Window | null)?.postMessage(res, '*');
  }

  if (channel === 'ui:notify' && payload) {
    notificationStore.pushNotification({
      title: payload.title ?? '',
      body: payload.body ?? '',
      type: payload.type ?? 'info',
      source: event.data.source ?? 'sdk',
      persistent: false,
    });
    return;
  }

  if (channel === 'theme:apply' && payload?.appId) {
    applyThemeFromManifest(payload.appId);
    return;
  }

  if (channel === 'widget:add' && payload?.appId) {
    addWidgetToDesktop(payload.appId);
    return;
  }

  // 主题查询
  if (channel === 'theme:getCurrent') {
    const t = themeEngine.getCurrentTheme();
    respond({ id: t.id, name: t.name, colorScheme: t.colorScheme });
    return;
  }
  if (channel === 'theme:list') {
    respond(themeEngine.getAvailableThemes().map((t) => ({ id: t.id, name: t.name, colorScheme: t.colorScheme })));
    return;
  }
  if (channel === 'theme:getToken') {
    respond({ value: themeEngine.getTokenValue(payload?.path ?? '') });
    return;
  }

  // 主题变更
  if (channel === 'theme:setTheme' && payload?.themeId) {
    themeEngine.setTheme(payload.themeId);
    return;
  }
  if (channel === 'theme:toggleScheme') {
    themeEngine.toggleColorScheme();
    return;
  }
  if (channel === 'theme:setOverride' && payload?.path) {
    themeEngine.setTokenOverride(payload.path, payload.value ?? '');
    return;
  }
  if (channel === 'theme:setComponentOverride' && payload?.componentName) {
    themeEngine.setComponentOverride(payload.componentName, payload.tokens ?? {});
    return;
  }
  if (channel === 'theme:removeComponentOverride' && payload?.componentName) {
    themeEngine.removeComponentOverride(payload.componentName);
    return;
  }
  if (channel === 'theme:setAnimationPreset' && payload?.preset) {
    themeEngine.setAnimationPreset(payload.preset);
    return;
  }
}

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 10000);
  window.addEventListener('message', onIPCMessage);
  // 主题变更时广播给所有 iframe（让第三方应用 SDK useDittoTheme.subscribe 生效）
  unsubscribeTheme = themeEngine.subscribe((theme) => {
    broadcastToIframes('theme:changed', { id: theme.id, name: theme.name, colorScheme: theme.colorScheme });
  });
});

onUnmounted(() => {
  clearInterval(clockTimer);
  window.removeEventListener('message', onIPCMessage);
  if (unsubscribeTheme) unsubscribeTheme();
});

const builtinAppComponents: Record<string, any> = {
  'com.ditto.files': FileManager,
  'com.ditto.settings': Settings,
  'com.ditto.about': About,
  'com.ditto.market': Market,
  'com.ditto.terminal': Terminal,
  'com.ditto.editor': TextEditor,
  'com.ditto.monitor': SystemMonitor,
  'com.ditto.chat': Chat,
  'com.ditto.resources': ResourceHub,
};

function getAppComponent(appId: string) {
  return builtinAppComponents[appId] ?? null;
}

function isBuiltinApp(appId: string): boolean {
  return appId in builtinAppComponents;
}

function getAppIframeUrl(appId: string): string {
  if (appIframes.value[appId]) return appIframes.value[appId];
  const serverUrl = window.location.origin;
  const url = `${serverUrl}/api/apps/${appId}/frontend/index.html`;
  appIframes.value[appId] = url;
  return url;
}

function getWidgetIframeUrl(appId: string): string {
  if (widgetIframes.value[appId]) return widgetIframes.value[appId];
  const serverUrl = window.location.origin;
  const url = `${serverUrl}/api/apps/${appId}/frontend/index.html`;
  widgetIframes.value[appId] = url;
  return url;
}

function toggleTheme() {
  themeEngine.toggleColorScheme();
}

function toggleStartMenu() {
  startMenuVisible.value = !startMenuVisible.value;
}

function closeStartMenu() {
  startMenuVisible.value = false;
}

function applyThemeFromManifest(appId: string) {
  const serverUrl = window.location.origin;
  const tokensUrl = `${serverUrl}/api/apps/${appId}/tokens/tokens.json`;

  fetch(tokensUrl)
    .then((res) => {
      if (!res.ok) throw new Error('tokens not found');
      return res.json();
    })
    .then((tokens) => {
      const manifest = appStore.apps.find((a) => a.id === appId);
      const themeName = manifest?.name ?? appId;

      // 通过适配器将第三方 token schema 转换为 ThemeTokens
      const adapted = adaptExternalTokens(tokens as ExternalThemeTokens);
      const baseColor = adapted.color?.surface?.base ?? adapted.color?.primary?.['500'] ?? '#1a1a2e';
      const colorScheme = isColorDark(baseColor) ? 'dark' : 'light';

      themeEngine.createTheme(appId, themeName, colorScheme, adapted);
      themeEngine.setTheme(appId);

      // 补充 typography token（ThemeTokens 无 typography 字段，直接写 CSS 变量）
      if (tokens.typography) {
        applyTypographyTokens(tokens.typography);
      }

      notificationStore.pushNotification({
        title: '主题已应用',
        body: `已切换到「${themeName}」主题`,
        type: 'success',
        source: 'theme',
        persistent: false,
      });
    })
    .catch(() => {
      notificationStore.pushNotification({
        title: '主题应用失败',
        body: '无法加载主题配色数据',
        type: 'error',
        source: 'theme',
        persistent: false,
      });
    });
}

function isColorDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function addWidgetToDesktop(appId: string) {
  const manifest = appStore.apps.find((a) => a.id === appId);
  if (!manifest) return;

  const existing = widgetStore.registeredWidgets.find((w) => w.id === appId);
  if (!existing) {
    widgetStore.registerWidget({
      id: appId,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      entry: manifest.entry,
      size: 'medium',
      minWidth: manifest.window?.minWidth ?? 200,
      minHeight: manifest.window?.minHeight ?? 150,
      permissions: manifest.permissions,
      type: 'widget',
    });
  }

  const running = widgetStore.instances.find((i) => i.widgetId === appId);
  if (running) {
    notificationStore.pushNotification({
      title: '小组件已在桌面',
      body: `「${manifest.name}」已添加到桌面`,
      type: 'info',
      source: 'widget',
      persistent: false,
    });
    return;
  }

  const offsetX = (widgetStore.instances.length % 4) * 340 + 20;
  const offsetY = Math.floor(widgetStore.instances.length / 4) * 180 + 20;

  widgetStore.addWidget(appId, { x: offsetX, y: offsetY });

  notificationStore.pushNotification({
    title: '小组件已添加',
    body: `「${manifest.name}」已添加到桌面`,
    type: 'success',
    source: 'widget',
    persistent: false,
  });
}

async function launchApp(appId: string) {
  const manifest = appStore.apps.find((a) => a.id === appId);
  if (!manifest) return;

  const appType = manifest.type ?? 'app';

  if (appType === 'theme') {
    applyThemeFromManifest(appId);
    closeStartMenu();
    return;
  }

  if (appType === 'widget') {
    addWidgetToDesktop(appId);
    closeStartMenu();
    return;
  }

  await appStore.launchApp(appId);
  closeStartMenu();
}

function onDesktopContextMenu(e: MouseEvent) {
  e.preventDefault();
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    items: [
      { label: '刷新桌面', icon: '🔄', action: () => {} },
      { divider: true, label: '' },
      { label: '终端', icon: '💻', action: () => launchApp('com.ditto.terminal') },
      { label: '文本编辑器', icon: '📝', action: () => launchApp('com.ditto.editor') },
      { label: '文件管理器', icon: '📁', action: () => launchApp('com.ditto.files') },
      { label: '系统监视器', icon: '📊', action: () => launchApp('com.ditto.monitor') },
      { label: '聊天室', icon: '💬', action: () => launchApp('com.ditto.chat') },
      { label: '资源仓库', icon: '📦', action: () => launchApp('com.ditto.resources') },
      { divider: true, label: '' },
      { label: '系统设置', icon: '⚙️', action: () => launchApp('com.ditto.settings') },
      { label: '关于 Ditto', icon: 'ℹ️', action: () => launchApp('com.ditto.about') },
    ],
  };
}

function closeContextMenu() {
  contextMenu.value = { ...contextMenu.value, visible: false };
}

function onTaskbarAppClick(app: AppManifest) {
  const appType = app.type ?? 'app';

  if (appType === 'theme') {
    applyThemeFromManifest(app.id);
    return;
  }

  if (appType === 'widget') {
    addWidgetToDesktop(app.id);
    return;
  }

  const existing = windowStore.windows.find((w) => w.appId === app.id);
  if (existing) {
    if (existing.state === 'minimized') {
      windowStore.focusWindow(existing.id);
    } else if (windowStore.activeWindowId === existing.id) {
      windowStore.minimizeWindow(existing.id);
    } else {
      windowStore.focusWindow(existing.id);
    }
  } else {
    appStore.launchApp(app.id);
  }
}

function onWindowClose(windowId: string) {
  const instance = appStore.getInstanceByWindowId(windowId);
  if (instance) {
    appStore.terminateApp(instance.id);
  } else {
    windowStore.closeWindow(windowId);
  }
}

const isDark = computed(() => themeEngine.getColorScheme() === 'dark');

function onDialogOk(value?: string) {
  if (dialogStore.type === 'prompt' || dialogStore.type === 'file-open') {
    dialogStore.confirmWithValue(value ?? '');
  } else {
    dialogStore.confirm();
  }
}

function onDialogCancel() {
  dialogStore.cancel();
}
</script>

<template>
  <DDesktop @contextmenu="onDesktopContextMenu">
    <DWidgetBoard>
      <template #default="{ instance }">
        <iframe
        :src="getWidgetIframeUrl(instance.widgetId)"
        class="widget-iframe"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
        allow="clipboard-read; clipboard-write"
        loading="lazy"
      ></iframe>
      </template>
    </DWidgetBoard>

    <DWindow
      v-for="win in windowStore.visibleWindows"
      :key="win.id"
      :window-id="win.id"
      @close="onWindowClose(win.id)"
    >
      <component
        v-if="getAppComponent(win.appId)"
        :is="getAppComponent(win.appId)"
      />
      <iframe
        v-else-if="!isBuiltinApp(win.appId)"
        :src="getAppIframeUrl(win.appId)"
        class="app-iframe"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
        allow="clipboard-read; clipboard-write"
        loading="lazy"
      ></iframe>
    </DWindow>
  </DDesktop>

  <DTaskbar>
    <template #default>
      <button class="start-btn" @click="toggleStartMenu" title="开始菜单">
        <span class="start-btn__home">🏠</span>
        <span class="start-btn__hamburger">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><line x1="3" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </span>
      </button>
    </template>
    <template #tray>
      <button class="tray-btn" @click="toggleTheme" :title="isDark ? '切换浅色' : '切换深色'">
        {{ isDark ? '☀️' : '🌙' }}
      </button>
      <span class="tray-clock">{{ clock }}</span>
    </template>
  </DTaskbar>

  <DStartMenu
    :visible="startMenuVisible"
    @close="closeStartMenu"
    @launch="launchApp"
  />

  <DContextMenu
    :visible="contextMenu.visible"
    :x="contextMenu.x"
    :y="contextMenu.y"
    :items="contextMenu.items"
    @close="closeContextMenu"
  />

  <DNotification />

  <DDialog
    :visible="dialogStore.visible"
    :type="dialogStore.type"
    :title="dialogStore.title"
    :message="dialogStore.message"
    :ok-text="dialogStore.okText"
    :cancel-text="dialogStore.cancelText"
    :placeholder="dialogStore.placeholder"
    :default-value="dialogStore.defaultValue"
    @update:visible="(v) => { if (!v) dialogStore.cancel() }"
    @ok="onDialogOk"
    @cancel="onDialogCancel"
  />
</template>

<style>
:root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: white;
  /* 渲染性能：屏幕外内容跳过渲染（Chrome 85+，旧版本自动降级） */
  content-visibility: auto;
  contain-intrinsic-size: 100% 100%;
}

.widget-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: transparent;
  content-visibility: auto;
  contain-intrinsic-size: 100% 100%;
}

.start-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  transition: background 120ms, transform 100ms;
  color: var(--ditto-color-text-primary, #0f172a);
}

.start-btn__hamburger {
  display: none;
}

.start-btn:hover { background: rgba(0, 0, 0, 0.06); }
.start-btn:active { transform: scale(0.92); }

.tray-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  transition: background 120ms;
}

.tray-btn:hover { background: rgba(0, 0, 0, 0.06); }

.tray-clock {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .start-btn {
    width: 44px;
    height: 44px;
    font-size: 22px;
  }

  .start-btn__home {
    display: none;
  }

  .start-btn__hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tray-btn {
    font-size: 18px;
    padding: 8px;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tray-clock {
    font-size: 13px;
  }
}

/* 平板适配（768-1024px）：折中布局 */
@media (min-width: 769px) and (max-width: 1024px) {
  .start-btn {
    width: 42px;
    height: 42px;
  }

  .tray-clock {
    font-size: 11px;
  }
}

/* 无障碍：尊重用户减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .app-iframe, .widget-iframe {
    outline: 2px solid currentColor;
  }
}
</style>
