// 引入 FontAwesome 6 全套 CSS（含 webfonts 字体资源，由 Vite 自动处理）
import '@fortawesome/fontawesome-free/css/all.min.css';

export {
  DWindow, DTaskbar, DDesktop, DStartMenu, DContextMenu, DNotification,
  DWidgetBoard, DDialog,
  DNotificationCenter, DControlCenter, DLockScreen, DTaskSwitcher, DGlobalSearch, DCalendarPanel,
  DIcon,
} from './components';
export { useDialog } from './composables/useDialog';
export type { DialogOptions, DialogResult } from './composables/useDialog';
