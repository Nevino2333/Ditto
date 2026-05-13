import type { AppManifest, CellInstance as CellInstanceType } from '@ditto/shared';
import { CellInstanceImpl } from './cell-instance';
import type { Hono } from 'hono';

interface ManagerConfig {
  defaultReplica: 'shared' | 'exclusive';
  hibernateAfterMs: number;
  wakeTimeoutMs: number;
  maxCellsPerApp: number;
  healthCheckIntervalMs: number;
  hibernateCheckIntervalMs: number;
}

const DEFAULT_CONFIG: ManagerConfig = {
  defaultReplica: 'shared',
  hibernateAfterMs: 900000,
  wakeTimeoutMs: 3000,
  maxCellsPerApp: 10,
  healthCheckIntervalMs: 30000,
  hibernateCheckIntervalMs: 60000,
};

export class AppCellManager {
  private cells = new Map<string, CellInstanceImpl>();
  private appCells = new Map<string, string[]>();
  private config: ManagerConfig;
  private app: Hono | null = null;
  private installedApps = new Map<string, { manifest: AppManifest; backendDir: string }>();
  private hibernateTimer: ReturnType<typeof setInterval> | null = null;
  private wsHandler: ((appId: string, channel: string, payload: unknown, target?: string) => void) | null = null;

  constructor(config?: Partial<ManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setApp(app: Hono): void {
    this.app = app;
  }

  setWSHandler(handler: (appId: string, channel: string, payload: unknown, target?: string) => void): void {
    this.wsHandler = handler;
  }

  registerApp(appId: string, manifest: AppManifest, backendDir: string): void {
    this.installedApps.set(appId, { manifest, backendDir });
  }

  unregisterApp(appId: string): void {
    this.installedApps.delete(appId);
    const cellIds = this.appCells.get(appId);
    if (cellIds) {
      for (const cellId of cellIds) {
        this.destroyCell(cellId);
      }
    }
    this.appCells.delete(appId);
  }

  async createCell(appId: string, userId: string, replica?: 'shared' | 'exclusive'): Promise<CellInstanceImpl> {
    const installed = this.installedApps.get(appId);
    if (!installed) {
      throw new Error(`App "${appId}" is not installed`);
    }

    const replicaMode = replica ?? this.config.defaultReplica;

    if (replicaMode === 'shared') {
      const existingCellIds = this.appCells.get(appId) ?? [];
      for (const cellId of existingCellIds) {
        const cell = this.cells.get(cellId);
        if (cell && cell.replica === 'shared' && cell.toCellInstance().status === 'running') {
          cell.addUserId(userId);
          return cell;
        }
      }
    }

    const cellId = `cell_${appId.replace(/\./g, '_')}_${crypto.randomUUID().slice(0, 8)}`;
    const cell = new CellInstanceImpl(cellId, appId, installed.manifest, replicaMode);
    cell.addUserId(userId);
    cell.setBackendDir(installed.backendDir);

    if (this.wsHandler) {
      cell.getIpcBridge().setHostSender(this.wsHandler);
    }

    this.cells.set(cellId, cell);

    const cellIds = this.appCells.get(appId) ?? [];
    cellIds.push(cellId);
    this.appCells.set(appId, cellIds);

    await cell.start();

    if (this.app) {
      const router = cell.getRouter();
      const prefix = `/api/cell/${appId}`;
      router.applyToHono(this.app, prefix);
    }

    return cell;
  }

  async destroyCell(cellId: string): Promise<void> {
    const cell = this.cells.get(cellId);
    if (!cell) return;

    await cell.destroy();
    this.cells.delete(cellId);

    const cellIds = this.appCells.get(cell.appId);
    if (cellIds) {
      const idx = cellIds.indexOf(cellId);
      if (idx !== -1) cellIds.splice(idx, 1);
      if (cellIds.length === 0) this.appCells.delete(cell.appId);
    }
  }

  async startCellForUser(appId: string, userId: string): Promise<CellInstanceImpl> {
    const cell = await this.findOrCreateCell(appId, userId);
    if (cell.toCellInstance().status === 'hibernated') {
      await cell.wake();
    }
    cell.recordActivity();
    return cell;
  }

  async stopCellForUser(appId: string, userId: string): Promise<void> {
    const cellIds = this.appCells.get(appId) ?? [];
    for (const cellId of cellIds) {
      const cell = this.cells.get(cellId);
      if (cell && cell.userIds.has(userId)) {
        cell.removeUserId(userId);
        if (cell.replica === 'exclusive' || cell.userIds.size === 0) {
          await this.destroyCell(cellId);
        }
      }
    }
  }

  async hibernateCell(cellId: string): Promise<void> {
    const cell = this.cells.get(cellId);
    if (cell) {
      await cell.hibernate();
    }
  }

  async wakeCell(cellId: string): Promise<boolean> {
    const cell = this.cells.get(cellId);
    if (!cell) return false;
    try {
      await cell.wake();
      return true;
    } catch {
      return false;
    }
  }

  getCell(cellId: string): CellInstanceImpl | undefined {
    return this.cells.get(cellId);
  }

  getCellsByApp(appId: string): CellInstanceImpl[] {
    const cellIds = this.appCells.get(appId) ?? [];
    return cellIds.map((id) => this.cells.get(id)).filter((c): c is CellInstanceImpl => !!c);
  }

  getAllCells(): CellInstanceType[] {
    return [...this.cells.values()].map((c) => c.toCellInstance());
  }

  getInstalledApps(): Map<string, { manifest: AppManifest; backendDir: string }> {
    return this.installedApps;
  }

  getInstalledApp(appId: string): { manifest: AppManifest; backendDir: string } | undefined {
    return this.installedApps.get(appId);
  }

  startHibernateChecker(): void {
    if (this.hibernateTimer) return;
    this.hibernateTimer = setInterval(() => this.checkIdleCells(), this.config.hibernateCheckIntervalMs);
  }

  stopHibernateChecker(): void {
    if (this.hibernateTimer) {
      clearInterval(this.hibernateTimer);
      this.hibernateTimer = null;
    }
  }

  deliverIPCMessage(appId: string, channel: string, payload: unknown, target?: string): void {
    const cells = this.getCellsByApp(appId);
    for (const cell of cells) {
      if (cell.toCellInstance().status === 'running') {
        cell.getIpcBridge().receiveFromHost(channel, payload);
      }
    }
  }

  async destroyAll(): Promise<void> {
    this.stopHibernateChecker();
    const cellIds = [...this.cells.keys()];
    for (const cellId of cellIds) {
      await this.destroyCell(cellId);
    }
  }

  private async findOrCreateCell(appId: string, userId: string): Promise<CellInstanceImpl> {
    const cellIds = this.appCells.get(appId) ?? [];
    for (const cellId of cellIds) {
      const cell = this.cells.get(cellId);
      if (cell && cell.replica === 'shared' && cell.userIds.has(userId)) {
        return cell;
      }
      if (cell && cell.replica === 'exclusive' && cell.userIds.has(userId)) {
        return cell;
      }
    }
    return this.createCell(appId, userId);
  }

  private async checkIdleCells(): Promise<void> {
    const now = Date.now();
    for (const [cellId, cell] of this.cells) {
      const instance = cell.toCellInstance();
      if (instance.status !== 'running') continue;
      if (!instance.lastActivityAt) continue;

      const idleMs = now - instance.lastActivityAt;
      if (idleMs > this.config.hibernateAfterMs) {
        console.log(`[AppCellManager] Hibernating idle cell ${cellId} (idle ${Math.round(idleMs / 1000)}s)`);
        await cell.hibernate();
      }
    }
  }
}
