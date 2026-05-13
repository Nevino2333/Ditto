import type { CellInstance as CellInstanceType, AppManifest, AppCellModule } from '@ditto/shared';
import * as path from 'node:path';
import { CellRouter } from './cell-router';
import { CellContextImpl, createCellDatabase, createCellStorage, createCellLogger, createCellMetrics } from './cell-context';
import { CellIPCBridge } from './cell-ipc-bridge';

export type CellStatus = CellInstanceType['status'];

export class CellInstanceImpl {
  readonly cellId: string;
  readonly appId: string;
  readonly manifest: AppManifest;
  readonly replica: 'shared' | 'exclusive';
  readonly userIds: Set<string>;

  private status: CellStatus = 'creating';
  private startedAt?: number;
  private lastActivityAt?: number;
  private memoryUsage?: number;
  private cpuUsage?: number;
  private requestCount: number = 0;
  private error?: Error;
  private cellRouter: CellRouter;
  private cellContext: CellContextImpl | null = null;
  private ipcBridge: CellIPCBridge;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private memoryCheckInterval: ReturnType<typeof setInterval> | null = null;
  private cellModule: AppCellModule | null = null;
  private backendDir: string | null = null;

  constructor(cellId: string, appId: string, manifest: AppManifest, replica: 'shared' | 'exclusive' = 'shared') {
    this.cellId = cellId;
    this.appId = appId;
    this.manifest = manifest;
    this.replica = replica;
    this.userIds = new Set();
    this.cellRouter = new CellRouter();
    this.ipcBridge = new CellIPCBridge(appId, cellId);
  }

  setBackendDir(dir: string): void {
    this.backendDir = dir;
  }

  async start(): Promise<void> {
    if (this.status === 'running') return;

    this.status = 'creating';
    try {
      const backendConfig = this.manifest.backend;
      if (!backendConfig) {
        throw new Error(`App "${this.appId}" has no backend configuration`);
      }

      this.cellContext = new CellContextImpl({
        appId: this.appId,
        cellId: this.cellId,
        env: backendConfig.env ?? {},
        db: createCellDatabase(this.appId),
        storage: createCellStorage(this.appId),
        ipc: this.ipcBridge,
        logger: createCellLogger(this.appId),
        metrics: createCellMetrics(this.appId),
      });

      if (this.backendDir) {
        await this.loadAndInitModule(backendConfig.entry);
      }

      this.status = 'running';
      this.startedAt = Date.now();
      this.lastActivityAt = Date.now();
      this.requestCount = 0;

      if (backendConfig.healthCheck) {
        this.startHealthCheck(backendConfig.healthCheck);
      }

      this.startMemoryMonitor();
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e : new Error(String(e));
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') return;

    this.status = 'stopping';
    try {
      if (this.cellModule?.onStop && this.cellContext) {
        await this.cellModule.onStop(this.cellContext);
      }
      this.stopHealthCheck();
      this.stopMemoryMonitor();
      this.ipcBridge.destroy();
      this.status = 'stopped';
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e : new Error(String(e));
    }
  }

  async hibernate(): Promise<void> {
    if (this.status !== 'running') return;
    this.status = 'hibernating';
    try {
      this.stopHealthCheck();
      this.stopMemoryMonitor();
      this.status = 'hibernated';
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e : new Error(String(e));
    }
  }

  async wake(): Promise<void> {
    if (this.status !== 'hibernated') return;
    this.status = 'waking';
    try {
      if (this.cellModule?.onStart && this.cellContext) {
        await this.cellModule.onStart(this.cellContext);
      }
      const backendConfig = this.manifest.backend;
      if (backendConfig?.healthCheck) {
        this.startHealthCheck(backendConfig.healthCheck);
      }
      this.startMemoryMonitor();
      this.status = 'running';
      this.lastActivityAt = Date.now();
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e : new Error(String(e));
    }
  }

  async destroy(): Promise<void> {
    if (this.cellModule?.onDestroy && this.cellContext) {
      try {
        await this.cellModule.onDestroy(this.cellContext);
      } catch { }
    }
    await this.stop();
    this.cellModule = null;
    this.userIds.clear();
  }

  addUserId(userId: string): void {
    this.userIds.add(userId);
  }

  removeUserId(userId: string): void {
    this.userIds.delete(userId);
  }

  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  recordRequest(): void {
    this.requestCount++;
    this.recordActivity();
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getCpuUsage(): number {
    return this.cpuUsage ?? 0;
  }

  getMemoryUsageMB(): number {
    return this.memoryUsage ?? 0;
  }

  getRouter(): CellRouter {
    return this.cellRouter;
  }

  getIpcBridge(): CellIPCBridge {
    return this.ipcBridge;
  }

  getContext(): CellContextImpl | null {
    return this.cellContext;
  }

  getModule(): AppCellModule | null {
    return this.cellModule;
  }

  toCellInstance(): CellInstanceType {
    return {
      cellId: this.cellId,
      appId: this.appId,
      status: this.status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      memoryUsage: this.memoryUsage,
      error: this.error,
      replica: this.replica,
      userIds: [...this.userIds],
    };
  }

  private async loadAndInitModule(entryPath: string): Promise<void> {
    if (!this.backendDir || !this.cellContext) return;

    const fullPath = path.resolve(this.backendDir, entryPath);

    try {
      const mod = await import(fullPath);
      this.cellModule = (mod.default ?? mod) as AppCellModule;

      if (this.cellModule.onInit) {
        await this.cellModule.onInit(this.cellContext);
      }

      this.cellModule.registerRoutes(this.cellRouter);

      if (this.cellModule.registerWebSocket) {
        this.cellModule.registerWebSocket({
          handle: () => { },
        } as any);
      }

      if (this.cellModule.onStart) {
        await this.cellModule.onStart(this.cellContext);
      }
    } catch (e) {
      const logger = createCellLogger(this.appId);
      logger.warn(`Failed to load backend module from ${fullPath}, running in stub mode`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private startHealthCheck(healthPath: string): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(() => {
      if (this.status !== 'running' && this.status !== 'hibernated') {
        this.status = 'error';
        this.error = new Error('Cell health check failed: unexpected status');
      }
    }, 30000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private startMemoryMonitor(): void {
    this.stopMemoryMonitor();
    this.memoryCheckInterval = setInterval(() => {
      if (this.status !== 'running') return;
      try {
        const mem = process.memoryUsage?.();
        if (mem) {
          this.memoryUsage = Math.round(mem.heapUsed / 1024 / 1024);
          this.cpuUsage = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        }
      } catch {
      }
    }, 10000);
  }

  private stopMemoryMonitor(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }
}
