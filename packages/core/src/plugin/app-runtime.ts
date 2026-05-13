import type { AppManifest, IPCMessage, DitAppConfig } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../sandbox/permission';
import { IFrameSandbox, ShadowSandbox, type Sandbox } from '../sandbox/sandbox';
import { EventEmitter } from '../event/emitter';

export type AppType = 'native' | 'web' | 'pwa' | 'dit';

export interface NativeAppConfig {
  type: 'native';
  componentLoader: () => Promise<any>;
}

export interface WebAppConfig {
  type: 'web';
  url: string;
  origin?: string;
  sandboxAttributes?: string;
}

export interface PWAAppConfig {
  type: 'pwa';
  manifestUrl: string;
  scope?: string;
  startUrl?: string;
}

export type AppRuntimeConfig = NativeAppConfig | WebAppConfig | PWAAppConfig | DitAppConfig;

export interface AppRuntimeInstance {
  appId: string;
  type: AppType;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  sandbox: Sandbox | null;
  component: any | null;
  ipcUnsubscribe: (() => void) | null;
  startedAt?: number;
  error?: Error;
  backendStatus?: 'unknown' | 'running' | 'hibernated' | 'stopped' | 'error';
}

export class AppRuntime {
  private instances = new Map<string, AppRuntimeInstance>();
  private emitter = new EventEmitter();
  private ipc: IPCBus;
  private permissions: PermissionManager;
  private containerEl: HTMLElement | null = null;
  private backendPollTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(ipc: IPCBus, permissions: PermissionManager) {
    this.ipc = ipc;
    this.permissions = permissions;
  }

  setContainer(element: HTMLElement): void {
    this.containerEl = element;
  }

  async startApp(appId: string, manifest: AppManifest, config: AppRuntimeConfig): Promise<AppRuntimeInstance> {
    if (this.instances.has(appId) && this.instances.get(appId)!.status === 'running') {
      throw DittoError.fromUnknown(
        new Error(`App "${appId}" is already running`),
        'APP_ALREADY_RUNNING'
      );
    }

    const instance: AppRuntimeInstance = {
      appId,
      type: config.type,
      status: 'starting',
      sandbox: null,
      component: null,
      ipcUnsubscribe: null,
      backendStatus: 'unknown',
    };

    this.instances.set(appId, instance);

    try {
      for (const perm of manifest.permissions) {
        const granted = await this.permissions.request(appId, perm as any);
        if (!granted) {
          const permName = typeof perm === 'string' ? perm : (perm as any).name;
          console.warn(`[Ditto AppRuntime] Permission "${permName}" denied for ${appId}`);
        }
      }

      switch (config.type) {
        case 'native':
          await this.startNativeApp(instance, config);
          break;
        case 'web':
          await this.startWebApp(instance, config);
          break;
        case 'pwa':
          await this.startPWAApp(instance, config);
          break;
        case 'dit':
          await this.startDitApp(instance, config);
          break;
      }

      instance.status = 'running';
      instance.startedAt = Date.now();
      this.emitter.emit('app:started', instance);
    } catch (e) {
      instance.status = 'error';
      instance.error = e instanceof Error ? e : new Error(String(e));
      this.emitter.emit('app:error', instance);
    }

    return instance;
  }

