<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

interface ContextMenuItem {
  label: string;
  icon?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

const props = defineProps<{
  items: ContextMenuItem[];
  x: number;
  y: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

function onItemClick(item: ContextMenuItem) {
  if (item.disabled || item.divider) return;
  item.action?.();
  emit('close');
}

function onOverlayClick() {
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="d-context-menu-overlay" @click="onOverlayClick" @contextmenu.prevent="onOverlayClick">
      <div
        class="d-context-menu"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @click.stop
      >
        <template v-for="(item, idx) in items" :key="idx">
          <div v-if="item.divider" class="d-context-menu__divider" />
          <button
            v-else
            class="d-context-menu__item"
            :class="{ 'd-context-menu__item--disabled': item.disabled }"
            @click="onItemClick(item)"
            :disabled="item.disabled"
          >
            <span v-if="item.icon" class="d-context-menu__item-icon">{{ item.icon }}</span>
            <span class="d-context-menu__item-label">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.d-context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
}

.d-context-menu {
  position: absolute;
  min-width: 180px;
  padding: 4px;
  background: var(--ditto-color-surface-overlay, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  box-shadow: var(--ditto-shadow-dropdown, 0 8px 24px rgba(0,0,0,0.12));
  animation: d-menu-enter 120ms ease-out;
}

@keyframes d-menu-enter {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.d-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  text-align: left;
  transition: background 80ms;
}

.d-context-menu__item:hover:not(.d-context-menu__item--disabled) {
  background: rgba(0, 0, 0, 0.04);
}

.d-context-menu__item--disabled {
  opacity: 0.4;
  cursor: default;
}

.d-context-menu__item-icon {
  font-size: 14px;
  line-height: 1;
  width: 18px;
  text-align: center;
}

.d-context-menu__item-label {
  flex: 1;
}

.d-context-menu__divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--ditto-color-border-subtle, #e2e8f0);
}
</style>
