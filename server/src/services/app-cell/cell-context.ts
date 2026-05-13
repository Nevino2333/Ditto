import type { CellDatabase, CellStorage, CellIPC, CellLogger, CellMetrics } from '@ditto/shared';

export class CellContextImpl {
  readonly appId: string;
  readonly cellId: string;
  readonly config: Record<string, unknown>;
  readonly env: Record<string, string>;
  readonly db: CellDatabase;
  readonly storage: CellStorage;
  readonly ipc: CellIPC;
  readonly logger: CellLogger;
  readonly metrics: CellMetrics;
  private currentUserId?: string;

  constructor(options: {
    appId: string;
    cellId: string;
    config?: Record<string, unknown>;
    env?: Record<string, string>;
    db: CellDatabase;
    storage: CellStorage;
    ipc: CellIPC;
    logger: CellLogger;
    metrics: CellMetrics;
    userId?: string;
  }) {
    this.appId = options.appId;
    this.cellId = options.cellId;
    this.config = options.config ?? {};
    this.env = options.env ?? {};
    this.db = options.db;
    this.storage = options.storage;
    this.ipc = options.ipc;
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.currentUserId = options.userId;
  }

  setUserId(userId: string): void {
    this.currentUserId = userId;
  }

  getUserId(): string | undefined {
    return this.currentUserId;
  }
}

const memoryStores = new Map<string, InMemoryTable>();

class InMemoryTable {
  private rows = new Map<number, Record<string, unknown>>();
  private nextId = 1;
  private schema: string;

  constructor(schema: string) {
    this.schema = schema;
  }

  insert(row: Record<string, unknown>): number {
    const id = this.nextId++;
    this.rows.set(id, { id, ...row });
    return id;
  }

  select(where?: Record<string, unknown>): Record<string, unknown>[] {
    let result = [...this.rows.values()];
    if (where) {
      result = result.filter(row =>
        Object.entries(where).every(([key, value]) => row[key] === value)
      );
    }
    return result;
  }

  update(where: Record<string, unknown>, data: Record<string, unknown>): number {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (Object.entries(where).every(([key, value]) => row[key] === value)) {
        this.rows.set(id, { ...row, ...data });
        count++;
      }
    }
    return count;
  }

  delete(where: Record<string, unknown>): number {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (Object.entries(where).every(([key, value]) => row[key] === value)) {
        this.rows.delete(id);
        count++;
      }
    }
    return count;
  }

  count(where?: Record<string, unknown>): number {
    return this.select(where).length;
  }
}

function getTable(schema: string, table: string): InMemoryTable {
  const key = `${schema}:${table}`;
  if (!memoryStores.has(key)) {
    memoryStores.set(key, new InMemoryTable(schema));
  }
  return memoryStores.get(key)!;
}

