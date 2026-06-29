<script setup lang="ts">
import { computed, ref } from 'vue';
import { getThemeEngine } from '@ditto/theme';
import type { AnimationPreset } from '@ditto/theme';
import { useWindowStore, useAppStore, useDialogStore, useNotificationStore } from '@ditto/services';
import { DIcon } from '@ditto/ui';
import type { LayoutMode, AppManifest } from '@ditto/shared';

const themeEngine = getThemeEngine();
const windowStore = useWindowStore();
const appStore = useAppStore();
const dialogStore = useDialogStore();
const notificationStore = useNotificationStore();

const currentScheme = computed(() => themeEngine.getColorScheme());
const currentThemeId = computed(() => themeEngine.getCurrentTheme().id);
const availableThemes = computed(() => themeEngine.getAvailableThemes());
const animationPreset = ref<AnimationPreset>('normal');

const layoutMode = computed({
  get: () => windowStore.layoutMode,
  set: (v: LayoutMode) => windowStore.setLayoutMode(v),
});

const layoutOptions: { value: LayoutMode; label: string; icon: string }[] = [
  { value: 'floating', label: '浮动布局', icon: 'fa-solid fa-window-restore' },
  { value: 'tiling', label: '平铺布局', icon: 'fa-solid fa-table-cells' },
  { value: 'snap', label: '磁吸布局', icon: 'fa-solid fa-magnet' },
];

const animationOptions: { value: AnimationPreset; label: string; icon: string; desc: string }[] = [
  { value: 'none', label: '关闭', icon: 'fa-solid fa-pause', desc: '无动画（老旧设备/树莓派）' },
  { value: 'subtle', label: '微妙', icon: 'fa-solid fa-leaf', desc: '低端设备推荐' },
  { value: 'normal', label: '标准', icon: 'fa-solid fa-wand-magic-sparkles', desc: '默认平衡' },
  { value: 'expressive', label: '丰富', icon: 'fa-solid fa-fire', desc: '高性能设备' },
];

const wallpaper = ref(localStorage.getItem('ditto:wallpaper') || '');
const wallpaperInput = ref<HTMLInputElement | null>(null);

// ─── 应用管理 ───
// 内置应用：pinned=true，不可卸载
// 第三方应用：pinned=false，可卸载
interface AppListItem {
  manifest: AppManifest;
  isBuiltin: boolean;
  isRunning: boolean;
}

const appList = computed<AppListItem[]>(() => {
  return appStore.registeredApps.map((r) => ({
    manifest: r.manifest,
    isBuiltin: r.pinned,
    isRunning: appStore.runningAppIds.includes(r.manifest.id),
  }));
});

const builtinAppCount = computed(() => appList.value.filter((a) => a.isBuiltin).length);
const installedAppCount = computed(() => appList.value.filter((a) => !a.isBuiltin).length);

// 选中的应用详情（查看权限）
const selectedAppId = ref<string>('');
const selectedApp = computed(() => {
  if (!selectedAppId.value) return null;
  return appStore.registeredApps.find((r) => r.manifest.id === selectedAppId.value) ?? null;
});

function selectApp(appId: string) {
  selectedAppId.value = selectedAppId.value === appId ? '' : appId;
}

