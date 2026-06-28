<script setup lang="ts">
import { computed, ref } from 'vue';
import { getThemeEngine } from '@ditto/theme';
import type { AnimationPreset } from '@ditto/theme';
import { useWindowStore } from '@ditto/services';
import type { LayoutMode } from '@ditto/shared';

const themeEngine = getThemeEngine();
const windowStore = useWindowStore();

const currentScheme = computed(() => themeEngine.getColorScheme());
const currentThemeId = computed(() => themeEngine.getCurrentTheme().id);
const availableThemes = computed(() => themeEngine.getAvailableThemes());
const animationPreset = ref<AnimationPreset>('normal');

const layoutMode = computed({
  get: () => windowStore.layoutMode,
  set: (v: LayoutMode) => windowStore.setLayoutMode(v),
});

const layoutOptions: { value: LayoutMode; label: string; icon: string }[] = [
  { value: 'floating', label: '浮动布局', icon: '🪟' },
  { value: 'tiling', label: '平铺布局', icon: '📐' },
  { value: 'snap', label: '磁吸布局', icon: '🧲' },
];

const animationOptions: { value: AnimationPreset; label: string; icon: string; desc: string }[] = [
  { value: 'none', label: '关闭', icon: '⏸️', desc: '无动画（老旧设备/树莓派）' },
  { value: 'subtle', label: '微妙', icon: '🍃', desc: '低端设备推荐' },
  { value: 'normal', label: '标准', icon: '✨', desc: '默认平衡' },
  { value: 'expressive', label: '丰富', icon: '🎆', desc: '高性能设备' },
];

const wallpaper = ref(localStorage.getItem('ditto:wallpaper') || '');
const wallpaperInput = ref<HTMLInputElement | null>(null);

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
          {{ currentScheme === 'dark' ? '☀️ 浅色' : '🌙 深色' }}
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
          <span class="settings-anim-btn__icon">{{ opt.icon }}</span>
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
          <span class="settings-layout-btn__icon">{{ opt.icon }}</span>
          <span class="settings-layout-btn__label">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title">桌面壁纸</h3>
      <div class="settings-row">
        <span class="settings-row__label">{{ wallpaper ? '已设置自定义壁纸' : '使用默认背景' }}</span>
        <div class="settings-row__actions">
          <button class="settings-row__action" @click="wallpaperInput?.click()">🖼️ 选择图片</button>
          <button v-if="wallpaper" class="settings-row__action" @click="clearWallpaper">清除</button>
        </div>
        <input ref="wallpaperInput" type="file" accept="image/*" @change="onWallpaperPick" hidden />
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
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  gap: 8px;
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
  gap: 6px;
}

.settings-row__action {
  padding: 6px 14px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  cursor: pointer;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  transition: background 120ms;
}

.settings-row__action:hover {
  background: var(--ditto-color-surface-base, #fff);
}

.settings-themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.settings-theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
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
  gap: 8px;
}

.settings-anim-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
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
}

.settings-layout-options {
  display: flex;
  gap: 8px;
}

.settings-layout-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
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
}

.settings-layout-btn__label {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
}
</style>
