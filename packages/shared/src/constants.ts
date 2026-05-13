export const DEFAULT_WINDOW_SIZE = { width: 800, height: 600 };
export const DEFAULT_WINDOW_MIN_SIZE = { width: 320, height: 240 };
export const TASKBAR_HEIGHT = 52;
export const WINDOW_BORDER_RADIUS = 10;
export const WINDOW_TITLEBAR_HEIGHT = 40;
export const Z_INDEX_BASE = 100;
export const Z_INDEX_OVERLAY = 9000;
export const Z_INDEX_SYSTEM = 9999;

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export const MOTION = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
} as const;
