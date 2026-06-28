import type { Capability } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import type { PersistenceStore } from '../persistence/store';

export interface PermissionManagerOptions {
  /** dev 模式：manifest 声明即自动授权（console.warn 提示）。生产模式默认拒绝。 */
  dev?: boolean;
  /** 持久化存储；提供则权限决策跨会话保留。 */
  store?: PersistenceStore;
  /** store 中存权限的 key。 */
  storageKey?: string;
}

/**
 * PermissionManager v2。
 * 关键变更：权限类型从 string 改为 Capability 联合类型；
 * dev 模式自动授权（避免阶段 1 阻塞开发），生产模式默认拒绝。
 */
export class PermissionManager {
  private granted = new Map<string, Set<Capability>>();
  private dev: boolean;
  private store?: PersistenceStore;
  private storageKey: string;

  constructor(opts: PermissionManagerOptions = {}) {
    this.dev = opts.dev ?? false;
    this.store = opts.store;
    this.storageKey = opts.storageKey ?? 'permissions';
  }

  async request(appId: string, capability: Capability): Promise<boolean> {
    if (this.isGranted(appId, capability)) return true;

    if (this.dev) {
      console.warn(`[Ditto Permission] dev mode: auto-grant "${capability}" to ${appId}`);
      this.grant(appId, capability);
      return true;
    }

    // 生产模式：阶段 1 默认拒绝（阶段 2 接入 dialog service 后改为交互式）
    console.warn(`[Ditto Permission] denied "${capability}" for ${appId} (interactive prompt in stage 2)`);
    return false;
  }

  grant(appId: string, capability: Capability): void {
    if (!this.granted.has(appId)) {
      this.granted.set(appId, new Set());
    }
    this.granted.get(appId)!.add(capability);
  }

  revoke(appId: string, capability: Capability): void {
    const set = this.granted.get(appId);
    if (set) {
      set.delete(capability);
      if (set.size === 0) this.granted.delete(appId);
    }
  }

  isGranted(appId: string, capability: Capability): boolean {
    return this.granted.get(appId)?.has(capability) ?? false;
  }

  loadFromStorage(data: Record<string, Capability[]>): void {
    this.granted.clear();
    for (const [appId, caps] of Object.entries(data)) {
      const set = new Set<Capability>(caps);
      this.granted.set(appId, set);
    }
  }

  persist(): Record<string, Capability[]> {
    const result: Record<string, Capability[]> = {};
    for (const [appId, caps] of this.granted) {
      result[appId] = [...caps];
    }
    return result;
  }

  /** 从 PersistenceStore 加载（kernel init 时调用）。 */
  loadFromStore(): void {
    if (!this.store) return;
    const data = this.store.get<Record<string, Capability[]>>(this.storageKey);
    if (data) this.loadFromStorage(data);
  }

  /** 保存到 PersistenceStore。 */
  saveToStore(): void {
    if (!this.store) return;
    this.store.set(this.storageKey, this.persist());
  }
}

// 全局单例已删除（破坏性变更），改用 DI。
// 保留 getPermissionManager 兼容签名但抛错提示迁移。
export function getPermissionManager(): PermissionManager {
  throw DittoError.fromUnknown(
    new Error('getPermissionManager removed: use kernel.resolve(\'permissions\') or DI'),
    'UNKNOWN'
  );
}
