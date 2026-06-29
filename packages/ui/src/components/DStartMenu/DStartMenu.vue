<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '@ditto/services';
import { DIcon } from '../DIcon';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'launch', appId: string): void;
}>();

const appStore = useAppStore();
const searchQuery = ref('');

const filteredApps = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const apps = appStore.apps.filter((a) => {
    const t = (a as any).type ?? 'app';
    return t !== 'theme';
  });
  if (!q) return apps;
  return apps.filter((a) =>
    a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
  );
});

function onAppClick(appId: string) {
  emit('launch', appId);
  emit('close');
}

function onOverlayClick() {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="d-start-menu">
      <div v-if="visible" class="d-start-menu-overlay" @click="onOverlayClick" role="dialog" aria-label="开始菜单">
      <div class="d-start-menu" @click.stop>
        <div class="d-start-menu__search">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索应用..."
            class="d-start-menu__search-input"
            aria-label="搜索应用"
            autofocus
          />
        </div>
        <div class="d-start-menu__apps">
          <button
            v-for="app in filteredApps"
            :key="app.id"
            class="d-start-menu__app"
            :aria-label="`启动 ${app.name}`"
            @click="onAppClick(app.id)"
          >
            <DIcon :name="app.icon || 'fa-solid fa-box'" class="d-start-menu__app-icon" />
            <div class="d-start-menu__app-info">
              <span class="d-start-menu__app-name">{{ app.name }}</span>
              <span class="d-start-menu__app-desc">{{ app.description || app.category || '' }}</span>
            </div>
          </button>
          <div v-if="filteredApps.length === 0" class="d-start-menu__empty">
            未找到应用
          </div>
        </div>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-start-menu-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: var(--ditto-space-taskbar-height, 52px);
}

.d-start-menu {
  width: 420px;
  max-height: 70vh;
  background: var(--ditto-color-surface-overlay, #fff);
  border-radius: 12px 12px 0 0;
  box-shadow: var(--ditto-shadow-dropdown, 0 8px 24px rgba(0,0,0,0.12));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 入场/出场动画：遮罩淡入 + 面板上滑 */
.d-start-menu-enter-active {
  transition: opacity 200ms ease;
}
.d-start-menu-leave-active {
  transition: opacity 160ms ease;
}
.d-start-menu-enter-from,
.d-start-menu-leave-to {
  opacity: 0;
}
.d-start-menu-enter-active .d-start-menu,
.d-start-menu-leave-active .d-start-menu {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.d-start-menu-enter-from .d-start-menu,
.d-start-menu-leave-to .d-start-menu {
  transform: translateY(100%);
}

.d-start-menu__search {
  padding: 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.d-start-menu__search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  color: var(--ditto-color-text-primary, #0f172a);
  outline: none;
  transition: border-color 150ms;
}

.d-start-menu__search-input:focus {
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.d-start-menu__apps {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.d-start-menu__app {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 120ms;
}

.d-start-menu__app:hover {
  background: rgba(0, 0, 0, 0.04);
}

.d-start-menu__app:active {
  background: rgba(0, 0, 0, 0.08);
}

.d-start-menu__app-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.d-start-menu__app-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.d-start-menu__app-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-start-menu__app-desc {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.d-start-menu__empty {
  padding: 24px;
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 14px;
}

@media (max-width: 768px) {
  .d-start-menu-overlay {
    padding-bottom: 60px;
  }

  .d-start-menu {
    width: 100%;
    border-radius: 16px 16px 0 0;
    max-height: 80vh;
  }

  .d-start-menu__search {
    padding: 12px 16px;
  }

  .d-start-menu__search-input {
    padding: 14px 16px;
    font-size: 16px;
    border-radius: 10px;
  }

  .d-start-menu__app {
    padding: 14px 16px;
    gap: 14px;
  }

  .d-start-menu__app-icon {
    font-size: 32px;
  }

  .d-start-menu__app-name {
    font-size: 15px;
  }

  .d-start-menu__app-desc {
    font-size: 13px;
  }
}
</style>
