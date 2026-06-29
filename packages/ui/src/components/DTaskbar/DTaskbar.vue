<script setup lang="ts">
import { computed } from 'vue';
import { useWindowStore, useAppStore } from '@ditto/services';
import type { AppManifest } from '@ditto/shared';
import { DIcon } from '../DIcon';

const windowStore = useWindowStore();
const appStore = useAppStore();

const taskbarApps = computed(() =>
  appStore.pinnedApps.filter((a) => ((a as any).type ?? 'app') !== 'theme')
);

const emit = defineEmits<{
  (e: 'appClick', app: AppManifest): void;
}>();

function onAppClick(app: AppManifest) {
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
</script>

<template>
  <nav class="d-taskbar" role="navigation" aria-label="任务栏">
    <div class="d-taskbar__start">
      <slot />
    </div>
    <div class="d-taskbar__divider" />
    <div class="d-taskbar__apps">
      <button
        v-for="app in taskbarApps"
        :key="app.id"
        class="d-taskbar__app-btn"
        :class="{
          'd-taskbar__app-btn--running': appStore.runningAppIds.includes(app.id),
          'd-taskbar__app-btn--active': windowStore.activeWindowId && windowStore.windows.find(w => w.appId === app.id)?.id === windowStore.activeWindowId
        }"
        @click="onAppClick(app)"
        :title="app.name"
        :aria-label="`${app.name}${appStore.runningAppIds.includes(app.id) ? '（运行中）' : ''}`"
      >
        <DIcon :name="app.icon || 'fa-solid fa-box'" class="d-taskbar__app-icon" />
      </button>
    </div>
    <div class="d-taskbar__tray">
      <slot name="tray" />
    </div>
  </nav>
</template>

<style scoped>
.d-taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--ditto-space-taskbar-height, 52px);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  background: var(--ditto-color-window-titlebar, rgba(241, 245, 249, 0.85));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  box-shadow: var(--ditto-shadow-taskbar, 0 -1px 12px rgba(0,0,0,0.04));
  z-index: 9999;
  user-select: none;
  /* 入场动画：从底部滑入 */
  animation: d-taskbar-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes d-taskbar-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.d-taskbar__start {
  display: flex;
  align-items: center;
}

.d-taskbar__divider {
  width: 1px;
  height: 24px;
  background: var(--ditto-color-border-subtle, #e2e8f0);
  margin: 0 4px;
}

.d-taskbar__apps {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.d-taskbar__tray {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-taskbar__app-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 120ms, transform 100ms;
  position: relative;
}

.d-taskbar__app-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.d-taskbar__app-btn:active {
  transform: scale(0.92);
}

.d-taskbar__app-btn--running::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 3px;
  border-radius: 2px;
  background: var(--ditto-color-primary-500, #3b82f6);
  opacity: 0.6;
}

.d-taskbar__app-btn--active::after {
  opacity: 1;
  width: 20px;
}

.d-taskbar__app-icon {
  font-size: 20px;
  line-height: 1;
}

@media (max-width: 768px) {
  .d-taskbar {
    height: 60px;
    padding: 0 4px;
    justify-content: center;
  }

  .d-taskbar__start {
    display: flex;
  }

  .d-taskbar__divider {
    display: none;
  }

  .d-taskbar__apps {
    justify-content: center;
  }

  .d-taskbar__app-btn {
    width: 48px;
    height: 48px;
  }

  .d-taskbar__app-icon {
    font-size: 24px;
  }

  .d-taskbar__tray {
    display: flex;
    gap: 4px;
    padding: 0 4px;
  }
}
</style>
