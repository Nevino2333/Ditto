import type { VFSProvider, VFSEntry, VFSStats, VFSCallback } from '@ditto/shared';
import { IndexedDBProvider } from './providers/indexeddb';
import { OPFSProvider, isOPFSSupported } from './providers/opfs';

export class VFS {
  private providers = new Map<string, VFSProvider>();
  private defaultScheme: string;

  constructor() {
    const idbProvider = new IndexedDBProvider();
    this.registerProvider(idbProvider);
    this.defaultScheme = idbProvider.scheme;

    if (isOPFSSupported()) {
      this.registerProvider(new OPFSProvider());
    }
  }

  registerProvider(provider: VFSProvider): void {
    this.providers.set(provider.scheme, provider);
  }

  private resolveProvider(path: string): { provider: VFSProvider; cleanPath: string } {
    const schemeMatch = path.match(/^(\w+):\/\/(.+)$/);
    if (schemeMatch) {
      const provider = this.providers.get(schemeMatch[1]);
      if (!provider) throw new Error(`Unknown VFS scheme: ${schemeMatch[1]}`);
      return { provider, cleanPath: schemeMatch[2] };
    }
    const defaultProvider = this.providers.get(this.defaultScheme);
    if (!defaultProvider) throw new Error('No default VFS provider');
    return { provider: defaultProvider, cleanPath: path };
  }

  async read(path: string): Promise<Uint8Array> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.read(cleanPath);
  }

  async readText(path: string): Promise<string> {
    const data = await this.read(path);
    return new TextDecoder().decode(data);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.write(cleanPath, data);
  }

  async writeText(path: string, text: string): Promise<void> {
    const data = new TextEncoder().encode(text);
    return this.write(path, data);
  }

  async delete(path: string): Promise<void> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.delete(cleanPath);
  }

  async ls(path: string): Promise<VFSEntry[]> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.ls(cleanPath);
  }

  async stat(path: string): Promise<VFSStats> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.stat(cleanPath);
  }

  watch(path: string, callback: VFSCallback): () => void {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.watch(cleanPath, callback);
  }

  async mkdir(path: string): Promise<void> {
    const { provider, cleanPath } = this.resolveProvider(path);
    return provider.mkdir(cleanPath);
  }

  async rename(from: string, to: string): Promise<void> {
    const { provider: fromProvider, cleanPath: fromPath } = this.resolveProvider(from);
    const { provider: toProvider, cleanPath: toPath } = this.resolveProvider(to);

    if (fromProvider === toProvider) {
      return fromProvider.rename(fromPath, toPath);
    }

    const data = await fromProvider.read(fromPath);
    await toProvider.write(toPath, data);
    await fromProvider.delete(fromPath);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

let vfsInstance: VFS | null = null;

export function getVFS(): VFS {
  if (!vfsInstance) {
    vfsInstance = new VFS();
  }
  return vfsInstance;
}
