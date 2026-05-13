import type { VFSProvider, VFSEntry, VFSStats, VFSCallback, VFSEvent } from '@ditto/shared';

export class OPFSProvider implements VFSProvider {
  readonly scheme = 'opfs';
  private root: FileSystemDirectoryHandle | null = null;
  private watchers = new Map<string, Set<VFSCallback>>();

  private async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      this.root = await navigator.storage.getDirectory();
    }
    return this.root;
  }

  private async getDirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    const root = await this.getRoot();
    const parts = path.split('/').filter(Boolean);
    let dir = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
  }

  private async getFileHandle(path: string): Promise<FileSystemFileHandle> {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid path: ${path}`);
    const dir = parts.length > 0
      ? await this.getDirHandle(parts.join('/'))
      : await this.getRoot();
    return dir.getFileHandle(fileName);
  }

  async read(path: string): Promise<Uint8Array> {
    const handle = await this.getFileHandle(path);
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid path: ${path}`);
    const dir = parts.length > 0
      ? await this.getDirHandle(parts.join('/'), true)
      : await this.getRoot();
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Uint8Array(data) as unknown as ArrayBuffer);
    await writable.close();
    this.notifyWatchers(path, 'update');
  }

  async delete(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`Invalid path: ${path}`);
    const dir = parts.length > 0
      ? await this.getDirHandle(parts.join('/'))
      : await this.getRoot();
    await dir.removeEntry(name, { recursive: true });
    this.notifyWatchers(path, 'delete');
  }

  async ls(path: string): Promise<VFSEntry[]> {
    const dir = path === '/' || path === ''
      ? await this.getRoot()
      : await this.getDirHandle(path);
    const entries: VFSEntry[] = [];
    const normalizedPath = path === '/' ? '' : path;
    for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      const entryPath = normalizedPath ? `${normalizedPath}/${name}` : `/${name}`;
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        entries.push({
          name,
          path: entryPath,
          type: 'file',
          size: file.size,
          modifiedAt: file.lastModified,
          createdAt: file.lastModified,
        });
      } else {
        entries.push({
          name,
          path: entryPath,
          type: 'directory',
          size: 0,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  async stat(path: string): Promise<VFSStats> {
    try {
      const handle = await this.getFileHandle(path);
      const file = await handle.getFile();
      return { size: file.size, type: 'file', modifiedAt: file.lastModified, createdAt: file.lastModified };
    } catch {
      try {
        await this.getDirHandle(path);
        return { size: 0, type: 'directory', modifiedAt: Date.now(), createdAt: Date.now() };
      } catch {
        throw new Error(`Path not found: ${path}`);
      }
    }
  }

  watch(path: string, callback: VFSCallback): () => void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set());
    }
    this.watchers.get(path)!.add(callback);
    return () => { this.watchers.get(path)?.delete(callback); };
  }

  async mkdir(path: string): Promise<void> {
    await this.getDirHandle(path, true);
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.read(from);
    await this.write(to, data);
    await this.delete(from);
  }

  private notifyWatchers(path: string, eventType: VFSEvent['type']): void {
    const event: VFSEvent = { type: eventType, path };
    for (const [watchPath, callbacks] of this.watchers) {
      if (path.startsWith(watchPath) || watchPath.startsWith(path)) {
        for (const cb of callbacks) {
          try { cb(event); } catch { /* ignore */ }
        }
      }
    }
  }
}

export function isOPFSSupported(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}
