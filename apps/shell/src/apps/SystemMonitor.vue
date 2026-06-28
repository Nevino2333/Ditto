<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from 'vue';
import { useWindowStore, useAppStore, useNotificationStore } from '@ditto/services';
import { getThemeEngine } from '@ditto/theme';
import type { DittoKernel } from '@ditto/core';

const windowStore = useWindowStore();
const appStore = useAppStore();
const notificationStore = useNotificationStore();
const themeEngine = getThemeEngine();
const kernel = inject<DittoKernel>('kernel');

const refreshInterval = ref(2000);
let timer: ReturnType<typeof setInterval>;

const stats = ref({
  windows: 0,
  runningApps: 0,
  installedApps: 0,
  notifications: 0,
  kernelState: 'unknown',
  services: 0,
  cells: 0,
  themes: 0,
  currentTheme: '',
  colorScheme: '',
  layoutMode: '',
  deviceMode: '',
  uptime: 0,
});

const startTime = Date.now();

function refresh() {
  const themes = themeEngine.getAvailableThemes();
  const current = themeEngine.getCurrentTheme();
  const cellManager = (kernel as any)?.cellManager;
  let cellCount = 0;
  try { cellCount = cellManager?.getAllCells?.()?.length ?? 0; } catch { cellCount = 0; }
  let serviceCount = 0;
  try { serviceCount = (kernel as any)?.services?.list?.()?.length ?? 0; } catch { serviceCount = 0; }

  stats.value = {
    windows: windowStore.windows.length,
    runningApps: appStore.instances.length,
    installedApps: appStore.apps.length,
    notifications: notificationStore.notifications.length,
    kernelState: (kernel as any)?.state ?? 'unknown',
    services: serviceCount,
    cells: cellCount,
    themes: themes.length,
    currentTheme: current.name,
    colorScheme: current.colorScheme,
    layoutMode: windowStore.layoutMode,
    deviceMode: windowStore.deviceMode,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, refreshInterval.value);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="monitor">
    <div class="monitor__header">
      <h2 class="monitor__title">系统监视器</h2>
      <span class="monitor__uptime">运行时间: {{ formatUptime(stats.uptime) }}</span>
    </div>

    <div class="monitor__grid">
      <div class="monitor__card">
        <div class="monitor__card-icon">🪟</div>
        <div class="monitor__card-value">{{ stats.windows }}</div>
        <div class="monitor__card-label">活动窗口</div>
      </div>
      <div class="monitor__card">
        <div class="monitor__card-icon">⚡</div>
        <div class="monitor__card-value">{{ stats.runningApps }}</div>
        <div class="monitor__card-label">运行中应用</div>
      </div>
      <div class="monitor__card">
        <div class="monitor__card-icon">📦</div>
        <div class="monitor__card-value">{{ stats.installedApps }}</div>
        <div class="monitor__card-label">已安装应用</div>
      </div>
      <div class="monitor__card">
        <div class="monitor__card-icon">🔔</div>
        <div class="monitor__card-value">{{ stats.notifications }}</div>
        <div class="monitor__card-label">通知</div>
      </div>
      <div class="monitor__card">
        <div class="monitor__card-icon">🧩</div>
        <div class="monitor__card-value">{{ stats.cells }}</div>
        <div class="monitor__card-label">Cell 实例</div>
      </div>
      <div class="monitor__card">
        <div class="monitor__card-icon">🛠️</div>
        <div class="monitor__card-value">{{ stats.services }}</div>
        <div class="monitor__card-label">已注册服务</div>
      </div>
    </div>

    <div class="monitor__section">
      <h3 class="monitor__section-title">内核状态</h3>
      <div class="monitor__rows">
        <div class="monitor__row">
          <span class="monitor__row-label">内核状态</span>
          <span class="monitor__row-value monitor__badge" :data-state="stats.kernelState">{{ stats.kernelState }}</span>
        </div>
        <div class="monitor__row">
          <span class="monitor__row-label">当前主题</span>
          <span class="monitor__row-value">{{ stats.currentTheme }} ({{ stats.colorScheme === 'dark' ? '深色' : '浅色' }})</span>
        </div>
        <div class="monitor__row">
          <span class="monitor__row-label">可用主题数</span>
          <span class="monitor__row-value">{{ stats.themes }}</span>
        </div>
        <div class="monitor__row">
          <span class="monitor__row-label">窗口布局</span>
          <span class="monitor__row-value">{{ stats.layoutMode }}</span>
        </div>
        <div class="monitor__row">
          <span class="monitor__row-label">设备模式</span>
          <span class="monitor__row-value">{{ stats.deviceMode }}</span>
        </div>
      </div>
    </div>

    <div class="monitor__section">
      <h3 class="monitor__section-title">运行中应用</h3>
      <div class="monitor__list">
        <div v-if="appStore.instances.length === 0" class="monitor__empty">暂无运行中的应用</div>
        <div v-for="inst in appStore.instances" :key="inst.id" class="monitor__list-item">
          <span class="monitor__list-icon">📦</span>
          <span class="monitor__list-name">{{ inst.appId }}</span>
          <span class="monitor__list-status" :data-status="inst.status">{{ inst.status }}</span>
        </div>
      </div>
    </div>

    <div class="monitor__section">
      <h3 class="monitor__section-title">活动窗口</h3>
      <div class="monitor__list">
        <div v-if="windowStore.windows.length === 0" class="monitor__empty">暂无活动窗口</div>
        <div v-for="win in windowStore.windows" :key="win.id" class="monitor__list-item">
          <span class="monitor__list-icon">🪟</span>
          <span class="monitor__list-name">{{ win.title }}</span>
          <span class="monitor__list-status" :data-status="win.state">{{ win.state }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor {
  padding: 16px;
  overflow-y: auto;
  height: 100%;
  font-size: 13px;
}

.monitor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.monitor__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  margin: 0;
}

.monitor__uptime {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  font-family: monospace;
}

.monitor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 20px;
}

.monitor__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 10px;
}

.monitor__card-icon {
  font-size: 20px;
}

.monitor__card-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--ditto-color-primary-500, #3b82f6);
}

.monitor__card-label {
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
}

.monitor__section {
  margin-bottom: 16px;
}

.monitor__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  margin: 0 0 8px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.monitor__rows {
  display: flex;
  flex-direction: column;
}

.monitor__row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
}

.monitor__row-label {
  color: var(--ditto-color-text-secondary, #475569);
}

.monitor__row-value {
  color: var(--ditto-color-text-primary, #0f172a);
  font-weight: 500;
}

.monitor__badge {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.monitor__badge[data-state='ready'] {
  background: #dcfce7;
  color: #16a34a;
}

.monitor__list {
  display: flex;
  flex-direction: column;
}

.monitor__empty {
  padding: 16px;
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 12px;
}

.monitor__list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #f1f5f9);
}

.monitor__list-icon {
  font-size: 14px;
}

.monitor__list-name {
  flex: 1;
  color: var(--ditto-color-text-primary, #0f172a);
  font-family: monospace;
  font-size: 12px;
}

.monitor__list-status {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  background: var(--ditto-color-surface-base, #f1f5f9);
  color: var(--ditto-color-text-secondary, #475569);
}

.monitor__list-status[data-status='running'],
.monitor__list-status[data-status='normal'] {
  background: #dcfce7;
  color: #16a34a;
}

.monitor__list-status[data-status='paused'],
.monitor__list-status[data-status='minimized'] {
  background: #fef3c7;
  color: #d97706;
}

.monitor__list-status[data-status='error'] {
  background: #fee2e2;
  color: #dc2626;
}
</style>
