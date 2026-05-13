import type { VFSProvider, VFSEntry, VFSStats, VFSCallback, VFSEvent } from '@ditto/shared';

const DB_NAME = 'ditto-vfs';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_META = 'meta';

interface FileRecord {
  path: string;
  data: ArrayBuffer;
  type: 'file' | 'directory';
  size: number;
  createdAt: number;
  modifiedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBProvider implements VFSProvider {
  readonly scheme = 'idb';
  private watchers = new Map<string, Set<VFSCallback>>();

  async read(path: string): Promise<Uint8Array> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.get(normalizePath(path));
      req.onsuccess = () => {
        const record = req.result as FileRecord | undefined;
        if (!record || record.type !== 'file') {
          reject(new Error(`File not found: ${path}`));
        } else {
          resolve(new Uint8Array(record.data));
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const normalized = normalizePath(path);
    const now = Date.now();
    const db = await openDB();

    await this.ensureParentDir(normalized, db);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const record: FileRecord = {
        path: normalized,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        type: 'file',
        size: data.byteLength,
        createdAt: now,
        modifiedAt: now,
      };

      const existingReq = store.get(normalized);
      existingReq.onsuccess = () => {
        if (existingReq.result) {
          record.createdAt = (existingReq.result as FileRecord).createdAt;
        }
        const putReq = store.put(record);
        putReq.onsuccess = () => {
          this.notifyWatchers(normalized, 'update');
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      };
      existingReq.onerror = () => reject(existingReq.error);
    });
  }

  async delete(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const req = store.delete(normalized);
      req.onsuccess = () => {
        this.notifyWatchers(normalized, 'delete');
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async ls(path: string): Promise<VFSEntry[]> {
    const normalized = normalizePath(path);
    const prefix = normalized === '/' ? '/' : normalized + '/';
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.getAll();
      req.onsuccess = () => {
        const allRecords = req.result as FileRecord[];
        const entries: VFSEntry[] = [];

        for (const record of allRecords) {
          if (record.path === normalized) continue;
          if (!record.path.startsWith(prefix)) continue;

          const relativePath = record.path.slice(prefix.length);
          if (relativePath.includes('/')) continue;

          entries.push({
            name: relativePath,
            path: record.path,
            type: record.type,
            size: record.size,
            modifiedAt: record.modifiedAt,
            createdAt: record.createdAt,
          });
        }

        entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        resolve(entries);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async stat(path: string): Promise<VFSStats> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.get(normalizePath(path));
      req.onsuccess = () => {
        const record = req.result as FileRecord | undefined;
        if (!record) {
          reject(new Error(`Path not found: ${path}`));
        } else {
          resolve({
            size: record.size,
            type: record.type,
            modifiedAt: record.modifiedAt,
            createdAt: record.createdAt,
          });
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  watch(path: string, callback: VFSCallback): () => void {
    const normalized = normalizePath(path);
    if (!this.watchers.has(normalized)) {
      this.watchers.set(normalized, new Set());
    }
    this.watchers.get(normalized)!.add(callback);
    return () => {
      this.watchers.get(normalized)?.delete(callback);
    };
  }

  async mkdir(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const now = Date.now();
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const record: FileRecord = {
        path: normalized,
        data: new ArrayBuffer(0),
        type: 'directory',
        size: 0,
        createdAt: now,
        modifiedAt: now,
      };
      const req = store.put(record);
      req.onsuccess = () => {
        this.notifyWatchers(normalized, 'create');
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.read(from);
    await this.write(to, data);
    await this.delete(from);
  }

  private async ensureParentDir(path: string, db: IDBDatabase): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    if (parts.length === 0) return;

    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      const normalized = currentPath;

      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_FILES, 'readwrite');
        const store = tx.objectStore(STORE_FILES);
        const getReq = store.get(normalized);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            const now = Date.now();
            store.put({
              path: normalized,
              data: new ArrayBuffer(0),
              type: 'directory' as const,
              size: 0,
              createdAt: now,
              modifiedAt: now,
            });
          }
          resolve();
        };
        getReq.onerror = () => resolve();
      });
    }
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

function normalizePath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return '/' + parts.join('/');
}
