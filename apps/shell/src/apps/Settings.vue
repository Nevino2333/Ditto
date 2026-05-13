<script setup lang="ts">
import { computed } from 'vue';
import { getThemeEngine } from '@ditto/theme';
import { useWindowStore } from '@ditto/services';
import type { LayoutMode } from '@ditto/shared';

const themeEngine = getThemeEngine();
const windowStore = useWindowStore();

const currentScheme = computed(() => themeEngine.getColorScheme());
const layoutMode = computed({
  get: () => windowStore.layoutMode,
  set: (v: LayoutMode) => windowStore.setLayoutMode(v),
});

const layoutOptions: { value: LayoutMode; label: string; icon: string }[] = [
  { value: 'floating', label: '浮动布局', icon: '🪟' },
  { value: 'tiling', label: '平铺布局', icon: '📐' },
  { value: 'snap', label: '磁吸布局', icon: '🧲' },
];

function toggleTheme() {
  themeEngine.toggleColorScheme();
}
</script>

<template>
  <div class="settings-app">
    <div class="settings-section">
      <h3 class="settings-section__title">外观</h3>
      <div class="settings-row">
        <span class="settings-row__label">主题模式</span>
        <button class="settings-row__action" @click="toggleTheme">
          {{ currentScheme === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式' }}
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
      <h3 class="settings-section__title">关于</h3>
      <div class="settings-row">
        <span class="settings-row__label">Ditto WebOS</span>
        <span class="settings-row__value">v0.1.0</span>
      </div>
      <div class="settings-row">
        <span class="settings-row__label">框架</span>
        <span class="settings-row__value">Vue 3 + Vite</span>
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
}

.settings-row__label {
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
}

.settings-row__value {
  font-size: 13px;
  color: var(--ditto-color-text-secondary, #475569);
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
