import type { DittoKernel } from '@ditto/core';
import { useDialogStore } from './dialog';
import { useNotificationStore } from './notification-center';
import { useWindowStore } from './window-manager';
import { useWidgetStore } from './widget';
import { useIslandStore } from './island';
import { useSearchStore } from './search';
import { getVFS } from './vfs';
import { getNetProxy } from './net-proxy';

/**
 * 将 services 包的 8 个 UI 服务注册到 kernel 的 ServiceRegistry。
 * 必须在 kernel.init() 之后调用（此时 ServiceRegistry 已就绪）。
 * 服务懒创建：首次 resolve 才实例化。
 *
 * ServiceId 对照 spec §9.2：
 *   dialog / notification / window / widget / island / search / vfs / net-proxy
 */
export function registerKernelServices(kernel: DittoKernel): void {
  const registry = kernel.services;

  // Pinia stores：工厂返回 store 实例（需 Pinia 已 active）
  registry.register('dialog', () => useDialogStore());
  registry.register('notification', () => useNotificationStore());
  registry.register('window', () => useWindowStore());
  registry.register('widget', () => useWidgetStore());
  registry.register('island', () => useIslandStore());
  registry.register('search', () => useSearchStore());

  // 类单例
  registry.register('vfs', () => getVFS());
  registry.register('net-proxy', () => getNetProxy());
}
