import { ref, onUnmounted, type Ref } from 'vue';
import { detectSnapZone, type SnapZone } from '@ditto/services';

interface DragOptions {
  getPosition: () => { x: number; y: number };
  onMove: (position: { x: number; y: number }) => void;
  onDragEnd?: (position: { x: number; y: number }, snapZone: SnapZone | null) => void;
  onSnapZone?: (snapZone: SnapZone | null) => void;
  isDisabled?: () => boolean;
}

export function useDrag(options: DragOptions) {
  const isDragging = ref(false);
  const offset = ref({ x: 0, y: 0 });
  const currentSnapZone = ref<SnapZone | null>(null);
  const lastPointerPosition = ref({ x: 0, y: 0 });

  function onPointerDown(e: PointerEvent) {
    if (options.isDisabled?.()) return;
    const pos = options.getPosition();
    offset.value = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    isDragging.value = true;
    currentSnapZone.value = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging.value) return;
    const pos = {
      x: Math.max(0, e.clientX - offset.value.x),
      y: Math.max(0, e.clientY - offset.value.y),
    };
    lastPointerPosition.value = { x: e.clientX, y: e.clientY };
    options.onMove(pos);

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const zone = detectSnapZone({ x: e.clientX, y: e.clientY }, viewport);
    if (zone !== currentSnapZone.value) {
      currentSnapZone.value = zone;
      options.onSnapZone?.(zone);
    }
  }

  function onPointerUp() {
    isDragging.value = false;
    const snapZone = currentSnapZone.value;
    currentSnapZone.value = null;
    options.onSnapZone?.(null);
    options.onDragEnd?.(lastPointerPosition.value, snapZone);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  onUnmounted(() => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  });

  return { isDragging, currentSnapZone, onPointerDown };
}
