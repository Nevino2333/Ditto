import { onMounted, onUnmounted } from 'vue';
import { useHotkeyStore } from './store';

/**
 * 全局快捷键 composable。
 * 在 Shell 根组件 setup 中调用一次即可激活全局监听。
 * - 监听 keydown（capture 阶段，先于应用 iframe）
 * - 匹配命中时 preventDefault + stopPropagation，阻止 iframe 收到
 * - 返回 store 供注册/查询使用
 */
export function useGlobalHotkey() {
  const store = useHotkeyStore();

  function onKeyDown(e: KeyboardEvent) {
    const binding = store.match(e);
    if (binding) {
      e.preventDefault();
      e.stopPropagation();
      try {
        binding.handler(e);
      } catch (err) {
        console.error(`[Ditto Hotkey] handler "${binding.id}" error:`, err);
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true);
  });

  return store;
}
