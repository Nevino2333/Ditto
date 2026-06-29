import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ClipboardEntry {
  id: string;
  content: string;
  mimeType: string;
  timestamp: number;
  source?: string;
}

const MAX_HISTORY = 50;

/**
 * Clipboard 服务。
 *
 * 功能：
 * - 读写系统剪贴板（navigator.clipboard API）
 * - 剪贴板历史记录（最近 MAX_HISTORY 条）
 * - 跨应用共享（Pinia store）
 *
 * 权限：需要 clipboard.read / clipboard.write 能力（由 PermissionManager 授权）。
 * 隐私：历史记录仅保存在内存中，重启清空（不持久化到磁盘）。
 */
export const useClipboardStore = defineStore('ditto-clipboard', () => {
  const history = ref<ClipboardEntry[]>([]);
  const lastReadText = ref<string>('');

  /**
   * 写入文本到剪贴板。
   * 同时记录到历史。
   */
  async function writeText(text: string, source?: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        console.warn('[Ditto Clipboard] writeText failed, falling back to execCommand:', e);
        // 回退：使用已废弃的 execCommand（兼容旧浏览器）
        fallbackWriteText(text);
      }
    } else {
      fallbackWriteText(text);
    }
    addToHistory(text, 'text/plain', source);
  }

  /**
   * 读取剪贴板文本。
   * 注意：受浏览器安全策略限制，需在用户手势上下文中调用。
   */
  async function readText(): Promise<string> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        const text = await navigator.clipboard.readText();
        lastReadText.value = text;
        return text;
      } catch (e) {
        console.warn('[Ditto Clipboard] readText failed:', e);
        return lastReadText.value;
      }
    }
    return lastReadText.value;
  }

  /**
   * 写入富文本数据（支持多种 MIME 类型）。
   */
  async function write(items: ClipboardItem[]): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write(items);
      } catch (e) {
        console.warn('[Ditto Clipboard] write failed:', e);
      }
    }
    // 历史记录只存文本表示
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('text/')) {
          try {
            const blob = await item.getType(type);
            const text = await blob.text();
            addToHistory(text, type);
          } catch {}
        }
      }
    }
  }

  /**
   * 读取剪贴板所有 MIME 类型。
   */
  async function read(): Promise<ClipboardItem[]> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        return await navigator.clipboard.read();
      } catch (e) {
        console.warn('[Ditto Clipboard] read failed:', e);
        return [];
      }
    }
    return [];
  }

  function addToHistory(content: string, mimeType: string, source?: string): void {
    const entry: ClipboardEntry = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content,
      mimeType,
      timestamp: Date.now(),
      source,
    };
    history.value.unshift(entry);
    if (history.value.length > MAX_HISTORY) {
      history.value = history.value.slice(0, MAX_HISTORY);
    }
  }

  /** 清空历史。 */
  function clearHistory(): void {
    history.value = [];
  }

  /** 删除指定历史条目。 */
  function removeEntry(id: string): void {
    history.value = history.value.filter((e) => e.id !== id);
  }

  /** 从历史中恢复（重新写入剪贴板）。 */
  async function restoreFromHistory(id: string): Promise<void> {
    const entry = history.value.find((e) => e.id === id);
    if (entry) {
      await writeText(entry.content);
    }
  }

  return {
    history,
    lastReadText,
    writeText,
    readText,
    write,
    read,
    clearHistory,
    removeEntry,
    restoreFromHistory,
  };
});

/** 旧浏览器回退：用 execCommand 写入剪贴板。 */
function fallbackWriteText(text: string): void {
  if (typeof document === 'undefined') return;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    console.warn('[Ditto Clipboard] execCommand fallback failed:', e);
  }
  document.body.removeChild(textarea);
}
