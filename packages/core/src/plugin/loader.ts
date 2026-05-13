import type { AppManifest, IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../sandbox/permission';
import { IFrameSandbox, ShadowSandbox, type Sandbox } from '../sandbox/sandbox';

export interface PluginInstance {
  id: string;
  manifest: AppManifest;
  status: 'loading' | 'running' | 'stopped' | 'error';
  error?: Error;
  loadedAt?: number;
  sandbox: Sandbox | null;
  ipcUnsubscribe: (() => void) | null;
}

export class PluginLoader {
  private plugins = new Map<string, PluginInstance>();
  private emitter = new EventEmitter();
  private ipc: IPCBus;
  private permissions: PermissionManager;
  private containerEl: HTMLElement | null = null;

  constructor(ipc: IPCBus, permissions: PermissionManager) {
    this.ipc = ipc;
    this.permissions = permissions;
  }

  setContainer(element: HTMLElement): void {
    this.containerEl = element;
  }

  async load(manifest: AppManifest): Promise<PluginInstance> {
    if (this.plugins.has(manifest.id)) {
      throw DittoError.fromUnknown(
        new Error(`Plugin "${manifest.id}" is already loaded`),
        'PLUGIN_ALREADY_LOADED'
      );
    }

    const instance: PluginInstance = {
      id: manifest.id,
      manifest,
      status: 'loading',
      sandbox: null,
      ipcUnsubscribe: null,
    };

    this.plugins.set(manifest.id, instance);

    try {
      for (const perm of manifest.permissions) {
        const granted = await this.permissions.request(manifest.id, perm as any);
        if (!granted) {
          const permName = typeof perm === 'string' ? perm : (perm as any).name;
          console.warn(`[Ditto PluginLoader] Permission "${permName}" denied for ${manifest.id}`);
        }
      }

      const sandbox = this.createSandboxForApp(manifest);
      instance.sandbox = sandbox;

      if (sandbox instanceof IFrameSandbox) {
        const ipcUnsub = sandbox.onMessage((message) => {
          this.ipc.handleMessage(message);
        });
        instance.ipcUnsubscribe = ipcUnsub;

        this.ipc.onDispatch((message) => {
          if (message.target === manifest.id || message.target === '*') {
            sandbox.send(message);
          }
        });
      }

      instance.status = 'running';
      instance.loadedAt = Date.now();
      this.emitter.emit('plugin:loaded', instance);
    } catch (e) {
      instance.status = 'error';
      instance.error = e instanceof Error ? e : new Error(String(e));
      this.emitter.emit('plugin:error', instance);
    }

    return instance;
  }

  async unload(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) return;

    try {
      if (instance.ipcUnsubscribe) {
        instance.ipcUnsubscribe();
        instance.ipcUnsubscribe = null;
      }

      if (instance.sandbox) {
        instance.sandbox.destroy();
        instance.sandbox = null;
      }

      instance.status = 'stopped';
      this.plugins.delete(pluginId);
      this.emitter.emit('plugin:unloaded', instance);
    } catch (e) {
      console.error(`[Ditto PluginLoader] Error unloading "${pluginId}":`, e);
      instance.status = 'error';
      instance.error = e instanceof Error ? e : new Error(String(e));
    }
  }

  routeMessage(message: IPCMessage): void {
    if (message.target) {
      const instance = this.plugins.get(message.target);
      if (instance?.sandbox && instance.status === 'running') {
        instance.sandbox.send(message);
      }
    } else {
      for (const [, instance] of this.plugins) {
        if (instance.sandbox && instance.status === 'running') {
          instance.sandbox.send(message);
        }
      }
    }
  }

  sendToPlugin(pluginId: string, channel: string, payload: unknown): void {
    const instance = this.plugins.get(pluginId);
    if (!instance || instance.status !== 'running') return;
    this.ipc.send(channel, payload, pluginId);
  }

  get(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  getAll(): PluginInstance[] {
    return [...this.plugins.values()];
  }

  getRunning(): PluginInstance[] {
    return [...this.plugins.values()].filter((p) => p.status === 'running');
  }

  onLoaded(handler: (instance: PluginInstance) => void): () => void {
    return this.emitter.on('plugin:loaded', handler);
  }

  onUnloaded(handler: (instance: PluginInstance) => void): () => void {
    return this.emitter.on('plugin:unloaded', handler);
  }

  onError(handler: (instance: PluginInstance) => void): () => void {
    return this.emitter.on('plugin:error', handler);
  }

  async destroy(): Promise<void> {
    const pluginIds = [...this.plugins.keys()];
    for (const id of pluginIds) {
      await this.unload(id);
    }
    this.emitter.removeAllListeners();
  }

  private createSandboxForApp(manifest: AppManifest): Sandbox {
    const container = this.containerEl ?? document.body;

    if (manifest.sandbox === 'strict') {
      const sandbox = new IFrameSandbox(manifest.id);
      const mountContainer = document.createElement('div');
      mountContainer.style.display = 'none';
      mountContainer.dataset.appId = manifest.id;
      container.appendChild(mountContainer);
      sandbox.mount(mountContainer, manifest.entry);
      return sandbox;
    }

    const sandbox = new ShadowSandbox(manifest.id);
    const mountContainer = document.createElement('div');
    mountContainer.dataset.appId = manifest.id;
    container.appendChild(mountContainer);
    sandbox.mount(mountContainer, `<div id="app"></div>`);
    return sandbox;
  }
}
