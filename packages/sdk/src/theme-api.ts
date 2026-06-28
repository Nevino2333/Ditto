import { ref, onMounted, onUnmounted } from 'vue';
import { useDittoIPC } from './ipc-api';

/** 主题信息（通过 IPC 从宿主获取） */
export interface ThemeInfo {
  id: string;
  name: string;
  colorScheme: 'light' | 'dark';
}

export type AnimationPreset = 'none' | 'subtle' | 'normal' | 'expressive';

/**
 * 第三方应用主题 API。
 *
 * 由于第三方应用运行在 iframe 沙盒中，无法直接访问宿主的 ThemeEngine，
 * 本 composable 通过 IPC 与宿主通信，提供主题查询、订阅、切换、覆盖能力。
 *
 * 使用方式：
 * ```ts
 * const theme = useDittoTheme();
 * const current = await theme.getCurrentTheme();
 * const stop = theme.subscribe((t) => console.log('主题变更:', t));
 * theme.setTokenOverride('color.primary.500', '#ff0000');
 * ```
 */
export function useDittoTheme() {
  const { send, request, onMessage } = useDittoIPC();
  const current = ref<ThemeInfo | null>(null);

  /** 获取当前主题信息 */
  async function getCurrentTheme(): Promise<ThemeInfo> {
    return request<ThemeInfo>('theme:getCurrent');
  }

  /** 获取所有可用主题 */
  async function getAvailableThemes(): Promise<ThemeInfo[]> {
    return request<ThemeInfo[]>('theme:list');
  }

  /** 切换到指定主题 */
  function setTheme(themeId: string): void {
    send('theme:setTheme', { themeId });
  }

  /** 切换浅色/深色 */
  function toggleScheme(): void {
    send('theme:toggleScheme', {});
  }

  /**
   * 覆盖单个 token（运行时写入 CSS 变量）。
   * @param path token 路径，例如 'color.primary.500'
   * @param value 值，例如 '#ff0000'
   */
  function setTokenOverride(path: string, value: string): void {
    send('theme:setOverride', { path, value });
  }

  /** 设置组件级 token 覆盖 */
  function setComponentOverride(componentName: string, tokens: Record<string, unknown>): void {
    send('theme:setComponentOverride', { componentName, tokens });
  }

  /** 移除组件级覆盖 */
  function removeComponentOverride(componentName: string): void {
    send('theme:removeComponentOverride', { componentName });
  }

  /** 设置动画预设（性能档位） */
  function setAnimationPreset(preset: AnimationPreset): void {
    send('theme:setAnimationPreset', { preset });
  }

  /** 获取 token 值 */
  async function getTokenValue(path: string): Promise<string | undefined> {
    const res = await request<{ value?: string }>('theme:getToken', { path });
    return res.value;
  }

  /** 订阅主题变更事件 */
  function subscribe(handler: (theme: ThemeInfo) => void): () => void {
    return onMessage('theme:changed', (_channel, payload) => {
      const info = payload as ThemeInfo;
      current.value = info;
      handler(info);
    });
  }

  // 自动拉取一次当前主题
  let stopAutoFetch: (() => void) | null = null;
  onMounted(() => {
    getCurrentTheme()
      .then((info) => { current.value = info; })
      .catch(() => { /* 宿主可能未实现，忽略 */ });
    stopAutoFetch = subscribe(() => {});
  });

  onUnmounted(() => {
    if (stopAutoFetch) stopAutoFetch();
  });

  return {
    current,
    getCurrentTheme,
    getAvailableThemes,
    setTheme,
    toggleScheme,
    setTokenOverride,
    setComponentOverride,
    removeComponentOverride,
    setAnimationPreset,
    getTokenValue,
    subscribe,
  };
}
