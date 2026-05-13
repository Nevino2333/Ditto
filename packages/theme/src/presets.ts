import type { Theme, ThemeTokens } from '@ditto/shared';
import { dittoTokens } from './tokens';

export const dittoLight: Theme = {
  id: 'ditto-light',
  name: 'Ditto Light',
  colorScheme: 'light',
  tokens: dittoTokens,
};

const darkTokens: ThemeTokens = {
  color: {
    primary: {
      50: '#172554',
      100: '#1e3a5f',
      200: '#1d4ed8',
      300: '#2563eb',
      400: '#3b82f6',
      500: '#60a5fa',
      600: '#93c5fd',
      700: '#bfdbfe',
      800: '#dbeafe',
      900: '#eff6ff',
    },
    surface: {
      base: '#0f172a',
      raised: '#1e293b',
      overlay: '#1e293b',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#64748b',
      inverse: '#0f172a',
    },
    border: {
      subtle: '#334155',
      strong: '#475569',
    },
    semantic: {
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
    window: {
      frame: '#1e293b',
      titlebar: '#1e293b',
      border: '#334155',
      shadow: 'rgba(0, 0, 0, 0.3)',
      shadowFocused: 'rgba(96, 165, 250, 0.2)',
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
    window: '0 4px 24px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)',
    windowFocused: '0 8px 32px rgba(96, 165, 250, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
    taskbar: '0 -1px 12px rgba(0, 0, 0, 0.2)',
    dropdown: '0 8px 24px rgba(0, 0, 0, 0.3)',
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

export const dittoDark: Theme = {
  id: 'ditto-dark',
  name: 'Ditto Dark',
  colorScheme: 'dark',
  tokens: darkTokens,
};
