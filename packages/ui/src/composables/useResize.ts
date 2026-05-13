import { ref, onUnmounted } from 'vue';

export type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface ResizeOptions {
  onResize: (delta: { dx: number; dy: number; direction: ResizeDirection }) => void;
  isDisabled?: () => boolean;
}

export function useResize(options: ResizeOptions) {
  const isResizing = ref(false);
  const activeDirection = ref<ResizeDirection | null>(null);
  const lastX = ref(0);
  const lastY = ref(0);

  function onPointerDown(e: PointerEvent, direction: ResizeDirection) {
    if (options.isDisabled?.()) return;
    e.preventDefault();
    e.stopPropagation();
    isResizing.value = true;
    activeDirection.value = direction;
    lastX.value = e.clientX;
    lastY.value = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isResizing.value || !activeDirection.value) return;
    const dx = e.clientX - lastX.value;
    const dy = e.clientY - lastY.value;
    lastX.value = e.clientX;
    lastY.value = e.clientY;
    if (dx === 0 && dy === 0) return;
    options.onResize({ dx, dy, direction: activeDirection.value });
  }

  function onPointerUp() {
    isResizing.value = false;
    activeDirection.value = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  onUnmounted(() => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  });

  return { isResizing, activeDirection, startResize: onPointerDown };
}
