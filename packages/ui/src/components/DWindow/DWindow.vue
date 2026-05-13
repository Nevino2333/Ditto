<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { useWindowStore, type SnapZone } from '@ditto/services';
import { useDrag } from '../../composables/useDrag';
import { useResize } from '../../composables/useResize';

const props = withDefaults(defineProps<{
  windowId: string;
  showTitlebar?: boolean;
  showControls?: boolean;
  showResizeHandle?: boolean;
  animation?: 'none' | 'scale' | 'slide-up' | 'fade';
}>(), {
  showTitlebar: true,
  showControls: true,
  showResizeHandle: true,
  animation: 'scale',
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'focus'): void;
  (e: 'minimize'): void;
  (e: 'maximize'): void;
  (e: 'dragStart'): void;
  (e: 'dragEnd'): void;
  (e: 'resizeStart'): void;
  (e: 'resizeEnd'): void;
}>();

const windowStore = useWindowStore();

const win = computed(() => windowStore.windows.find((w) => w.id === props.windowId));
const isActive = computed(() => windowStore.activeWindowId === props.windowId);

const isMinimizing = ref(false);
const isRestoring = ref(false);
const restoreStart = ref(false);

const windowStyle = computed(() => {
  if (!win.value) return {};
  const w = win.value;
  if (isMinimizing.value) {
    return {
      left: `${w.position.x}px`, top: `${w.position.y}px`,
      width: `${w.size.width}px`, height: `${w.size.height}px`,
      zIndex: w.zIndex,
    };
  }
  switch (w.state) {
    case 'maximized':
      return {
        left: '0px', top: '0px',
        width: '100vw', height: 'calc(100vh - 48px)',
        zIndex: w.zIndex, borderRadius: '0',
      };
    case 'fullscreen':
      return {
        left: '0px', top: '0px',
        width: '100vw', height: '100vh',
        zIndex: w.zIndex, borderRadius: '0',
      };
    default:
      return {
        left: `${w.position.x}px`, top: `${w.position.y}px`,
        width: `${w.size.width}px`, height: `${w.size.height}px`,
        zIndex: w.zIndex,
      };
  }
});

const isNormal = computed(() => win.value?.state === 'normal');

const activeSnapZone = ref<SnapZone | null>(null);

