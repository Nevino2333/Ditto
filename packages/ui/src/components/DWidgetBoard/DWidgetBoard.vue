<script setup lang="ts">
import { computed } from 'vue';
import { useWidgetStore } from '@ditto/services';
import { DIcon } from '../DIcon';

const widgetStore = useWidgetStore();
const instances = computed(() => widgetStore.runningInstances);

function getWidgetStyle(inst: typeof instances.value[0]) {
  const manifest = inst.manifest;
  const w = manifest.minWidth || 320;
  const h = manifest.minHeight || 160;
  return {
    left: `${inst.position.x}px`,
    top: `${inst.position.y}px`,
    width: `${w}px`,
    height: `${h}px`,
  };
}

function onRemove(instanceId: string) {
  widgetStore.removeWidget(instanceId);
}
</script>

<template>
  <div class="d-widget-board">
    <TransitionGroup name="d-widget">
      <div
        v-for="inst in instances"
        :key="inst.id"
        class="d-widget"
        :style="getWidgetStyle(inst)"
      >
      <div class="d-widget__body">
        <slot :instance="inst" :widgetId="inst.widgetId">
          <div class="d-widget__placeholder">
            <DIcon :name="inst.manifest.icon || 'fa-solid fa-clipboard'" />
            <span>{{ inst.manifest.name }}</span>
          </div>
        </slot>
      </div>
      <button class="d-widget__close" title="移除小组件" aria-label="移除小组件" @click.stop="onRemove(inst.id)"><DIcon name="fa-solid fa-xmark" /></button>
    </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.d-widget-board {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.d-widget {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--ditto-color-surface-overlay, #1e293b);
  border-radius: var(--ditto-radius-card, 12px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid var(--ditto-color-border-subtle, rgba(255, 255, 255, 0.06));
  transition: box-shadow 150ms ease;
}

/* 入场/出场动画 */
.d-widget-enter-active {
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.d-widget-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
  position: absolute;
}
.d-widget-enter-from {
  opacity: 0;
  transform: scale(0.92);
}
.d-widget-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.d-widget:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

.d-widget:hover .d-widget__close {
  opacity: 1;
}

.d-widget__body {
  flex: 1;
  overflow: hidden;
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

.d-widget__close {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  padding: 0;
  line-height: 1;
  opacity: 0;
  transition: opacity 150ms, background 100ms, color 100ms;
  z-index: 10;
}

.d-widget__close:hover {
  background: var(--ditto-color-semantic-error, #ef4444);
  color: #fff;
}

@media (max-width: 768px) {
  .d-widget-board {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    overflow-y: auto;
  }

  .d-widget {
    position: relative;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    height: auto !important;
    min-height: 120px;
  }

  .d-widget__close {
    opacity: 1;
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
}
</style>
