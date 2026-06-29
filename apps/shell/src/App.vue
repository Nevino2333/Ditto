<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import {
  DDesktop, DTaskbar, DWindow, DStartMenu, DContextMenu, DNotification, DDialog, DWidgetBoard,
  DNotificationCenter, DControlCenter, DLockScreen, DTaskSwitcher, DGlobalSearch, DCalendarPanel, DIcon,
} from '@ditto/ui';
import {
  useWindowStore, useAppStore, useNotificationStore, useDialogStore, useWidgetStore,
  usePowerStore, useHotkeyStore, useGlobalHotkey, useSearchStore, useDefaultAppsStore,
} from '@ditto/services';
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
const powerStore = usePowerStore();
const searchStore = useSearchStore();
const defaultAppsStore = useDefaultAppsStore();
const hotkeyStore = useGlobalHotkey(); // 在 Shell 根激活全局快捷键监听
const themeEngine = getThemeEngine();

const startMenuVisible = ref(false);
const contextMenu = ref({ visible: false, x: 0, y: 0, items: [] as { label: string; icon?: string; action?: () => void; divider?: boolean }[] });
const clock = ref('');
const appIframes = ref<Record<string, string>>({});
const widgetIframes = ref<Record<string, string>>({});

// 系统级面板可见性
const notificationCenterVisible = ref(false);
const controlCenterVisible = ref(false);
const taskSwitcherVisible = ref(false);
const globalSearchVisible = ref(false);
const calendarVisible = ref(false);
const calendarAnchor = ref<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // ─── 注册全局快捷键 ───
  // Alt+Tab：多任务切换器（capture 阶段拦截，阻止浏览器默认行为）
  hotkeyStore.register({
    id: 'system:task-switcher',
    combo: 'alt+tab',
    description: '多任务切换',
    handler: () => {
      // 关闭其他系统面板避免遮挡
      notificationCenterVisible.value = false;
      controlCenterVisible.value = false;
      globalSearchVisible.value = false;
      taskSwitcherVisible.value = true;
    },
  });
  // Ctrl+Space：全局搜索
  hotkeyStore.register({
    id: 'system:global-search',
    combo: 'ctrl+space',
    description: '全局搜索',
    handler: () => {
      notificationCenterVisible.value = false;
      controlCenterVisible.value = false;
      taskSwitcherVisible.value = false;
      globalSearchVisible.value = true;
    },
  });
  // Meta+L / Ctrl+L：锁屏
  hotkeyStore.register({
    id: 'system:lock',
    combo: 'meta+l',
    description: '锁屏',
    handler: () => powerStore.lock(),
  });
  // 单注册 Ctrl+L 以兼容无 Meta 键的键盘
  hotkeyStore.register({
    id: 'system:lock-ctrl',
    combo: 'ctrl+l',
    description: '锁屏（Ctrl 备用）',
    handler: () => powerStore.lock(),
  });

  // ─── 注册默认全局搜索命令 ───
  const builtinAppIds = ['com.ditto.terminal', 'com.ditto.editor', 'com.ditto.files', 'com.ditto.monitor', 'com.ditto.settings', 'com.ditto.about'];
  for (const appId of builtinAppIds) {
    const manifest = appStore.apps.find((a) => a.id === appId);
    if (!manifest) continue;
    searchStore.registerCommand({
      id: `launch:${appId}`,
      title: `打开 ${manifest.name}`,
      description: manifest.description,
      icon: manifest.icon,
      keywords: ['open', 'launch', '打开', manifest.name, appId],
      action: () => launchApp(appId),
    });
  }
  searchStore.registerCommand({
    id: 'system:lock-screen',
    title: '锁屏',
    description: '锁定当前会话',
    icon: 'fa-solid fa-lock',
    keywords: ['lock', '锁屏', '锁定'],
    action: () => powerStore.lock(),
  });
  searchStore.registerCommand({
    id: 'system:toggle-theme',
    title: '切换主题',
    description: '在浅色与深色主题间切换',
    icon: 'fa-solid fa-palette',
    keywords: ['theme', 'dark', 'light', '主题', '深色', '浅色'],
    action: () => themeEngine.toggleColorScheme(),
  });

  // ─── 注册内置默认应用处理器 ───
  // 文本编辑器作为 .md/.txt/.json/.js/.ts/.html/.css 的默认处理器
  const textExtensions = ['.md', '.markdown', '.txt', '.json', '.js', '.ts', '.html', '.css', '.csv', '.log', '.xml', '.yml', '.yaml'];
  for (const ext of textExtensions) {
    defaultAppsStore.registerExtensionHandler(ext, 'com.ditto.editor', true);
  }
  defaultAppsStore.registerMimeHandler('text/markdown', 'com.ditto.editor', true);
  defaultAppsStore.registerMimeHandler('text/plain', 'com.ditto.editor', true);
  defaultAppsStore.registerMimeHandler('application/json', 'com.ditto.editor', true);
  // 终端作为 .sh 的默认处理器
  defaultAppsStore.registerExtensionHandler('.sh', 'com.ditto.terminal', false);
  // 文件管理器作为目录的默认处理器
  defaultAppsStore.registerMimeHandler('inode/directory', 'com.ditto.files', true);
});

