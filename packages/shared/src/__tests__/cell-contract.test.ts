import { describe, it, expect } from 'vitest';
import type { Capability, ClientCellStatus, CellEvent, CellRuntimeConfig } from '../cell-contract';

describe('cell-contract types', () => {
  it('Capability 接受标准能力', () => {
    const caps: Capability[] = ['fs:read', 'fs:write', 'net:fetch', 'cell:backend'];
    expect(caps.length).toBe(4);
  });

  it('ClientCellStatus 覆盖所有状态', () => {
    const statuses: ClientCellStatus[] = ['loading', 'active', 'paused', 'stopped', 'error'];
    expect(statuses).toHaveLength(5);
  });

  it('CellRuntimeConfig 区分四种类型', () => {
    const native: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({} as any) };
    const web: CellRuntimeConfig = { type: 'web', url: 'http://x', origin: 'http://x' };
    const pwa: CellRuntimeConfig = { type: 'pwa', manifestUrl: 'http://x/m.json' };
    const dit: CellRuntimeConfig = { type: 'dit', origin: 'http://srv', backendCell: true };
    expect(native.type).toBe('native');
    expect(web.type).toBe('web');
    expect(pwa.type).toBe('pwa');
    expect(dit.type).toBe('dit');
  });

  it('CellEvent 覆盖所有事件', () => {
    const events: CellEvent[] = ['cell:loading', 'cell:active', 'cell:paused', 'cell:resumed', 'cell:stopped', 'cell:error'];
    expect(events).toHaveLength(6);
  });
});
