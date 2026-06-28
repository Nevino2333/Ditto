<script setup lang="ts">
import { computed } from 'vue';
import { useWindowStore, useAppStore } from '@ditto/services';
import type { AppManifest } from '@ditto/shared';

const props = withDefaults(defineProps<{
  iconSize?: number;
  iconGap?: number;
  columns?: number;
  showLabels?: boolean;
}>(), {
  iconSize: 80,
  iconGap: 8,
  columns: 0,
  showLabels: true,
});

const emit = defineEmits<{
  (e: 'iconClick', app: AppManifest): void;
  (e: 'iconDblClick', app: AppManifest): void;
  (e: 'contextmenu', event: MouseEvent): void;
  (e: 'click'): void;
}>();

const windowStore = useWindowStore();
const appStore = useAppStore();

const desktopApps = computed(() =>
  appStore.apps.filter((app) => {
    const t = (app as any).type ?? 'app';
    return t !== 'theme';
  })
);

function onDesktopClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('d-desktop') || (e.target as HTMLElement).classList.contains('d-desktop__icons')) {
    windowStore.activeWindowId = null;
    emit('click');
  }
}

function onAppDblClick(app: AppManifest) {
  appStore.launchApp(app.id);
  emit('iconDblClick', app);
}

function onAppClick(app: AppManifest) {
  emit('iconClick', app);
}

function onContextMenu(e: MouseEvent) {
  emit('contextmenu', e);
}
</script>

<template>
  <div class="d-desktop" @click="onDesktopClick" @contextmenu="onContextMenu">
    <div
      class="d-desktop__icons"
      :style="{
        gap: `${iconGap}px`,
        gridTemplateColumns: columns > 0 ? `repeat(${columns}, ${iconSize}px)` : undefined,
      }"
      :class="{ 'd-desktop__icons--grid': columns > 0 }"
    >
      <div
        v-for="(app, i) in desktopApps"
        :key="app.id"
        class="d-desktop__icon"
        :style="{ width: `${iconSize}px`, height: `${iconSize}px`, animationDelay: `${i * 40}ms` }"
        :role="app.id ? 'button' : undefined"
        :tabindex="app.id ? 0 : undefined"
        :aria-label="`打开 ${app.name}`"
        @dblclick.stop="onAppDblClick(app)"
        @click.stop="onAppClick(app)"
      >
        <slot name="icon" :app="app">
          <span class="d-desktop__icon-img">{{ app.icon || '📦' }}</span>
          <span v-if="showLabels" class="d-desktop__icon-label">{{ app.name }}</span>
        </slot>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.d-desktop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  bottom: var(--ditto-space-taskbar-height, 52px);
  background: var(--ditto-color-surface-base, #f8fafc);
  overflow: hidden;
  user-select: none;
}

.d-desktop__icons {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  padding: 16px;
  height: 100%;
}

.d-desktop__icons--grid {
  display: grid;
  flex-wrap: nowrap;
  height: auto;
}

.d-desktop__icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--ditto-radius-card, 8px);
  cursor: pointer;
  transition: background var(--ditto-motion-duration-fast, 120ms), transform 120ms;
  gap: 4px;
  /* 入场动画：逐个淡入上浮 */
  animation: d-desktop-icon-in 200ms ease both;
}

@keyframes d-desktop-icon-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.d-desktop__icon:hover {
  background: rgba(0, 0, 0, 0.04);
}

.d-desktop__icon:active {
  background: rgba(0, 0, 0, 0.08);
}

.d-desktop__icon-img {
  font-size: 32px;
  line-height: 1;
}

.d-desktop__icon-label {
  font-size: 11px;
  color: var(--ditto-color-text-primary, #0f172a);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 8px);
}

@media (max-width: 768px) {
  .d-desktop {
    bottom: 60px;
  }

  .d-desktop__icons {
    gap: 4px;
    padding: 8px;
  }

  .d-desktop__icon {
    width: 60px !important;
    height: 60px !important;
  }

  .d-desktop__icon-img {
    font-size: 24px;
  }

  .d-desktop__icon-label {
    font-size: 9px;
  }
}
</style>
