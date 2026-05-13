<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { DDesktop, DTaskbar, DWindow, DStartMenu, DContextMenu, DNotification, DDialog } from '@ditto/ui';
import { useWindowStore, useAppStore, useNotificationStore, useDialogStore } from '@ditto/services';
import { getThemeEngine } from '@ditto/theme';
import type { AppManifest } from '@ditto/shared';
import FileManager from './apps/FileManager.vue';
import Settings from './apps/Settings.vue';
import About from './apps/About.vue';
import Market from './apps/Market.vue';

const windowStore = useWindowStore();
const appStore = useAppStore();
const notificationStore = useNotificationStore();
const dialogStore = useDialogStore();
const themeEngine = getThemeEngine();

const startMenuVisible = ref(false);
const contextMenu = ref({ visible: false, x: 0, y: 0, items: [] as { label: string; icon?: string; action?: () => void; divider?: boolean }[] });
const clock = ref('');
const appIframes = ref<Record<string, string>>({});

let clockTimer: ReturnType<typeof setInterval>;

function updateClock() {
  clock.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function onIPCMessage(event: MessageEvent) {
  if (event.data?.type !== 'ditto-ipc') return;
  if (event.data?.channel !== 'ui:notify') return;
  const payload = event.data.payload;
  if (!payload) return;
  notificationStore.pushNotification({
    title: payload.title ?? '',
    body: payload.body ?? '',
    type: payload.type ?? 'info',
    source: event.data.source ?? 'sdk',
    persistent: false,
  });
}

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 10000);
  window.addEventListener('message', onIPCMessage);
});

onUnmounted(() => {
  clearInterval(clockTimer);
  window.removeEventListener('message', onIPCMessage);
});

const builtinAppComponents: Record<string, any> = {
  'com.ditto.files': FileManager,
  'com.ditto.settings': Settings,
  'com.ditto.about': About,
  'com.ditto.market': Market,
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

function toggleTheme() {
  themeEngine.toggleColorScheme();
}

function toggleStartMenu() {
  startMenuVisible.value = !startMenuVisible.value;
}

function closeStartMenu() {
  startMenuVisible.value = false;
}

async function launchApp(appId: string) {
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
      { label: '系统设置', icon: '⚙️', action: () => launchApp('com.ditto.settings') },
      { label: '关于 Ditto', icon: 'ℹ️', action: () => launchApp('com.ditto.about') },
    ],
  };
}

function closeContextMenu() {
  contextMenu.value = { ...contextMenu.value, visible: false };
}

function onTaskbarAppClick(app: AppManifest) {
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
      ></iframe>
    </DWindow>
  </DDesktop>

  <DTaskbar>
    <template #default>
      <button class="start-btn" @click="toggleStartMenu" title="开始菜单">
        🏠
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
</style>
