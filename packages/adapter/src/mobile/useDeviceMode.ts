import { ref, onMounted, onUnmounted, computed } from 'vue';
import { BREAKPOINTS } from '@ditto/shared';
import type { DeviceMode } from '@ditto/shared';

export function useDeviceMode() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const height = ref(typeof window !== 'undefined' ? window.innerHeight : 800);

  const deviceMode = computed<DeviceMode>(() => {
    if (width.value < BREAKPOINTS.mobile) return 'mobile';
    if (width.value < BREAKPOINTS.tablet) return 'tablet';
    return 'desktop';
  });

  const isMobile = computed(() => deviceMode.value === 'mobile');
  const isTablet = computed(() => deviceMode.value === 'tablet');
  const isDesktop = computed(() => deviceMode.value === 'desktop');
  const isTouchDevice = computed(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  function onResize() {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
  }

  onMounted(() => {
    window.addEventListener('resize', onResize, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener('resize', onResize);
  });

  return {
    width,
    height,
    deviceMode,
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
  };
}
