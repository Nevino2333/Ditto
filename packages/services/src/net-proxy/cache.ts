import type { ProxyConfig, ProxyCacheEntry } from './types';

const CACHE_DB_NAME = 'ditto-proxy-cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE = 'responses';

export class ProxyCache {
  private db: IDBDatabase | null = null;
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const store = db.createObjectStore(CACHE_STORE, { keyPath: 'url' });
          store.createIndex('expiresAt', 'expiresAt');
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get(url: string): Promise<ProxyCacheEntry | null> {
    if (!this.config.cacheEnabled) return null;
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        const req = store.get(url);
        req.onsuccess = () => {
          const entry = req.result as ProxyCacheEntry | undefined;
          if (!entry) return resolve(null);
          if (Date.now() > entry.expiresAt) {
            this.delete(url);
            return resolve(null);
          }
          resolve(entry);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async set(url: string, entry: Omit<ProxyCacheEntry, 'url' | 'cachedAt' | 'expiresAt'>): Promise<void> {
    if (!this.config.cacheEnabled) return;
    try {
      const db = await this.getDB();
      const now = Date.now();
      const fullEntry: ProxyCacheEntry = {
        ...entry,
        url,
        cachedAt: now,
        expiresAt: now + this.config.cacheMaxAge,
      };
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(fullEntry);
    } catch { /* ignore */ }
  }

  async delete(url: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(url);
    } catch { /* ignore */ }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
    } catch { /* ignore */ }
  }

  async getStats(): Promise<{ count: number; size: number }> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const req = tx.objectStore(CACHE_STORE).getAll();
        req.onsuccess = () => {
          const entries = req.result as ProxyCacheEntry[];
          let size = 0;
          for (const entry of entries) {
            size += entry.body.byteLength;
          }
          resolve({ count: entries.length, size });
        };
        req.onerror = () => resolve({ count: 0, size: 0 });
      });
    } catch {
      return { count: 0, size: 0 };
    }
  }

  updateConfig(config: ProxyConfig): void {
    this.config = config;
  }
}