onUnmounted(() => {
  clearInterval(clockTimer);
  window.removeEventListener('message', onIPCMessage);
  if (unsubscribeTheme) unsubscribeTheme();
});

// ─── 监听 PowerService 事件，执行副作用 ───
// 设计：store 只广播状态，副作用集中在 Shell（可注入自定义行为，便于 Kiosk 场景定制）
watch(
  () => powerStore.lastEvent,
  (evt) => {
    if (!evt) return;
    // 防止短时间内同一动作重复触发
    if (Date.now() - evt.timestamp > 5000) return;
    switch (evt.action) {
      case 'lock':
        // 锁屏：保持会话，仅显示锁屏覆盖层（不关窗口）
        // locked 状态由 watch(powerStore.locked) 单独处理 UI
        break;
      case 'logout':
        // 注销：关闭所有窗口，会话由 DLockScreen 显示
        closeAllWindows();
        break;
      case 'sleep':
        // 睡眠：视觉提示后重置（PWA 无法真实睡眠）
        notificationStore.pushNotification({
          title: '系统进入睡眠',
          body: '点击任意位置唤醒',
          type: 'info',
          source: 'power',
          persistent: false,
        });
        powerStore.resetTransition();
        break;
      case 'restart':
        // 重启：关闭所有窗口后重新加载 shell
        closeAllWindows();
        setTimeout(() => {
          window.location.reload();
        }, 400);
        break;
      case 'shutdown':
        // 关机：关闭所有窗口并显示关机画面（PWA 无法真实关机）
        closeAllWindows();
        notificationStore.pushNotification({
          title: '系统已关机',
          body: '刷新页面以重新启动',
          type: 'warning',
          source: 'power',
          persistent: true,
        });
        // 不立即 resetTransition，让 UI 维持关机状态
        break;
    }
  },
);

function closeAllWindows() {
  for (const w of [...windowStore.windows]) {
    const instance = appStore.getInstanceByWindowId(w.id);
    if (instance) appStore.terminateApp(instance.id);
    else windowStore.closeWindow(w.id);
  }
}

// 任务切换器选择窗口：聚焦该窗口
function onTaskSwitcherSelect(windowId: string) {
  windowStore.focusWindow(windowId);
  taskSwitcherVisible.value = false;
}

// 时钟点击：展开日历面板，锚点为时钟按钮位置
function onClockClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  calendarAnchor.value = { x: rect.right, y: rect.top };
  calendarVisible.value = !calendarVisible.value;
}

// 任务栏按钮：切换通知中心
function toggleNotificationCenter() {
  controlCenterVisible.value = false;
  calendarVisible.value = false;
  notificationCenterVisible.value = !notificationCenterVisible.value;
}

// 任务栏按钮：切换控制中心
function toggleControlCenter() {
  notificationCenterVisible.value = false;
  calendarVisible.value = false;
  controlCenterVisible.value = !controlCenterVisible.value;
}