  async stopApp(appId: string): Promise<void> {
    const instance = this.instances.get(appId);
    if (!instance || instance.status === 'stopped') return;

    instance.status = 'stopping';

    try {
      this.stopBackendPolling(appId);

      if (instance.ipcUnsubscribe) {
        instance.ipcUnsubscribe();
        instance.ipcUnsubscribe = null;
      }

      if (instance.sandbox) {
        instance.sandbox.destroy();
        instance.sandbox = null;
      }

      if (instance.type === 'dit') {
        try {
          const serverUrl = window.location.origin;
          await fetch(`${serverUrl}/api/cell/${instance.appId}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': 'current' },
          });
        } catch {
        }
      }

      instance.component = null;
      instance.status = 'stopped';
      instance.backendStatus = 'stopped';
      this.instances.delete(appId);
      this.emitter.emit('app:stopped', instance);
    } catch (e) {
      instance.status = 'error';
      instance.error = e instanceof Error ? e : new Error(String(e));
      this.emitter.emit('app:error', instance);
    }
  }

  getInstance(appId: string): AppRuntimeInstance | undefined {
    return this.instances.get(appId);
  }

  getRunningInstances(): AppRuntimeInstance[] {
    return [...this.instances.values()].filter((i) => i.status === 'running');
  }

  getBackendStatus(appId: string): AppRuntimeInstance['backendStatus'] {
    return this.instances.get(appId)?.backendStatus ?? 'unknown';
  }

  onStarted(handler: (instance: AppRuntimeInstance) => void): () => void {
    return this.emitter.on('app:started', handler);
  }

  onStopped(handler: (instance: AppRuntimeInstance) => void): () => void {
    return this.emitter.on('app:stopped', handler);
  }

  onError(handler: (instance: AppRuntimeInstance) => void): () => void {
    return this.emitter.on('app:error', handler);
  }

  onBackendStatusChange(handler: (data: { appId: string; status: AppRuntimeInstance['backendStatus'] }) => void): () => void {
    return this.emitter.on('backend:status', handler);
  }

  async destroy(): Promise<void> {
    const ids = [...this.instances.keys()];
    for (const id of ids) {
      await this.stopApp(id);
    }
    this.emitter.removeAllListeners();
  }

  private async startNativeApp(instance: AppRuntimeInstance, config: NativeAppConfig): Promise<void> {
    const component = await config.componentLoader();
    instance.component = component;

    const sandbox = new ShadowSandbox(instance.appId);
    const container = this.containerEl ?? document.body;
    const mountEl = document.createElement('div');
    mountEl.dataset.appId = instance.appId;
    container.appendChild(mountEl);
    sandbox.mount(mountEl, '<div id="app"></div>');
    instance.sandbox = sandbox;
  }

  private async startWebApp(instance: AppRuntimeInstance, config: WebAppConfig): Promise<void> {
    const sandboxAttrs = config.sandboxAttributes ?? 'allow-scripts allow-forms';
    const sandbox = new IFrameSandbox(instance.appId, config.origin);

    const container = this.containerEl ?? document.body;
    const mountEl = document.createElement('div');
    mountEl.dataset.appId = instance.appId;
    mountEl.style.display = 'none';
    container.appendChild(mountEl);

    sandbox.mount(mountEl, config.url);
    instance.sandbox = sandbox;

    const ipcUnsub = sandbox.onMessage((message) => {
      this.ipc.handleMessage(message);
    });
    instance.ipcUnsubscribe = ipcUnsub;

    this.ipc.onDispatch((message) => {
      if (message.target === instance.appId || message.target === '*') {
        sandbox.send(message);
      }
    });
  }

  private async startPWAApp(instance: AppRuntimeInstance, config: PWAAppConfig): Promise<void> {
    const startUrl = config.startUrl ?? config.manifestUrl;
    const scope = config.scope ?? new URL(config.manifestUrl).origin;

    const sandbox = new IFrameSandbox(instance.appId, scope);
    const container = this.containerEl ?? document.body;
    const mountEl = document.createElement('div');
    mountEl.dataset.appId = instance.appId;
    mountEl.style.display = 'none';
    container.appendChild(mountEl);

    sandbox.mount(mountEl, startUrl);
    instance.sandbox = sandbox;

    const ipcUnsub = sandbox.onMessage((message) => {
      this.ipc.handleMessage(message);
    });
    instance.ipcUnsubscribe = ipcUnsub;

    this.ipc.onDispatch((message) => {
      if (message.target === instance.appId || message.target === '*') {
        sandbox.send(message);
      }
    });
  }

  private async startDitApp(instance: AppRuntimeInstance, config: DitAppConfig): Promise<void> {
    const serverUrl = config.origin ?? window.location.origin;
    const frontendUrl = `${serverUrl}/api/apps/${instance.appId}/frontend/index.html`;

    const sandbox = new IFrameSandbox(instance.appId, serverUrl);

    const container = this.containerEl ?? document.body;
    const mountEl = document.createElement('div');
    mountEl.dataset.appId = instance.appId;
    mountEl.style.display = 'none';
    container.appendChild(mountEl);

    sandbox.mount(mountEl, frontendUrl);
    instance.sandbox = sandbox;

    const ipcUnsub = sandbox.onMessage((message) => {
      this.ipc.handleMessage(message);
    });
    instance.ipcUnsubscribe = ipcUnsub;

    this.ipc.onDispatch((message) => {
      if (message.target === instance.appId || message.target === '*') {
        sandbox.send(message);
      }
    });

    await this.ensureBackendStarted(instance.appId, serverUrl);
    this.startBackendPolling(instance.appId, serverUrl);
  }

  private async ensureBackendStarted(appId: string, serverUrl: string): Promise<void> {
    try {
      const response = await fetch(`${serverUrl}/api/cell/${appId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'current' },
      });
      if (!response.ok) {
        console.warn(`[Ditto AppRuntime] Failed to start backend for ${appId}: ${response.status}`);
      }
    } catch (e) {
      console.warn(`[Ditto AppRuntime] Could not reach server for backend start:`, e);
    }
  }

  private startBackendPolling(appId: string, serverUrl: string): void {
    this.stopBackendPolling(appId);

    const timer = setInterval(async () => {
      const instance = this.instances.get(appId);
      if (!instance || instance.status !== 'running') {
        this.stopBackendPolling(appId);
        return;
      }

      try {
        const response = await fetch(`${serverUrl}/api/cell/${appId}/health`);
        if (response.ok) {
          const data = await response.json();
          const newStatus = data.status as AppRuntimeInstance['backendStatus'];

          if (newStatus !== instance.backendStatus) {
            instance.backendStatus = newStatus;
            this.emitter.emit('backend:status', { appId, status: newStatus });
          }

          if (newStatus === 'hibernated') {
            console.log(`[Ditto AppRuntime] Backend for ${appId} is hibernated, waking...`);
            await fetch(`${serverUrl}/api/cell/${appId}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Id': 'current' },
            });
            instance.backendStatus = 'running';
            this.emitter.emit('backend:status', { appId, status: 'running' });
          }
        }
      } catch {
        if (instance.backendStatus !== 'error') {
          instance.backendStatus = 'error';
          this.emitter.emit('backend:status', { appId, status: 'error' });
        }
      }
    }, 15000);

    this.backendPollTimers.set(appId, timer);
  }

  private stopBackendPolling(appId: string): void {
    const timer = this.backendPollTimers.get(appId);
    if (timer) {
      clearInterval(timer);
      this.backendPollTimers.delete(appId);
    }
  }
}
