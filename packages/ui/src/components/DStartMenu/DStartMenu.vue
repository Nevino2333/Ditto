<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '@ditto/services';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'launch', appId: string): void;
}>();

const appStore = useAppStore();
const searchQuery = ref('');

const filteredApps = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return appStore.apps;
  return appStore.apps.filter((a) =>
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
    <div v-if="visible" class="d-start-menu-overlay" @click="onOverlayClick">
      <div class="d-start-menu" @click.stop>
        <div class="d-start-menu__search">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索应用..."
            class="d-start-menu__search-input"
            autofocus
          />
        </div>
        <div class="d-start-menu__apps">
          <button
            v-for="app in filteredApps"
            :key="app.id"
            class="d-start-menu__app"
            @click="onAppClick(app.id)"
          >
            <span class="d-start-menu__app-icon">{{ app.icon || '📦' }}</span>
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
  </Teleport>
</template>

<style scoped>
.d-start-menu-overlay {
  position: fixed;
  inset: 0;
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
</style>
