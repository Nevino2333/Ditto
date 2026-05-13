import { ref, onMounted, onUnmounted } from 'vue';

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
}

export function useSwipe(element: Ref<HTMLElement | null>, options?: {
  minDistance?: number;
  maxTime?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}) {
  const minDistance = options?.minDistance ?? 50;
  const maxTime = options?.maxTime ?? 300;
  const state = ref<SwipeState | null>(null);

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    state.value = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    };
  }

  function onTouchEnd(e: TouchEvent) {
    if (!state.value) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - state.value.startX;
    const dy = touch.clientY - state.value.startY;
    const dt = Date.now() - state.value.startTime;

    if (dt > maxTime) {
      state.value = null;
      return;
    }

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy && absDx > minDistance) {
      if (dx > 0) options?.onSwipeRight?.();
      else options?.onSwipeLeft?.();
    } else if (absDy > absDx && absDy > minDistance) {
      if (dy > 0) options?.onSwipeDown?.();
      else options?.onSwipeUp?.();
    }

    state.value = null;
  }

  onMounted(() => {
    element.value?.addEventListener('touchstart', onTouchStart, { passive: true });
    element.value?.addEventListener('touchend', onTouchEnd, { passive: true });
  });

  onUnmounted(() => {
    element.value?.removeEventListener('touchstart', onTouchStart);
    element.value?.removeEventListener('touchend', onTouchEnd);
  });
}

import type { Ref } from 'vue';
