<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useWindowStore, useAppStore } from '@ditto/services';
import type { WindowState } from '@ditto/shared';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', windowId: string): void;
}>();

const windowStore = useWindowStore();
const appStore = useAppStore();

// 容器引用：打开时聚焦以接收键盘事件
const containerRef = ref<HTMLElement | null>(null);
// 当前高亮的窗口索引（键盘导航焦点）
const highlightIndex = ref(0);

interface TaskItem {
  window: WindowState;
  appName: string;
}

// 按 zIndex 降序排列：最近使用的窗口在前
const taskItems = computed<TaskItem[]>(() => {
  const sorted = [...windowStore.windows].sort((a, b) => b.zIndex - a.zIndex);
  return sorted.map((w) => {
    const manifest = appStore.apps.find((a) => a.id === w.appId);
    const fallbackName = w.appId.split('.').pop() || w.appId;
    return {
      window: w,
      appName: manifest ? manifest.name : fallbackName,
    };
  });
});

// 当前活动窗口在列表中的索引
const activeIndexInList = computed(() => {
  const id = windowStore.activeWindowId;
  if (!id) return 0;
  const idx = taskItems.value.findIndex((t) => t.window.id === id);
  return idx === -1 ? 0 : idx;
});

// 面板打开时：高亮定位到当前活动窗口并聚焦容器
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      highlightIndex.value = activeIndexInList.value;
      nextTick(() => {
        if (containerRef.value) containerRef.value.focus();
      });
    }
  }
);

// 列表变化时夹紧高亮索引，避免越界
watch(taskItems, (items) => {
  if (highlightIndex.value >= items.length) {
    highlightIndex.value = Math.max(0, items.length - 1);
  }
});

// 切换高亮：direction 1=下一个，-1=上一个
function moveHighlight(direction: 1 | -1) {
  const len = taskItems.value.length;
  if (len === 0) return;
  highlightIndex.value = (highlightIndex.value + direction + len) % len;
}

// 确认选择当前高亮窗口
function selectCurrent() {
  const item = taskItems.value[highlightIndex.value];
  if (item) {
    emit('select', item.window.id);
  }
  emit('close');
}

function onThumbnailClick(windowId: string) {
  emit('select', windowId);
  emit('close');
}

function onOverlayClick() {
  emit('close');
}

// 键盘导航：Tab/方向键切换、Enter 选择、Esc 关闭
// 注：持续按住 Alt 时，父级每触发一次 Tab 由这里循环高亮下一个窗口
function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      emit('close');
      break;
    case 'Enter':
      event.preventDefault();
      selectCurrent();
      break;
    case 'Tab':
      event.preventDefault();
      moveHighlight(event.shiftKey ? -1 : 1);
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault();
      moveHighlight(1);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault();
      moveHighlight(-1);
      break;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="d-task-switcher">
      <div
        v-if="visible"
        ref="containerRef"
        class="d-task-switcher-overlay"
        tabindex="0"
        role="dialog"
        aria-modal="true"
        aria-label="任务切换器"
        @click="onOverlayClick"
        @keydown="onKeydown"
      >
        <div class="d-task-switcher__panel" @click.stop>
          <div class="d-task-switcher__header">
            <span class="d-task-switcher__title">切换窗口</span>
            <span class="d-task-switcher__hint">Tab 切换 · Enter 选择 · Esc 关闭</span>
          </div>

          <div v-if="taskItems.length === 0" class="d-task-switcher__empty">
            没有打开的窗口
          </div>

          <ul v-else class="d-task-switcher__grid" role="listbox" aria-label="打开的窗口">
            <li
              v-for="(item, index) in taskItems"
              :key="item.window.id"
              class="d-task-switcher__item"
              :class="{
                'is-active': index === highlightIndex,
                'is-current': item.window.id === windowStore.activeWindowId,
              }"
              role="option"
              :aria-selected="index === highlightIndex ? 'true' : 'false'"
              :aria-label="item.window.title"
              @click="onThumbnailClick(item.window.id)"
            >
              <div class="d-task-switcher__thumb">
                <span class="d-task-switcher__icon">{{ item.window.icon || '🪟' }}</span>
              </div>
              <div class="d-task-switcher__meta">
                <span class="d-task-switcher__name">{{ item.window.title }}</span>
                <span class="d-task-switcher__app">{{ item.appName }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-task-switcher-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9800;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}

