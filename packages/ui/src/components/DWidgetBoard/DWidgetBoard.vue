<script setup lang="ts">
import { computed } from 'vue';
import { useWidgetStore } from '@ditto/services';
import { useDrag } from '../../composables/useDrag';
import type { WidgetSize } from '@ditto/shared';

const SIZE_MAP: Record<WidgetSize, { width: number; height: number }> = {
  small: { width: 160, height: 160 },
  medium: { width: 320, height: 160 },
  large: { width: 320, height: 320 },
};

const widgetStore = useWidgetStore();
const instances = computed(() => widgetStore.runningInstances);

function getWidgetStyle(inst: typeof instances.value[0]) {
  const dims = SIZE_MAP[inst.size];
  return {
    left: `${inst.position.x}px`,
    top: `${inst.position.y}px`,
    width: `${dims.width}px`,
    height: `${dims.height}px`,
  };
}

function onRemove(instanceId: string) {
  widgetStore.removeWidget(instanceId);
}
</script>

<template>
  <div class="d-widget-board">
    <div
      v-for="inst in instances"
      :key="inst.id"
      class="d-widget"
      :class="`d-widget--${inst.size}`"
      :style="getWidgetStyle(inst)"
    >
      <div class="d-widget__header">
        <span class="d-widget__icon">{{ inst.manifest.icon || '📋' }}</span>
        <span class="d-widget__name">{{ inst.manifest.name }}</span>
        <button class="d-widget__close" @click="onRemove(inst.id)">×</button>
      </div>
      <div class="d-widget__body">
        <slot :name="inst.widgetId" :instance="inst">
          <div class="d-widget__placeholder">
            <span>{{ inst.manifest.icon || '📋' }}</span>
            <span>{{ inst.manifest.name }}</span>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.d-widget-board {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.d-widget {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--ditto-color-surface-overlay, #ffffff);
  border-radius: var(--ditto-radius-card, 12px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
  transition: box-shadow 150ms ease;
}

.d-widget:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.d-widget__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  border-bottom: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.04));
  cursor: grab;
  user-select: none;
}

.d-widget__icon { font-size: 12px; }
.d-widget__name { flex: 1; font-size: 11px; font-weight: 500; color: var(--ditto-color-text-secondary, #64748b); }

.d-widget__close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--ditto-color-text-disabled, #94a3b8);
  padding: 0 2px; line-height: 1; transition: color 100ms;
}
.d-widget__close:hover { color: var(--ditto-color-text-primary, #0f172a); }

.d-widget__body {
  flex: 1;
  overflow: auto;
  position: relative;
}

.d-widget__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 6px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 12px;
}
</style>
