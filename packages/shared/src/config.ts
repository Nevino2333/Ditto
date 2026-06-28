import type { ThemeTokens } from '@ditto/shared';

export interface DittoConfig {
  kernel: {
    id: string;
    strictMode: boolean;
    dev?: boolean;
  };
  window: {
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    minHeight: number;
    titlebarHeight: number;
    borderRadius: number;
    animations: boolean;
    snapEnabled: boolean;
    snapThreshold: number;
  };
  taskbar: {
    height: number;
    position: 'bottom' | 'top' | 'left' | 'right';
    autoHide: boolean;
    blur: boolean;
  };
  desktop: {
    iconSize: number;
    iconGap: number;
    columns: number;
    wallpaper?: string;
  };
  theme: {
    defaultScheme: 'light' | 'dark';
    followSystem: boolean;
    customTokens?: Partial<ThemeTokens>;
  };
  permissions: {
    autoGrantSystemApps: boolean;
    persistDecisions: boolean;
  };
  ipc: {
    requestTimeout: number;
    maxRetries: number;
  };
}

export const defaultConfig: DittoConfig = {
  kernel: {
    id: 'ditto-kernel',
    strictMode: false,
  },
  window: {
    defaultWidth: 800,
    defaultHeight: 600,
    minWidth: 320,
    minHeight: 240,
    titlebarHeight: 36,
    borderRadius: 10,
    animations: true,
    snapEnabled: true,
    snapThreshold: 20,
  },
  taskbar: {
    height: 52,
    position: 'bottom',
    autoHide: false,
    blur: true,
  },
  desktop: {
    iconSize: 80,
    iconGap: 8,
    columns: 0,
  },
  theme: {
    defaultScheme: 'light',
    followSystem: true,
  },
  permissions: {
    autoGrantSystemApps: true,
    persistDecisions: true,
  },
  ipc: {
    requestTimeout: 10000,
    maxRetries: 0,
  },
};

export function mergeConfig(partial: Partial<DittoConfig>): DittoConfig {
  return deepMerge(defaultConfig, partial) as DittoConfig;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
