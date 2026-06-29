import { defineStore } from 'pinia';

/**
 * 全局快捷键绑定。
 * combo 格式：'alt+tab'、'ctrl+space'、'meta+e'、'shift+ctrl+p'
 * 修饰键顺序无关（内部 normalize），key 不区分大小写。
 */
export interface HotkeyBinding {
  id: string;
  combo: string;
  description?: string;
  handler: (e: KeyboardEvent) => void;
  /** true = 在输入框/textarea 中也触发，默认 false */
  global?: boolean;
  enabled: boolean;
}

export const useHotkeyStore = defineStore('ditto-hotkey', {
  state: () => ({
    bindings: [] as HotkeyBinding[],
    enabled: true,
  }),

  actions: {
    /** 注册快捷键，返回取消注册函数。 */
    register(binding: Omit<HotkeyBinding, 'enabled'>): () => void {
      const idx = this.bindings.findIndex((b) => b.id === binding.id);
      const entry: HotkeyBinding = { ...binding, enabled: true };
      if (idx !== -1) this.bindings[idx] = entry;
      else this.bindings.push(entry);
      return () => this.unregister(binding.id);
    },

    unregister(id: string) {
      this.bindings = this.bindings.filter((b) => b.id !== id);
    },

    setEnabled(id: string, enabled: boolean) {
      const b = this.bindings.find((b) => b.id === id);
      if (b) b.enabled = enabled;
    },

    setAllEnabled(enabled: boolean) {
      this.enabled = enabled;
    },

    /** 匹配键盘事件（后注册的优先）。 */
    match(e: KeyboardEvent): HotkeyBinding | null {
      if (!this.enabled) return null;
      const combo = eventToCombo(e);
      if (!combo) return null;
      for (let i = this.bindings.length - 1; i >= 0; i--) {
        const b = this.bindings[i];
        if (!b.enabled) continue;
        if (normalizeCombo(b.combo) !== combo) continue;
        if (!b.global && isTypingTarget(e.target)) continue;
        return b;
      }
      return null;
    },
  },

  getters: {
    list: (state) => state.bindings.map((b) => ({
      id: b.id,
      combo: b.combo,
      description: b.description,
      enabled: b.enabled,
    })),
  },
});

/** KeyboardEvent → 'alt+tab' 形式（已 normalize 排序）。 */
function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  const key = e.key.toLowerCase();
  // 忽略纯修饰键按下
  if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
    parts.push(key);
  }
  return parts.sort().join('+');
}

function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .trim()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join('+');
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}
