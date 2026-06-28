import type { AppManifest, CellRuntimeConfig, CellEvent, Capability } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../permission/manager';
import { ClientCell } from './cell';
import type { CellBridge } from './bridge';

type CellEventHandler = (payload: unknown) => void;

/**
 * AppCellManager：客户端 Cell 编排器（替代 PluginLoader + AppRuntime）。
 * 与服务端 AppCellManager 对称。
 */
export class AppCellManager {
  private cells = new Map<string, ClientCell>();
  private emitter = new EventEmitter();
  private bridges = new Map<string, CellBridge>();

  constructor(
    private ipc: IPCBus,
    private permissions: PermissionManager,
    private container: HTMLElement,
  ) {}

  async startCell(appId: string, manifest: AppManifest, config: CellRuntimeConfig): Promise<ClientCell> {
    if (this.cells.has(appId) && this.cells.get(appId)!.status === 'active') {
      throw DittoError.cellAlreadyRunning(appId);
    }

    let bridge: CellBridge | undefined;
    if (config.type === 'dit' && config.backendCell) {
      bridge = new (await import('./bridge')).CellBridge();
      await bridge.connect(`${config.origin.replace(/^http/, 'ws')}/ws`, 'current');
      this.bridges.set(appId, bridge);

      bridge.onMessage((msg) => this.ipc.handleMessage(msg));
    }

    const cell = new ClientCell(manifest, config, {
      container: this.container,
      bridge,
      requestPermission: (cap: Capability) => this.permissions.request(appId, cap),
    });

    // 代理 cell 事件到 manager emitter
    cell.onActive(() => this.emitter.emit('cell:active', { appId, cell }));
    cell.onError((err) => this.emitter.emit('cell:error', { appId, error: err }));
    cell.onStopped(() => this.emitter.emit('cell:stopped', { appId, cell }));

    this.cells.set(appId, cell);
    await cell.activate();
    return cell;
  }

  async stopCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (!cell) return;
    await cell.unload();
    this.cells.delete(appId);

    const bridge = this.bridges.get(appId);
    if (bridge) {
      bridge.disconnect();
      this.bridges.delete(appId);
    }
  }

  async pauseCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (cell) await cell.pause();
  }

  async resumeCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (cell) await cell.resume();
  }

  getCell(appId: string): ClientCell | undefined {
    return this.cells.get(appId);
  }

  getAllCells(): ClientCell[] {
    return [...this.cells.values()];
  }

  getActiveCells(): ClientCell[] {
    return this.getAllCells().filter((c) => c.status === 'active');
  }

  onCellEvent(event: CellEvent, handler: CellEventHandler): () => void {
    return this.emitter.on(event, handler);
  }

  async destroy(): Promise<void> {
    const ids = [...this.cells.keys()];
    for (const id of ids) {
      await this.stopCell(id);
    }
    this.emitter.removeAllListeners();
  }
}