// 关闭任意系统面板（点开始菜单时统一关闭）
function closeAllSystemPanels() {
  notificationCenterVisible.value = false;
  controlCenterVisible.value = false;
  taskSwitcherVisible.value = false;
  globalSearchVisible.value = false;
  calendarVisible.value = false;
}

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
  const next = !startMenuVisible.value;
  if (next) closeAllSystemPanels();
  startMenuVisible.value = next;
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
      { label: '刷新桌面', icon: 'fa-solid fa-rotate', action: () => {} },
      { divider: true, label: '' },
      { label: '终端', icon: 'fa-solid fa-terminal', action: () => launchApp('com.ditto.terminal') },
      { label: '文本编辑器', icon: 'fa-solid fa-file-lines', action: () => launchApp('com.ditto.editor') },
      { label: '文件管理器', icon: 'fa-solid fa-folder', action: () => launchApp('com.ditto.files') },
      { label: '系统监视器', icon: 'fa-solid fa-gauge-high', action: () => launchApp('com.ditto.monitor') },
      { label: '聊天室', icon: 'fa-solid fa-comments', action: () => launchApp('com.ditto.chat') },
      { label: '资源仓库', icon: 'fa-solid fa-box-archive', action: () => launchApp('com.ditto.resources') },
      { divider: true, label: '' },
      { label: '系统设置', icon: 'fa-solid fa-gear', action: () => launchApp('com.ditto.settings') },
      { label: '关于 Ditto', icon: 'fa-solid fa-circle-info', action: () => launchApp('com.ditto.about') },
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
        <DIcon name="fa-solid fa-house" class="start-btn__home" />
        <DIcon name="fa-solid fa-bars" class="start-btn__hamburger" size="20px" />
      </button>
    </template>
    <template #tray>
      <!-- 通知中心按钮（带未读 badge） -->
      <button
        class="tray-btn tray-btn--icon"
        :class="{ 'tray-btn--active': notificationCenterVisible }"
        @click="toggleNotificationCenter"
        :title="notificationStore.unreadCount > 0 ? `${notificationStore.unreadCount} 条未读通知` : '通知中心'"
        :aria-label="`通知中心，${notificationStore.unreadCount} 条未读`"
      >
        <DIcon name="fa-solid fa-bell" size="16px" />
        <span v-if="notificationStore.unreadCount > 0" class="tray-badge">{{ notificationStore.unreadCount > 99 ? '99+' : notificationStore.unreadCount }}</span>
      </button>

      <!-- 控制中心按钮 -->
      <button
        class="tray-btn tray-btn--icon"
        :class="{ 'tray-btn--active': controlCenterVisible }"
        @click="toggleControlCenter"
        title="控制中心"
        aria-label="控制中心"
      >
        <DIcon name="fa-solid fa-sliders" size="16px" />
      </button>

      <!-- 主题切换按钮 -->
      <button class="tray-btn tray-btn--icon" @click="toggleTheme" :title="isDark ? '切换浅色' : '切换深色'" :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'">
        <DIcon :name="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" />
      </button>

      <!-- 时钟：点击展开日历下拉 -->
      <button class="tray-btn tray-btn--clock" @click="onClockClick" :class="{ 'tray-btn--active': calendarVisible }" title="日历" aria-label="日历">
        <span class="tray-clock">{{ clock }}</span>
      </button>
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

  <!-- 系统级面板：通知中心 / 控制中心 / 日历下拉 -->
  <DNotificationCenter
    :visible="notificationCenterVisible"
    @close="notificationCenterVisible = false"
  />
  <DControlCenter
    :visible="controlCenterVisible"
    @close="controlCenterVisible = false"
  />
  <DCalendarPanel
    :visible="calendarVisible"
    :anchor="calendarAnchor"
    @close="calendarVisible = false"
  />

  <!-- 全局模态：多任务切换 / 全局搜索 -->
  <DTaskSwitcher
    :visible="taskSwitcherVisible"
    @close="taskSwitcherVisible = false"
    @select="onTaskSwitcherSelect"
  />
  <DGlobalSearch
    :visible="globalSearchVisible"
    @close="globalSearchVisible = false"
  />

  <!-- 锁屏：watch powerStore.locked -->
  <DLockScreen
    :visible="powerStore.locked"
    @unlock="powerStore.unlock()"
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ditto-color-text-primary, #0f172a);
}

.tray-btn:hover { background: rgba(0, 0, 0, 0.06); }

.tray-btn--active {
  background: var(--ditto-color-primary-100, rgba(59, 130, 246, 0.14));
  color: var(--ditto-color-primary-600, #2563eb);
}

.tray-btn--icon {
  width: 32px;
  height: 32px;
}

.tray-btn--clock {
  padding: 4px 10px;
  min-height: 32px;
}

.tray-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--ditto-color-semantic-error, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--ditto-color-surface-overlay, #fff);
  pointer-events: none;
}

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

  .tray-btn--icon {
    width: 44px;
    height: 44px;
  }

  .tray-btn--clock {
    padding: 8px 12px;
  }

  .tray-badge {
    min-width: 18px;
    height: 18px;
    font-size: 11px;
    line-height: 18px;
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
