import type { WindowState, Position, Size } from '@ditto/shared';
import { TASKBAR_HEIGHT } from '@ditto/shared';

export function calculateTilingLayout(
  windows: WindowState[],
  viewport: { width: number; height: number }
): Map<string, { position: Position; size: Size }> {
  const result = new Map<string, { position: Position; size: Size }>();
  const visible = windows.filter((w) => w.state === 'normal');
  if (visible.length === 0) return result;

  const count = visible.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellWidth = Math.floor(viewport.width / cols);
  const cellHeight = Math.floor((viewport.height - TASKBAR_HEIGHT) / rows);

  visible.forEach((win, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    result.set(win.id, {
      position: { x: col * cellWidth, y: row * cellHeight },
      size: { width: cellWidth, height: cellHeight },
    });
  });

  return result;
}

export interface SnapZone {
  type: 'left' | 'right' | 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  bounds: { x: number; y: number; width: number; height: number };
}

export function getSnapZones(viewport: { width: number; height: number }): SnapZone[] {
  const w = viewport.width;
  const h = viewport.height - TASKBAR_HEIGHT;
  const hw = Math.floor(w / 2);
  const hh = Math.floor(h / 2);

  return [
    { type: 'left', bounds: { x: 0, y: 0, width: hw, height: h } },
    { type: 'right', bounds: { x: hw, y: 0, width: w - hw, height: h } },
    { type: 'top', bounds: { x: 0, y: 0, width: w, height: hh } },
    { type: 'top-left', bounds: { x: 0, y: 0, width: hw, height: hh } },
    { type: 'top-right', bounds: { x: hw, y: 0, width: w - hw, height: hh } },
    { type: 'bottom-left', bounds: { x: 0, y: hh, width: hw, height: h - hh } },
    { type: 'bottom-right', bounds: { x: hw, y: hh, width: w - hw, height: h - hh } },
  ];
}

export function detectSnapZone(
  position: Position,
  viewport: { width: number; height: number },
  threshold = 20
): SnapZone | null {
  const zones = getSnapZones(viewport);
  const { x, y } = position;

  if (x <= threshold) {
    if (y <= threshold) return zones.find((z) => z.type === 'top-left') ?? null;
    if (y >= viewport.height - TASKBAR_HEIGHT - threshold) return zones.find((z) => z.type === 'bottom-left') ?? null;
    return zones.find((z) => z.type === 'left') ?? null;
  }

  if (x >= viewport.width - threshold) {
    if (y <= threshold) return zones.find((z) => z.type === 'top-right') ?? null;
    if (y >= viewport.height - TASKBAR_HEIGHT - threshold) return zones.find((z) => z.type === 'bottom-right') ?? null;
    return zones.find((z) => z.type === 'right') ?? null;
  }

  if (y <= threshold) {
    return zones.find((z) => z.type === 'top') ?? null;
  }

  return null;
}
