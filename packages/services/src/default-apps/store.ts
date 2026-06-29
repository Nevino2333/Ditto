import { defineStore } from 'pinia';

/**
 * 默认应用关联服务。
 *
 * 把"文件类型 / URL scheme / 扩展名"映射到应用 ID，类似桌面操作系统的
 * "默认打开方式"。第三方应用可通过 SDK 注册自己的处理器；用户偏好
 * （setUserOverride）优先于应用声明的默认值。
 *
 * 三类映射：
 *   - mimeTypes：text/markdown → com.ditto.editor
 *   - schemes：mailto → com.ditto.mail
 *   - extensions：.md → com.ditto.editor
 *
 * 优先级：用户覆盖 > 后注册的应用声明 > 系统默认
 */

export interface HandlerEntry {
  appId: string;
  /** 是否声明为系统默认（应用可声明多个候选，最后注册的成为默认） */
  isDefault: boolean;
  /** 注册时间戳（用于 stable sort） */
  registeredAt: number;
}

export interface DefaultAppHandler {
  appId: string;
  /** 是否来自用户覆盖 */
  userOverride: boolean;
}

const STORAGE_KEY = 'ditto:default-apps';

export const useDefaultAppsStore = defineStore('ditto-default-apps', {
  state: () => ({
    mimeHandlers: {} as Record<string, HandlerEntry[]>,
    schemeHandlers: {} as Record<string, HandlerEntry[]>,
    extensionHandlers: {} as Record<string, HandlerEntry[]>,
    /** 用户覆盖（优先级最高），key 形如 'mime:text/markdown' / 'scheme:mailto' / 'ext:.md' */
    userOverrides: {} as Record<string, string>,
    loaded: false,
  }),

  getters: {
    /** 列出所有 mimeType 与其当前处理器 */
    allMimeHandlers: (state): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const mime of Object.keys(state.mimeHandlers)) {
        const handler = resolveHandler(state.mimeHandlers[mime], state.userOverrides[`mime:${mime}`]);
        if (handler) result[mime] = handler;
      }
      return result;
    },
  },

  actions: {
    /** 注册 mimeType 处理器 */
    registerMimeHandler(mime: string, appId: string, isDefault = false) {
      const key = mime.toLowerCase();
      const list = this.mimeHandlers[key] || [];
      // 同一应用重复注册：更新 isDefault
      const idx = list.findIndex((h) => h.appId === appId);
      if (idx !== -1) {
        list[idx].isDefault = isDefault;
        list[idx].registeredAt = Date.now();
      } else {
        list.push({ appId, isDefault, registeredAt: Date.now() });
      }
      this.mimeHandlers[key] = list;
      this.persist();
    },

    /** 注册 URL scheme 处理器（如 mailto、tel、https） */
    registerSchemeHandler(scheme: string, appId: string, isDefault = false) {
      const key = scheme.toLowerCase();
      const list = this.schemeHandlers[key] || [];
      const idx = list.findIndex((h) => h.appId === appId);
      if (idx !== -1) {
        list[idx].isDefault = isDefault;
        list[idx].registeredAt = Date.now();
      } else {
        list.push({ appId, isDefault, registeredAt: Date.now() });
      }
      this.schemeHandlers[key] = list;
      this.persist();
    },

    /** 注册文件扩展名处理器（如 .md、.json） */
    registerExtensionHandler(ext: string, appId: string, isDefault = false) {
      const key = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      const list = this.extensionHandlers[key] || [];
      const idx = list.findIndex((h) => h.appId === appId);
      if (idx !== -1) {
        list[idx].isDefault = isDefault;
        list[idx].registeredAt = Date.now();
      } else {
        list.push({ appId, isDefault, registeredAt: Date.now() });
      }
      this.extensionHandlers[key] = list;
      this.persist();
    },

    /** 注销某应用的所有处理器 */
    unregisterApp(appId: string) {
      for (const mime of Object.keys(this.mimeHandlers)) {
        this.mimeHandlers[mime] = this.mimeHandlers[mime].filter((h) => h.appId !== appId);
        if (this.mimeHandlers[mime].length === 0) delete this.mimeHandlers[mime];
      }
      for (const scheme of Object.keys(this.schemeHandlers)) {
        this.schemeHandlers[scheme] = this.schemeHandlers[scheme].filter((h) => h.appId !== appId);
        if (this.schemeHandlers[scheme].length === 0) delete this.schemeHandlers[scheme];
      }
      for (const ext of Object.keys(this.extensionHandlers)) {
        this.extensionHandlers[ext] = this.extensionHandlers[ext].filter((h) => h.appId !== appId);
        if (this.extensionHandlers[ext].length === 0) delete this.extensionHandlers[ext];
      }
      // 清除该应用的用户覆盖
      for (const key of Object.keys(this.userOverrides)) {
        if (this.userOverrides[key] === appId) delete this.userOverrides[key];
      }
      this.persist();
    },

    /** 查询 mimeType 的处理器 */
    getHandlerForMime(mime: string): DefaultAppHandler | null {
      this.ensureLoaded();
      const list = this.mimeHandlers[mime.toLowerCase()];
      if (!list || list.length === 0) return null;
      const overrideKey = `mime:${mime.toLowerCase()}`;
      const override = this.userOverrides[overrideKey];
      const appId = resolveHandler(list, override);
      return appId ? { appId, userOverride: !!override } : null;
    },

    /** 查询 URL scheme 的处理器 */
    getHandlerForScheme(scheme: string): DefaultAppHandler | null {
      this.ensureLoaded();
      const key = scheme.toLowerCase();
      const list = this.schemeHandlers[key];
      if (!list || list.length === 0) return null;
      const override = this.userOverrides[`scheme:${key}`];
      const appId = resolveHandler(list, override);
      return appId ? { appId, userOverride: !!override } : null;
    },

    /** 查询文件扩展名的处理器 */
    getHandlerForExtension(ext: string): DefaultAppHandler | null {
      this.ensureLoaded();
      const key = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      const list = this.extensionHandlers[key];
      if (!list || list.length === 0) return null;
      const override = this.userOverrides[`ext:${key}`];
      const appId = resolveHandler(list, override);
      return appId ? { appId, userOverride: !!override } : null;
    },

    /** 列出某 mimeType 的所有候选应用（用于"打开方式"菜单） */
    listHandlersForMime(mime: string): string[] {
      this.ensureLoaded();
      const list = this.mimeHandlers[mime.toLowerCase()];
      if (!list) return [];
      // 用户覆盖优先，然后是 isDefault，最后是注册时间
      const overrideKey = `mime:${mime.toLowerCase()}`;
      const override = this.userOverrides[overrideKey];
      const sorted = [...list].sort((a, b) => {
        if (a.appId === override) return -1;
        if (b.appId === override) return 1;
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return b.registeredAt - a.registeredAt;
      });
      return sorted.map((h) => h.appId);
    },

    /** 用户设置覆盖（用户偏好优先于应用声明） */
    setUserOverride(kind: 'mime' | 'scheme' | 'ext', key: string, appId: string) {
      const normalized = key.toLowerCase();
      this.userOverrides[`${kind}:${normalized}`] = appId;
      this.persist();
    },

    /** 清除用户覆盖（恢复应用默认） */
    clearUserOverride(kind: 'mime' | 'scheme' | 'ext', key: string) {
      const normalized = key.toLowerCase();
      delete this.userOverrides[`${kind}:${normalized}`];
      this.persist();
    },

    /** 从 localStorage 加载 */
    ensureLoaded() {
      if (this.loaded) return;
      this.loaded = true;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.mimeHandlers) this.mimeHandlers = { ...this.mimeHandlers, ...data.mimeHandlers };
          if (data.schemeHandlers) this.schemeHandlers = { ...this.schemeHandlers, ...data.schemeHandlers };
          if (data.extensionHandlers) this.extensionHandlers = { ...this.extensionHandlers, ...data.extensionHandlers };
          if (data.userOverrides) this.userOverrides = { ...this.userOverrides, ...data.userOverrides };
        }
      } catch { /* 损坏的存储，忽略 */ }
    },

    /** 持久化到 localStorage */
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          mimeHandlers: this.mimeHandlers,
          schemeHandlers: this.schemeHandlers,
          extensionHandlers: this.extensionHandlers,
          userOverrides: this.userOverrides,
        }));
      } catch { /* 配额满或禁用，忽略 */ }
    },
  },
});

/** 解析处理器：用户覆盖 > isDefault > 最新注册 */
function resolveHandler(list: HandlerEntry[], userOverride: string | undefined): string | null {
  if (!list || list.length === 0) return null;
  if (userOverride && list.some((h) => h.appId === userOverride)) return userOverride;
  const defaults = list.filter((h) => h.isDefault);
  if (defaults.length > 0) {
    return defaults[defaults.length - 1].appId;
  }
  // 无 isDefault，返回最新注册的
  return list[list.length - 1].appId;
}