const snapPreviewStyle = computed(() => {
  if (!activeSnapZone.value) return null;
  const b = activeSnapZone.value.bounds;
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.width}px`,
    height: `${b.height}px`,
  };
});

const { isDragging, currentSnapZone, onPointerDown: onDragStart } = useDrag({
  getPosition: () => ({ x: win.value?.position.x ?? 0, y: win.value?.position.y ?? 0 }),
  onMove: (pos) => windowStore.moveWindow(props.windowId, pos),
  onDragEnd: (_pos, snapZone) => {
    if (snapZone) {
      windowStore.snapWindow(props.windowId, snapZone);
    }
    activeSnapZone.value = null;
    emit('dragEnd');
  },
  onSnapZone: (zone) => {
    activeSnapZone.value = zone;
  },
  isDisabled: () => !isNormal.value,
});

const { isResizing, startResize: onResizeStart } = useResize({
  onResize: ({ dx, dy, direction }) => {
    if (!win.value) return;
    let x = win.value.position.x;
    let y = win.value.position.y;
    let w = win.value.size.width;
    let h = win.value.size.height;
    const minW = win.value.minSize.width ?? 200;
    const minH = win.value.minSize.height ?? 150;

    if (direction.includes('n')) {
      const newH = h - dy;
      if (newH >= minH) { y += dy; h = newH; }
    }
    if (direction.includes('s')) {
      const newH = h + dy;
      if (newH >= minH) { h = newH; }
    }
    if (direction.includes('e')) {
      const newW = w + dx;
      if (newW >= minW) { w = newW; }
    }
    if (direction.includes('w')) {
      const newW = w - dx;
      if (newW >= minW) { x += dx; w = newW; }
    }

    windowStore.moveWindow(props.windowId, { x, y });
    windowStore.resizeWindow(props.windowId, { width: w, height: h });
  },
  isDisabled: () => !isNormal.value || !win.value?.resizable,
});

function onFocus() {
  windowStore.focusWindow(props.windowId);
  emit('focus');
}

function onClose() { emit('close'); }

watch(() => win.value?.state, (newState, oldState) => {
  if (newState === 'minimized' && oldState !== 'minimized') {
    isMinimizing.value = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isMinimizing.value = false;
      });
    });
  }
  if (newState !== 'minimized' && oldState === 'minimized') {
    restoreStart.value = true;
    isRestoring.value = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreStart.value = false;
      });
    });
    setTimeout(() => {
      isRestoring.value = false;
    }, 300);
  }
});

function onMinimize() {
  emit('minimize');
  windowStore.minimizeWindow(props.windowId);
}

function onMaximize() { windowStore.maximizeWindow(props.windowId); emit('maximize'); }

function onTitlebarDblClick() {
  if (win.value?.maximizable) onMaximize();
}

const enterClass = ref('');
onMounted(() => {
  if (props.animation === 'none') return;
  enterClass.value = `d-window--anim-${props.animation}`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      enterClass.value = '';
    });
  });
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="snapPreviewStyle"
      class="d-window__snap-preview"
      :style="snapPreviewStyle"
    />
  </Teleport>
  <div
    v-if="win && !(win.state === 'minimized' && !isMinimizing)"
    class="d-window"
    :class="{
      'd-window--active': isActive,
      'd-window--minimized': win.state === 'minimized',
      'd-window--maximized': win.state === 'maximized',
      'd-window--fullscreen': win.state === 'fullscreen',
      'd-window--dragging': isDragging,
      'd-window--resizing': isResizing,
      'd-window--minimizing': isMinimizing,
      'd-window--restore-start': restoreStart,
      'd-window--restoring': isRestoring && !restoreStart,
      [enterClass]: !!enterClass,
    }"
    :style="windowStyle"
    @pointerdown="onFocus"
  >
    <div
      v-if="showTitlebar"
      class="d-window__titlebar"
      @pointerdown="onDragStart"
      @dblclick="onTitlebarDblClick"
    >
      <slot name="titlebar-prefix" />
      <span class="d-window__icon">{{ win.icon }}</span>
      <span class="d-window__title">{{ win.title }}</span>
      <slot name="titlebar-suffix" />
      <div v-if="showControls" class="d-window__controls">
        <slot name="controls" :minimize="onMinimize" :maximize="onMaximize" :close="onClose">
          <button class="d-window__btn d-window__btn--minimize" title="最小化" @click.stop="onMinimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
          <button v-if="win.maximizable" class="d-window__btn d-window__btn--maximize" :title="win.state === 'maximized' ? '还原' : '最大化'" @click.stop="onMaximize">
            <svg v-if="win.state === 'maximized'" width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="0" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/>
              <rect x="0" y="2" width="7" height="7" fill="var(--ditto-color-surface-overlay, #fff)" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <svg v-else width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
          <button class="d-window__btn d-window__btn--close" title="关闭" @click.stop="onClose">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/>
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
        </slot>
      </div>
    </div>

    <div class="d-window__body">
      <slot />
    </div>

    <template v-if="win.resizable && isNormal && showResizeHandle">
      <div class="d-window__rh d-window__rh-n" @pointerdown="onResizeStart($event, 'n')" />
      <div class="d-window__rh d-window__rh-ne" @pointerdown="onResizeStart($event, 'ne')" />
      <div class="d-window__rh d-window__rh-e" @pointerdown="onResizeStart($event, 'e')" />
      <div class="d-window__rh d-window__rh-se" @pointerdown="onResizeStart($event, 'se')" />
      <div class="d-window__rh d-window__rh-s" @pointerdown="onResizeStart($event, 's')" />
      <div class="d-window__rh d-window__rh-sw" @pointerdown="onResizeStart($event, 'sw')" />
      <div class="d-window__rh d-window__rh-w" @pointerdown="onResizeStart($event, 'w')" />
      <div class="d-window__rh d-window__rh-nw" @pointerdown="onResizeStart($event, 'nw')" />
    </template>
  </div>
</template>

<style scoped>
.d-window {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--ditto-color-surface-overlay, #ffffff);
  border-radius: var(--ditto-radius-window, 10px);
  box-shadow: var(--ditto-shadow-window, 0 4px 16px rgba(0, 0, 0, 0.08));
  overflow: hidden;
  contain: layout style;
  transition: box-shadow var(--ditto-motion-duration-fast, 150ms) ease,
              border-radius var(--ditto-motion-duration-fast, 150ms) ease;
  border: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
}

.d-window--active {
  box-shadow: var(--ditto-shadow-windowFocused, 0 8px 32px rgba(0, 0, 0, 0.12));
  border-color: var(--ditto-color-primary-200, #bfdbfe);
}

.d-window--minimized { display: none; }
.d-window--maximized, .d-window--fullscreen { border-radius: 0; border: none; }
.d-window--dragging, .d-window--resizing { transition: none; user-select: none; }

.d-window--minimizing {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms;
  transform: scale(0.1) translateY(100vh);
  opacity: 0;
  pointer-events: none;
}

.d-window--restore-start {
  transform: scale(0.1) translateY(100vh);
  opacity: 0;
  transition: none;
}

.d-window--restoring {
  transition: transform 300ms cubic-bezier(0, 0, 0.2, 1), opacity 300ms;
  transform: scale(1) translateY(0);
  opacity: 1;
}

.d-window--anim-scale { animation: d-window-enter 200ms cubic-bezier(0.175, 0.885, 0.32, 1.1); }
.d-window--anim-slide-up { animation: d-window-slide-up 200ms cubic-bezier(0, 0, 0.2, 1); }
.d-window--anim-fade { animation: d-window-fade 150ms ease-out; }

@keyframes d-window-enter { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
@keyframes d-window-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes d-window-fade { from { opacity: 0; } to { opacity: 1; } }

.d-window__titlebar {
  display: flex; align-items: center; height: 36px; padding: 0 10px; gap: 8px;
  background: var(--ditto-color-window-titlebar, #f8fafc);
  border-bottom: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
  cursor: default; flex-shrink: 0; user-select: none; -webkit-user-select: none;
}
.d-window__icon { font-size: 14px; line-height: 1; flex-shrink: 0; }
.d-window__title { flex: 1; font-size: 12px; font-weight: 500; color: var(--ditto-color-text-primary, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.d-window__controls { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.d-window__btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 5px;
  background: transparent; cursor: pointer; color: var(--ditto-color-text-secondary, #64748b);
  transition: background 100ms, color 100ms;
}
.d-window__btn:hover { background: rgba(0, 0, 0, 0.06); color: var(--ditto-color-text-primary, #0f172a); }
.d-window__btn--close:hover { background: var(--ditto-color-semantic-error, #ef4444); color: #fff; }
.d-window__body { flex: 1; overflow: auto; position: relative; }
.d-window__rh { position: absolute; z-index: 1; }
.d-window__rh-n { top: -3px; left: 12px; right: 12px; height: 6px; cursor: n-resize; }
.d-window__rh-s { bottom: -3px; left: 12px; right: 12px; height: 6px; cursor: s-resize; }
.d-window__rh-e { right: -3px; top: 12px; bottom: 12px; width: 6px; cursor: e-resize; }
.d-window__rh-w { left: -3px; top: 12px; bottom: 12px; width: 6px; cursor: w-resize; }
.d-window__rh-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: ne-resize; }
.d-window__rh-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nw-resize; }
.d-window__rh-se { bottom: -3px; right: -3px; width: 14px; height: 14px; cursor: se-resize; }
.d-window__rh-se::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--ditto-color-text-disabled, #94a3b8);
  border-bottom: 2px solid var(--ditto-color-text-disabled, #94a3b8);
  border-radius: 0 0 2px 0;
  opacity: 0.6;
}
.d-window__rh-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: sw-resize; }

.d-window__snap-preview {
  position: fixed;
  background: var(--ditto-color-primary-100, rgba(59, 130, 246, 0.15));
  border: 2px solid var(--ditto-color-primary-400, rgba(59, 130, 246, 0.5));
  border-radius: var(--ditto-radius-window, 10px);
  pointer-events: none;
  z-index: 9998;
  transition: all 150ms cubic-bezier(0, 0, 0.2, 1);
}

@media (pointer: coarse) {
  .d-window__titlebar { height: 44px; }
  .d-window__btn { width: 34px; height: 34px; }
  .d-window__rh-n, .d-window__rh-s { height: 10px; }
  .d-window__rh-e, .d-window__rh-w { width: 10px; }
  .d-window__rh-ne, .d-window__rh-nw, .d-window__rh-se, .d-window__rh-sw { width: 18px; height: 18px; }
}
</style>