export function createCellDatabase(appId: string, _dbConnection?: any): CellDatabase {
  const schema = `app_${appId.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;

  return {
    async query(sql: string, params?: unknown[]): Promise<unknown[]> {
      const normalizedSql = sql.replace(/__SCHEMA__/g, schema).trim();

      if (normalizedSql.toUpperCase().startsWith('INSERT')) {
        const match = normalizedSql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (match) {
          const [, , columnsStr, valuesStr] = match;
          const columns = columnsStr.split(',').map(c => c.trim());
          const valuePlaceholders = valuesStr.split(',').map(v => v.trim());
          const row: Record<string, unknown> = {};
          columns.forEach((col, i) => {
            const placeholder = valuePlaceholders[i];
            if (placeholder === '?' && params && i < params.length) {
              row[col] = params[i];
            } else {
              try { row[col] = JSON.parse(placeholder); } catch { row[col] = placeholder.replace(/'/g, ''); }
            }
          });
          const table = getTable(schema, columns[0].split('_')[0] || 'data');
          table.insert(row);
          return [{ insertId: table.count() }];
        }
      }

      if (normalizedSql.toUpperCase().startsWith('SELECT')) {
        const match = normalizedSql.match(/FROM\s+(\w+)/i);
        if (match) {
          const tableName = match[1];
          const table = getTable(schema, tableName);
          let results = table.select();
          if (params && params.length > 0) {
            const whereMatch = normalizedSql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
            if (whereMatch) {
              const whereCol = whereMatch[1];
              results = results.filter(r => r[whereCol] === params[0]);
            }
          }
          return results;
        }
        return [];
      }

      if (normalizedSql.toUpperCase().startsWith('UPDATE')) {
        const match = normalizedSql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(\w+)\s*=\s*\?/i);
        if (match && params) {
          const [, tableName, setClause, whereCol] = match;
          const table = getTable(schema, tableName);
          const setPairs = setClause.split(',').map(pair => {
            const [col, val] = pair.split('=').map(s => s.trim());
            return { col, val };
          });
          const data: Record<string, unknown> = {};
          setPairs.forEach((pair, i) => {
            if (pair.val === '?') {
              data[pair.col] = params[i];
            }
          });
          const whereValue = params[params.length - 1];
          table.update({ [whereCol]: whereValue }, data);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }

      if (normalizedSql.toUpperCase().startsWith('DELETE')) {
        const match = normalizedSql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
        if (match && params) {
          const [, tableName, whereCol] = match;
          const table = getTable(schema, tableName);
          table.delete({ [whereCol]: params[0] });
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }

      return [];
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

const storageBuckets = new Map<string, Map<string, Uint8Array>>();

export function createCellStorage(appId: string, _bucket?: any): CellStorage {
  const prefix = `${appId}/`;
  if (!storageBuckets.has(appId)) {
    storageBuckets.set(appId, new Map());
  }
  const bucket = storageBuckets.get(appId)!;

  return {
    async get(key: string): Promise<Uint8Array | null> {
      return bucket.get(`${prefix}${key}`) ?? null;
    },

    async put(key: string, data: Uint8Array): Promise<void> {
      bucket.set(`${prefix}${key}`, data);
    },

    async delete(key: string): Promise<void> {
      bucket.delete(`${prefix}${key}`);
    },

    async list(prefixQuery: string): Promise<string[]> {
      const fullPrefix = `${prefix}${prefixQuery}`;
      const results: string[] = [];
      for (const k of bucket.keys()) {
        if (k.startsWith(fullPrefix)) {
          results.push(k.slice(prefix.length));
        }
      }
      return results;
    },
  };
}

export function createUserIsolatedStorage(appId: string, userId: string): CellStorage {
  const prefix = `${appId}/users/${userId}/`;
  if (!storageBuckets.has(appId)) {
    storageBuckets.set(appId, new Map());
  }
  const bucket = storageBuckets.get(appId)!;

  return {
    async get(key: string): Promise<Uint8Array | null> {
      return bucket.get(`${prefix}${key}`) ?? null;
    },

    async put(key: string, data: Uint8Array): Promise<void> {
      bucket.set(`${prefix}${key}`, data);
    },

    async delete(key: string): Promise<void> {
      bucket.delete(`${prefix}${key}`);
    },

    async list(prefixQuery: string): Promise<string[]> {
      const fullPrefix = `${prefix}${prefixQuery}`;
      const results: string[] = [];
      for (const k of bucket.keys()) {
        if (k.startsWith(fullPrefix)) {
          results.push(k.slice(prefix.length));
        }
      }
      return results;
    },
  };
}

export function createCellLogger(appId: string): CellLogger {
  const prefix = `[Cell:${appId}]`;
  return {
    info(msg: string, meta?: Record<string, unknown>): void {
      console.log(`${prefix} INFO: ${msg}`, meta ?? '');
    },
    warn(msg: string, meta?: Record<string, unknown>): void {
      console.warn(`${prefix} WARN: ${msg}`, meta ?? '');
    },
    error(msg: string, meta?: Record<string, unknown>): void {
      console.error(`${prefix} ERROR: ${msg}`, meta ?? '');
    },
    debug(msg: string, meta?: Record<string, unknown>): void {
      console.debug(`${prefix} DEBUG: ${msg}`, meta ?? '');
    },
  };
}

const metricsStores = new Map<string, { counters: Map<string, number>; gauges: Map<string, number>; timings: Map<string, number[]> }>();

export function createCellMetrics(appId: string): CellMetrics {
  if (!metricsStores.has(appId)) {
    metricsStores.set(appId, { counters: new Map(), gauges: new Map(), timings: new Map() });
  }
  const store = metricsStores.get(appId)!;

  return {
    increment(name: string, value = 1): void {
      const key = name;
      store.counters.set(key, (store.counters.get(key) ?? 0) + value);
    },
    gauge(name: string, value: number): void {
      store.gauges.set(name, value);
    },
    timing(name: string, durationMs: number): void {
      const list = store.timings.get(name) ?? [];
      if (list.length > 100) list.shift();
      list.push(durationMs);
      store.timings.set(name, list);
    },
  };
}

export function getCellMetrics(appId: string): { counters: Record<string, number>; gauges: Record<string, number>; timings: Record<string, { avg: number; min: number; max: number; count: number }> } | null {
  const store = metricsStores.get(appId);
  if (!store) return null;

  const counters: Record<string, number> = {};
  for (const [k, v] of store.counters) counters[k] = v;

  const gauges: Record<string, number> = {};
  for (const [k, v] of store.gauges) gauges[k] = v;

  const timings: Record<string, { avg: number; min: number; max: number; count: number }> = {};
  for (const [k, v] of store.timings) {
    if (v.length === 0) continue;
    timings[k] = {
      avg: v.reduce((a, b) => a + b, 0) / v.length,
      min: Math.min(...v),
      max: Math.max(...v),
      count: v.length,
    };
  }

  return { counters, gauges, timings };
}

export function clearCellStorage(appId: string): void {
  storageBuckets.delete(appId);
  memoryStores.forEach((_, key) => {
    if (key.startsWith(`app_${appId.replace(/\./g, '_')}`)) {
      memoryStores.delete(key);
    }
  });
  metricsStores.delete(appId);
}
