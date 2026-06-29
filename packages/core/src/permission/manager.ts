import type { Capability } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import type { PersistenceStore } from '../persistence/store';

/**
 * 交互式授权回调。
 * shell 在初始化时注入此回调，将权限请求路由到 Dialog store。
 * 回调返回 true 表示用户授权，false 表示拒绝。
 * 若未注入，生产模式默认拒绝。
 */
export type InteractivePrompt = (appId: string, capability: Capability) => Promise<boolean>;

export interface PermissionManagerOptions {
  /** dev 模式：manifest 声明即自动授权（console.warn 提示）。生产模式默认拒绝。 */
  dev?: boolean;
  /** 持久化存储；提供则权限决策跨会话保留。 */
  store?: PersistenceStore;
  /** store 中存权限的 key。 */
  storageKey?: string;
  /** 交互式授权回调（生产模式）。shell 注入以接入 Dialog store。 */
  interactivePrompt?: InteractivePrompt;
}

/**
 * PermissionManager v2。
 * 关键变更：权限类型从 string 改为 Capability 联合类型；
 * dev 模式自动授权（避免阻塞开发），生产模式通过 interactivePrompt 交互式授权。
 */
export class PermissionManager {
  private granted = new Map<string, Set<Capability>>();
  private dev: boolean;
  private store?: PersistenceStore;
  private storageKey: string;
  private interactivePrompt?: InteractivePrompt;

  constructor(opts: PermissionManagerOptions = {}) {
    this.dev = opts.dev ?? false;
    this.store = opts.store;
    this.storageKey = opts.storageKey ?? 'permissions';
    this.interactivePrompt = opts.interactivePrompt;
  }

  /** 注入交互式授权回调（shell 启动后调用）。 */
  setInteractivePrompt(prompt: InteractivePrompt): void {
    this.interactivePrompt = prompt;
  }

  async request(appId: string, capability: Capability): Promise<boolean> {
    if (this.isGranted(appId, capability)) return true;

    if (this.dev) {
      console.warn(`[Ditto Permission] dev mode: auto-grant "${capability}" to ${appId}`);
      this.grant(appId, capability);
      this.saveToStore();
      return true;
    }

    // 生产模式：交互式授权
    if (this.interactivePrompt) {
      try {
        const granted = await this.interactivePrompt(appId, capability);
        if (granted) {
          this.grant(appId, capability);
          this.saveToStore();
          return true;
        }
      } catch (e) {
        console.error(`[Ditto Permission] interactive prompt error for "${capability}":`, e);
      }
      console.warn(`[Ditto Permission] denied "${capability}" for ${appId} (user denied or prompt failed)`);
      return false;
    }

    // 无交互式回调时默认拒绝
    console.warn(`[Ditto Permission] denied "${capability}" for ${appId} (no interactive prompt configured)`);
    return false;
  }

  grant(appId: string, capability: Capability): void {
    if (!this.granted.has(appId)) {
      this.granted.set(appId, new Set());
    }
    this.granted.get(appId)!.add(capability);
    this.saveToStore();
  }

  revoke(appId: string, capability: Capability): void {
    const set = this.granted.get(appId);
    if (set) {
      set.delete(capability);
      if (set.size === 0) this.granted.delete(appId);
      this.saveToStore();
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