.d-task-switcher__panel {
  width: min(880px, 92vw);
  max-height: 80vh;
  background: var(--ditto-color-surface-overlay, #ffffff);
  border-radius: var(--ditto-radius-window, 10px);
  box-shadow: var(--ditto-shadow-windowFocused, 0 8px 32px rgba(59, 130, 246, 0.12));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.d-task-switcher__header {
  display: flex;
  align-items: baseline;
  margin-bottom: 12px;
}

.d-task-switcher__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  margin-right: 12px;
}

.d-task-switcher__hint {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-task-switcher__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  overflow-y: auto;
}

.d-task-switcher__item {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: var(--ditto-radius-card, 8px);
  background: var(--ditto-color-surface-raised, #f8fafc);
  padding: 8px;
  transition:
    border-color var(--ditto-motion-duration-fast, 150ms) var(--ditto-motion-easing-default, cubic-bezier(0.4, 0, 0.2, 1)),
    background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-task-switcher__item:hover {
  background: var(--ditto-color-primary-50, #eff6ff);
}

.d-task-switcher__item.is-active {
  border-color: var(--ditto-color-primary-500, #3b82f6);
  background: var(--ditto-color-primary-50, #eff6ff);
}

/* 当前活动窗口标识点 */
.d-task-switcher__item.is-current .d-task-switcher__thumb::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: var(--ditto-radius-pill, 9999px);
  background: var(--ditto-color-semantic-success, #22c55e);
}

.d-task-switcher__thumb {
  position: relative;
  height: 96px;
  border-radius: var(--ditto-radius-card, 8px);
  background: linear-gradient(
    135deg,
    var(--ditto-color-primary-400, #60a5fa),
    var(--ditto-color-primary-700, #1d4ed8)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.d-task-switcher__icon {
  font-size: 36px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.d-task-switcher__meta {
  display: flex;
  flex-direction: column;
}

.d-task-switcher__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.d-task-switcher__app {
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.d-task-switcher__empty {
  padding: 48px 16px;
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 14px;
}

/* 入场/出场动画：遮罩淡入 + 面板缩放 */
.d-task-switcher-enter-active,
.d-task-switcher-leave-active {
  transition: opacity var(--ditto-motion-duration-fast, 150ms) var(--ditto-motion-easing-default, cubic-bezier(0.4, 0, 0.2, 1));
}

.d-task-switcher-enter-from,
.d-task-switcher-leave-to {
  opacity: 0;
}

.d-task-switcher-enter-active .d-task-switcher__panel,
.d-task-switcher-leave-active .d-task-switcher__panel {
  transition:
    transform var(--ditto-motion-duration-normal, 250ms) var(--ditto-motion-easing-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275)),
    opacity var(--ditto-motion-duration-normal, 250ms) ease;
}

.d-task-switcher-enter-from .d-task-switcher__panel,
.d-task-switcher-leave-to .d-task-switcher__panel {
  transform: scale(0.96);
  opacity: 0;
}

/* 平板：3 列 */
@media (min-width: 769px) and (max-width: 1024px) {
  .d-task-switcher__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* 移动端：2 列，触控友好 */
@media (max-width: 768px) {
  .d-task-switcher__panel {
    width: 94vw;
    padding: 12px;
  }

  .d-task-switcher__grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .d-task-switcher__thumb {
    height: 80px;
  }

  .d-task-switcher__item {
    padding: 6px;
  }

  .d-task-switcher__icon {
    font-size: 32px;
  }

  .d-task-switcher__hint {
    display: none;
  }
}
</style>