async function uninstallApp(app: AppManifest) {
  const result = await dialogStore.open('confirm', {
    title: '卸载应用',
    message: `确定要卸载 "${app.name}" 吗？卸载后该应用的所有数据将被清除，且无法恢复。`,
    okText: '卸载',
    cancelText: '取消',
  });
  if (!result.confirmed) return;

  try {
    const serverUrl = window.location.origin;
    const res = await fetch(`${serverUrl}/api/apps/uninstall/${encodeURIComponent(app.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `卸载失败 (${res.status})`);
    }
    // 关闭运行中的窗口（如有）
    const instances = appStore.getInstancesByAppId(app.id);
    for (const inst of instances) {
      await appStore.terminateApp(inst.id);
    }
    // 从应用列表移除
    appStore.unregisterApp(app.id);
    selectedAppId.value = '';
    notificationStore.pushNotification({
      type: 'success',
      title: '应用已卸载',
      body: `"${app.name}" 已成功卸载`,
      source: '应用管理',
      persistent: false,
    });
  } catch (err) {
    notificationStore.pushNotification({
      type: 'error',
      title: '卸载失败',
      body: err instanceof Error ? err.message : '未知错误',
      source: '应用管理',
      persistent: false,
    });
  }
}

function toggleTheme() {
  themeEngine.toggleColorScheme();
}

function selectTheme(themeId: string) {
  themeEngine.setTheme(themeId);
}

function selectAnimation(preset: AnimationPreset) {
  animationPreset.value = preset;
  themeEngine.setAnimationPreset(preset);
}

function onWallpaperPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    wallpaper.value = reader.result as string;
    localStorage.setItem('ditto:wallpaper', wallpaper.value);
    applyWallpaper();
  };
  reader.readAsDataURL(file);
}

function applyWallpaper() {
  const desktop = document.querySelector('.d-desktop') as HTMLElement | null;
  if (desktop) {
    desktop.style.backgroundImage = wallpaper.value ? `url(${wallpaper.value})` : '';
    desktop.style.backgroundSize = 'cover';
    desktop.style.backgroundPosition = 'center';
  }
}

function clearWallpaper() {
  wallpaper.value = '';
  localStorage.removeItem('ditto:wallpaper');
  applyWallpaper();
}

// 权限名称映射（常用 capability → 友好名称）
const PERMISSION_LABELS: Record<string, { label: string; icon: string }> = {
  'fs.read': { label: '读取文件', icon: 'fa-solid fa-folder-open' },
  'fs.write': { label: '写入文件', icon: 'fa-solid fa-floppy-disk' },
  'net.request': { label: '网络请求', icon: 'fa-solid fa-network-wired' },
  'clipboard.read': { label: '读取剪贴板', icon: 'fa-solid fa-paste' },
  'clipboard.write': { label: '写入剪贴板', icon: 'fa-solid fa-clipboard' },
  'notification': { label: '发送通知', icon: 'fa-solid fa-bell' },
  'geolocation': { label: '获取位置', icon: 'fa-solid fa-location-dot' },
  'camera': { label: '访问摄像头', icon: 'fa-solid fa-camera' },
  'microphone': { label: '访问麦克风', icon: 'fa-solid fa-microphone' },
  'storage': { label: '本地存储', icon: 'fa-solid fa-database' },
};

function getPermissionLabel(cap: string): { label: string; icon: string } {
  return PERMISSION_LABELS[cap] || { label: cap, icon: 'fa-solid fa-shield-halved' };
}

// 启动时应用已保存壁纸
applyWallpaper();
</script>

<template>
  <div class="settings-app">
    <div class="settings-section">
      <h3 class="settings-section__title">外观主题</h3>
      <div class="settings-themes">
        <button
          v-for="t in availableThemes"
          :key="t.id"
          class="settings-theme-card"
          :class="{ 'settings-theme-card--active': currentThemeId === t.id }"
          @click="selectTheme(t.id)"
        >
          <span class="settings-theme-card__swatch" :data-scheme="t.colorScheme">
            <span class="settings-theme-card__swatch-dot" :data-color="t.colorScheme"></span>
          </span>
          <span class="settings-theme-card__name">{{ t.name }}</span>
          <span class="settings-theme-card__scheme">{{ t.colorScheme === 'dark' ? '深色' : '浅色' }}</span>
        </button>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">快速切换</span>
        <button class="settings-row__action" @click="toggleTheme">
          <DIcon :name="currentScheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" />
          {{ currentScheme === 'dark' ? '浅色' : '深色' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title">动画性能档位</h3>
      <div class="settings-anim-grid">
        <button
          v-for="opt in animationOptions"
          :key="opt.value"
          class="settings-anim-btn"
          :class="{ 'settings-anim-btn--active': animationPreset === opt.value }"
          @click="selectAnimation(opt.value)"
        >
          <DIcon :name="opt.icon" class="settings-anim-btn__icon" />
          <span class="settings-anim-btn__label">{{ opt.label }}</span>
          <span class="settings-anim-btn__desc">{{ opt.desc }}</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title">窗口布局</h3>
      <div class="settings-layout-options">
        <button
          v-for="opt in layoutOptions"
          :key="opt.value"
          class="settings-layout-btn"
          :class="{ 'settings-layout-btn--active': layoutMode === opt.value }"
          @click="layoutMode = opt.value"
        >
          <DIcon :name="opt.icon" class="settings-layout-btn__icon" />
          <span class="settings-layout-btn__label">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title">桌面壁纸</h3>
      <div class="settings-row">
        <span class="settings-row__label">{{ wallpaper ? '已设置自定义壁纸' : '使用默认背景' }}</span>
        <div class="settings-row__actions">
          <button class="settings-row__action" @click="wallpaperInput?.click()">
            <DIcon name="fa-solid fa-image" /> 选择图片
          </button>
          <button v-if="wallpaper" class="settings-row__action" @click="clearWallpaper">清除</button>
        </div>
        <input ref="wallpaperInput" type="file" accept="image/*" @change="onWallpaperPick" hidden />
      </div>
    </div>

    <!-- 应用管理 -->
    <div class="settings-section">
      <h3 class="settings-section__title">
        应用管理
        <span class="settings-section__count">
          {{ builtinAppCount }} 内置 · {{ installedAppCount }} 已安装
        </span>
      </h3>

      <div class="apps-list">
        <div
          v-for="app in appList"
          :key="app.manifest.id"
          class="app-item"
          :class="{ 'app-item--expanded': selectedAppId === app.manifest.id }"
        >
          <button class="app-item__header" @click="selectApp(app.manifest.id)">
            <DIcon :name="app.manifest.icon || 'fa-solid fa-box'" class="app-item__icon" />
            <div class="app-item__info">
              <span class="app-item__name">
                {{ app.manifest.name }}
                <span v-if="app.isBuiltin" class="app-item__badge app-item__badge--builtin">内置</span>
                <span v-else class="app-item__badge app-item__badge--installed">已安装</span>
                <span v-if="app.isRunning" class="app-item__badge app-item__badge--running">运行中</span>
              </span>
              <span class="app-item__meta">
                <span>{{ app.manifest.id }}</span>
                <span>·</span>
                <span>v{{ app.manifest.version }}</span>
                <span v-if="app.manifest.category">·</span>
                <span v-if="app.manifest.category">{{ app.manifest.category }}</span>
              </span>
            </div>
            <DIcon
              :name="selectedAppId === app.manifest.id ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"
              class="app-item__chevron"
            />
          </button>

          <!-- 展开详情：权限清单 + 卸载按钮 -->
          <div v-if="selectedAppId === app.manifest.id && selectedApp" class="app-item__details">
            <div class="app-details__row">
              <span class="app-details__label">描述</span>
              <span class="app-details__value">{{ app.manifest.description || '（无描述）' }}</span>
            </div>
            <div class="app-details__row">
              <span class="app-details__label">沙盒</span>
              <span class="app-details__value">
                <DIcon :name="app.manifest.sandbox === 'trusted' ? 'fa-solid fa-shield-halved' : 'fa-solid fa-lock'" />
                {{ app.manifest.sandbox === 'trusted' ? 'trusted（受信）' : 'strict（严格隔离）' }}
              </span>
            </div>
            <div class="app-details__row">
              <span class="app-details__label">权限</span>
              <div class="app-details__perms">
                <span v-if="app.manifest.permissions.length === 0" class="app-details__perm-empty">无权限申请</span>
                <span
                  v-for="perm in app.manifest.permissions"
                  :key="perm"
                  class="app-details__perm"
                >
                  <DIcon :name="getPermissionLabel(perm).icon" />
                  {{ getPermissionLabel(perm).label }}
                </span>
              </div>
            </div>
            <div v-if="app.manifest.backend" class="app-details__row">
              <span class="app-details__label">后端</span>
              <span class="app-details__value">
                <DIcon name="fa-solid fa-server" />
                {{ app.manifest.backend.entry }}
              </span>
            </div>
            <div class="app-details__actions">
              <button
                v-if="!app.isBuiltin"
                class="app-details__btn app-details__btn--danger"
                @click="uninstallApp(app.manifest)"
              >
                <DIcon name="fa-solid fa-trash" />
                卸载应用
              </button>
              <span v-else class="app-details__hint">内置应用不可卸载</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title">关于</h3>
      <div class="settings-row">
        <span class="settings-row__label">Ditto WebOS</span>
        <span class="settings-row__value">v0.1.0</span>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">框架</span>
        <span class="settings-row__value">Vue 3 + Vite + TypeScript</span>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">内核</span>
        <span class="settings-row__value">Cell 架构 v2</span>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">图标</span>
        <span class="settings-row__value">Font Awesome 6</span>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">许可证</span>
        <span class="settings-row__value">MIT</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-app {
  padding: 16px;
  overflow-y: auto;
  height: 100%;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-section__count {
  font-size: 11px;
  font-weight: 400;
  color: var(--ditto-color-text-secondary, #475569);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.settings-row__label {
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
}

.settings-row__value {
  font-size: 13px;
  color: var(--ditto-color-text-secondary, #475569);
}

.settings-row__actions {
  display: flex;
}

.settings-row__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  cursor: pointer;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  transition: background 120ms;
}

.settings-row__action + .settings-row__action {
  margin-left: 6px;
}

.settings-row__action:hover {
  background: var(--ditto-color-surface-base, #fff);
}

.settings-themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  margin-bottom: 12px;
}

.settings-themes > * {
  margin-right: 8px;
  margin-bottom: 8px;
}

.settings-theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 2px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 10px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  cursor: pointer;
  transition: border-color 150ms, transform 100ms;
}

.settings-theme-card:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
  transform: translateY(-1px);
}

.settings-theme-card--active {
  border-color: var(--ditto-color-primary-500, #3b82f6);
  background: var(--ditto-color-primary-50, #eff6ff);
}

.settings-theme-card__swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #1e293b 100%);
  margin-bottom: 4px;
}

.settings-theme-card__swatch[data-scheme='dark'] {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
}

.settings-theme-card__swatch-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--ditto-color-primary-500, #3b82f6);
}

.settings-theme-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
}

.settings-theme-card__scheme {
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
}

.settings-anim-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

.settings-anim-grid > * {
  margin-right: 8px;
  margin-bottom: 8px;
}

.settings-anim-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 2px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  cursor: pointer;
  transition: border-color 150ms;
}

.settings-anim-btn:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
}

.settings-anim-btn--active {
  border-color: var(--ditto-color-primary-500, #3b82f6);
  background: var(--ditto-color-primary-50, #eff6ff);
}

.settings-anim-btn__icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.settings-anim-btn__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
}

.settings-anim-btn__desc {
  font-size: 10px;
  color: var(--ditto-color-text-secondary, #475569);
  text-align: center;
  margin-top: 2px;
}

.settings-layout-options {
  display: flex;
}

.settings-layout-options > * {
  margin-right: 8px;
}

.settings-layout-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 2px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  cursor: pointer;
  transition: border-color 150ms, background 150ms;
}

.settings-layout-btn:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
}

.settings-layout-btn--active {
  border-color: var(--ditto-color-primary-500, #3b82f6);
  background: var(--ditto-color-primary-50, #eff6ff);
}

.settings-layout-btn__icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.settings-layout-btn__label {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
}

/* ─── 应用管理 ─── */
.apps-list {
  display: flex;
  flex-direction: column;
}

.app-item {
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  margin-bottom: 8px;
  overflow: hidden;
  transition: border-color 150ms;
}

.app-item--expanded {
  border-color: var(--ditto-color-primary-300, #93c5fd);
}

.app-item__header {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 100ms;
}

.app-item__header:hover {
  background: rgba(0, 0, 0, 0.02);
}

.app-item__icon {
  font-size: 22px;
  color: var(--ditto-color-primary-500, #3b82f6);
  margin-right: 12px;
  flex-shrink: 0;
}

.app-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.app-item__badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  font-weight: 500;
}

.app-item__badge--builtin {
  background: rgba(59, 130, 246, 0.1);
  color: var(--ditto-color-primary-600, #2563eb);
}

.app-item__badge--installed {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.app-item__badge--running {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.app-item__meta {
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
  margin-top: 2px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.app-item__meta > * {
  margin-right: 4px;
}

.app-item__chevron {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  margin-left: 8px;
  flex-shrink: 0;
}

.app-item__details {
  padding: 8px 12px 12px 46px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  background: rgba(0, 0, 0, 0.015);
}

.app-details__row {
  display: flex;
  padding: 6px 0;
  font-size: 12px;
}

.app-details__label {
  width: 60px;
  color: var(--ditto-color-text-secondary, #475569);
  flex-shrink: 0;
}

.app-details__value {
  color: var(--ditto-color-text-primary, #0f172a);
  display: inline-flex;
  align-items: center;
}

.app-details__value > * {
  margin-right: 6px;
}

.app-details__perms {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
}

.app-details__perms > * {
  margin-right: 6px;
  margin-bottom: 4px;
}

.app-details__perm {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  border-radius: 4px;
  font-size: 11px;
}

.app-details__perm > * {
  margin-right: 4px;
}

.app-details__perm-empty {
  color: var(--ditto-color-text-secondary, #475569);
  font-style: italic;
}

.app-details__actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
}

.app-details__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #dc2626;
  border-radius: 6px;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-size: 13px;
  transition: background 120ms, color 120ms;
}

.app-details__btn:hover {
  background: #dc2626;
  color: #fff;
}

.app-details__btn--danger:hover {
  background: #dc2626;
  color: #fff;
}

.app-details__hint {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  font-style: italic;
}

/* 移动端适配 */
@media (max-width: 600px) {
  .settings-anim-grid {
    grid-template-columns: 1fr;
  }

  .settings-layout-options {
    flex-direction: column;
  }

  .app-item__header {
    padding: 12px 10px;
  }

  .app-item__details {
    padding-left: 12px;
  }

  .app-details__row {
    flex-direction: column;
  }

  .app-details__label {
    width: auto;
    margin-bottom: 2px;
  }
}
</style>
