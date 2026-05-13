import { DittoError } from '@ditto/shared';

type StorageBackend = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
  clear(): void;
};

function createLocalStorageBackend(): StorageBackend | null {
  try {
    const testKey = '__ditto_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
      removeItem: (k) => localStorage.removeItem(k),
      keys: () => {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) result.push(key);
        }
        return result;
      },
      clear: () => localStorage.clear(),
    };
  } catch {
    return null;
  }
}

function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
    clear: () => { map.clear(); },
  };
}

export interface MigrationStep {
  version: number;
  migrate(store: PersistenceStore): void | Promise<void>;
}

export class PersistenceStore {
  private backend: StorageBackend;
  private prefix: string;
  private version: number;
  private migrations: MigrationStep[];
  private listeners = new Set<(key: string, value: unknown) => void>();

  constructor(prefix = 'ditto:', options?: { migrations?: MigrationStep[] }) {
    this.prefix = prefix;
    this.migrations = options?.migrations ?? [];
    this.backend = createLocalStorageBackend() ?? createMemoryBackend();
    this.version = this.getVersion();
    this.runMigrations();
  }

  get<T = unknown>(key: string, defaultValue?: T): T | null {
    try {
      const raw = this.backend.getItem(this.prefixKey(key));
      if (raw === null) return defaultValue !== undefined ? defaultValue : null;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue !== undefined ? defaultValue : null;
    }
  }

  set<T = unknown>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      this.backend.setItem(this.prefixKey(key), serialized);
      this.notifyListeners(key, value);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw DittoError.storageUnavailable();
      }
      throw DittoError.fromUnknown(e, 'STORAGE_QUOTA_EXCEEDED');
    }
  }

  remove(key: string): void {
    try {
      this.backend.removeItem(this.prefixKey(key));
      this.notifyListeners(key, undefined);
    } catch (e) {
      console.error(`[Ditto PersistenceStore] Error removing key "${key}":`, e);
    }
  }

  has(key: string): boolean {
    try {
      return this.backend.getItem(this.prefixKey(key)) !== null;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      const keys = this.backend.keys().filter((k) => k.startsWith(this.prefix));
      for (const key of keys) {
        this.backend.removeItem(key);
      }
    } catch (e) {
      console.error('[Ditto PersistenceStore] Error clearing:', e);
    }
  }

  getMultiple<T = unknown>(keys: string[]): Record<string, T | null> {
    const result: Record<string, T | null> = {};
    for (const key of keys) {
      result[key] = this.get<T>(key);
    }
    return result;
  }

  setMultiple<T = unknown>(entries: Record<string, T>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value);
    }
  }

  onChange(listener: (key: string, value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion(): number {
    return this.get<number>('__version__', 0) ?? 0;
  }

  private async runMigrations(): Promise<void> {
    const currentVersion = this.version;
    const pending = this.migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of pending) {
      try {
        await migration.migrate(this);
        this.set('__version__', migration.version);
        this.version = migration.version;
      } catch (e) {
        console.error(`[Ditto PersistenceStore] Migration v${migration.version} failed:`, e);
        break;
      }
    }
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private notifyListeners(key: string, value: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(key, value);
      } catch (e) {
        console.error('[Ditto PersistenceStore] Listener error:', e);
      }
    }
  }
}
