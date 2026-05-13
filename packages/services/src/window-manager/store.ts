import { defineStore } from 'pinia';
import type { WindowState, AppManifest, LayoutMode, DeviceMode } from '@ditto/shared';
import { generateId } from '@ditto/shared';
import { DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_MIN_SIZE, Z_INDEX_BASE, TASKBAR_HEIGHT, BREAKPOINTS } from '@ditto/shared';
import type { SnapZone } from './layout';

function calculateWindowPosition(existingWindows: WindowState[]): { x: number; y: number } {
  const offset = 30;
  const baseX = 80;
  const baseY = 40;
  const index = existingWindows.length;
  return {
    x: baseX + (index % 10) * offset,
    y: baseY + (index % 10) * offset,
  };
}

function detectDeviceMode(): DeviceMode {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

function getDefaultLayoutForDevice(device: DeviceMode): LayoutMode {
  switch (device) {
    case 'mobile': return 'mobile';
    case 'tablet': return 'snap';
    case 'desktop': return 'floating';
  }
}

const Z_INDEX_COMPACT_THRESHOLD = 10000;

export const useWindowStore = defineStore('ditto-windows', {
  state: () => ({
    windows: [] as WindowState[],
    activeWindowId: null as string | null,
    layoutMode: 'floating' as LayoutMode,
    deviceMode: detectDeviceMode(),
    nextZIndex: Z_INDEX_BASE,
  }),

  getters: {
    activeWindow: (state): WindowState | undefined =>
      state.windows.find((w) => w.id === state.activeWindowId),
    visibleWindows: (state): WindowState[] =>
      state.windows.filter((w) => w.state !== 'minimized'),
    minimizedWindows: (state): WindowState[] =>
      state.windows.filter((w) => w.state === 'minimized'),
    sortedByZIndex: (state): WindowState[] =>
      [...state.windows].sort((a, b) => a.zIndex - b.zIndex),
  },

  actions: {
    openWindow(manifest: AppManifest) {
      const id = generateId();
      const position = calculateWindowPosition(this.windows);
      const size = {
        width: manifest.window?.width ?? DEFAULT_WINDOW_SIZE.width,
        height: manifest.window?.height ?? DEFAULT_WINDOW_SIZE.height,
      };
      const minSize = {
        width: manifest.window?.minWidth ?? DEFAULT_WINDOW_MIN_SIZE.width,
        height: manifest.window?.minHeight ?? DEFAULT_WINDOW_MIN_SIZE.height,
      };

      if (this.deviceMode === 'mobile') {
        position.x = 0;
        position.y = 0;
        size.width = window.innerWidth;
        size.height = window.innerHeight - TASKBAR_HEIGHT;
      }

      this.windows.push({
        id,
        appId: manifest.id,
        title: manifest.name,
        icon: manifest.icon,
        position,
        size,
        minSize,
        state: 'normal',
        zIndex: this.allocateZIndex(),
        resizable: manifest.window?.resizable ?? true,
        maximizable: manifest.window?.maximizable ?? true,
      });
      this.activeWindowId = id;
    },

    focusWindow(windowId: string) {
      const win = this.windows.find((w) => w.id === windowId);
      if (!win) return;
      if (win.state === 'minimized') {
        win.state = 'normal';
      }
      this.activeWindowId = windowId;
      win.zIndex = this.allocateZIndex();
    },

    closeWindow(windowId: string) {
      const idx = this.windows.findIndex((w) => w.id === windowId);
      if (idx === -1) return;
      this.windows.splice(idx, 1);
      if (this.activeWindowId === windowId) {
        const visible = this.windows.filter((w) => w.state !== 'minimized');
        this.activeWindowId = visible.length > 0
          ? visible.sort((a, b) => b.zIndex - a.zIndex)[0].id
          : null;
      }
    },

    minimizeWindow(windowId: string) {
      const win = this.windows.find((w) => w.id === windowId);
      if (win) {
        win.state = 'minimized';
        if (this.activeWindowId === windowId) {
          const visible = this.windows.filter((w) => w.state !== 'minimized');
          this.activeWindowId = visible.length > 0
            ? visible.sort((a, b) => b.zIndex - a.zIndex)[0].id
            : null;
        }
      }
    },

    maximizeWindow(windowId: string) {
      const win = this.windows.find((w) => w.id === windowId);
      if (win && win.maximizable) {
        win.state = win.state === 'maximized' ? 'normal' : 'maximized';
      }
    },

    snapWindow(windowId: string, snapZone: SnapZone) {
      const win = this.windows.find((w) => w.id === windowId);
      if (!win) return;
      if (snapZone.type === 'top') {
        win.state = 'maximized';
        return;
      }
      win.state = 'normal';
      win.position = { x: snapZone.bounds.x, y: snapZone.bounds.y };
      win.size = { width: snapZone.bounds.width, height: snapZone.bounds.height };
    },

    toggleFullscreen(windowId: string) {
      const win = this.windows.find((w) => w.id === windowId);
      if (win) {
        win.state = win.state === 'fullscreen' ? 'normal' : 'fullscreen';
      }
    },

    moveWindow(windowId: string, position: { x: number; y: number }) {
      const win = this.windows.find((w) => w.id === windowId);
      if (win && win.state === 'normal') {
        win.position = {
          x: Math.max(0, position.x),
          y: Math.max(0, position.y),
        };
      }
    },

    resizeWindow(windowId: string, size: { width: number; height: number }) {
      const win = this.windows.find((w) => w.id === windowId);
      if (win && win.state === 'normal' && win.resizable) {
        win.size = {
          width: Math.max(win.minSize.width, size.width),
          height: Math.max(win.minSize.height, size.height),
        };
      }
    },

    setLayoutMode(mode: LayoutMode) {
      this.layoutMode = mode;
    },

    updateDeviceMode() {
      this.deviceMode = detectDeviceMode();
      if (this.layoutMode !== getDefaultLayoutForDevice(this.deviceMode)) {
        this.layoutMode = getDefaultLayoutForDevice(this.deviceMode);
      }
    },

    allocateZIndex(): number {
      this.nextZIndex += 1;
      if (this.nextZIndex > Z_INDEX_COMPACT_THRESHOLD) {
        this.compactZIndex();
      }
      return this.nextZIndex;
    },

    compactZIndex() {
      const sorted = [...this.windows].sort((a, b) => a.zIndex - b.zIndex);
      sorted.forEach((win, i) => {
        win.zIndex = Z_INDEX_BASE + i;
      });
      this.nextZIndex = Z_INDEX_BASE + sorted.length;
    },
  },
});
