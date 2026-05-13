import type { ThemeTokens } from '@ditto/shared';

export const dittoTokens: ThemeTokens = {
  color: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a5f',
    },
    surface: {
      base: '#ffffff',
      raised: '#f8fafc',
      overlay: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
      disabled: '#94a3b8',
      inverse: '#ffffff',
    },
    border: {
      subtle: '#e2e8f0',
      strong: '#cbd5e1',
    },
    semantic: {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
    window: {
      frame: '#ffffff',
      titlebar: '#f1f5f9',
      border: '#e2e8f0',
      shadow: 'rgba(0, 0, 0, 0.08)',
      shadowFocused: 'rgba(59, 130, 246, 0.15)',
    },
  },
  space: {
    'taskbar-height': '52px',
    'window-padding': '8px',
    'window-gap': '12px',
    'icon-size': '24px',
  },
  radius: {
    window: '10px',
    button: '6px',
    card: '8px',
    pill: '9999px',
  },
  shadow: {
    window: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    windowFocused: '0 8px 32px rgba(59, 130, 246, 0.12), 0 2px 4px rgba(0, 0, 0, 0.04)',
    taskbar: '0 -1px 12px rgba(0, 0, 0, 0.04)',
    dropdown: '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  motion: {
    duration: {
      fast: '150ms',
      normal: '250ms',
      slow: '350ms',
    },
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
      accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    },
  },
};
