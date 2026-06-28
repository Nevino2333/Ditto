import type { App, InjectionKey } from 'vue';
import { useDittoIPC } from './ipc-api';
import { useDittoWindow } from './window-api';
import { useDittoFS } from './fs-api';
import { useDittoNet } from './net-api';
import { useDittoAuth } from './auth-api';
import { useDittoUI } from './ui-api';
import { useDittoWidget } from './widget-api';
import { useDittoApp } from './app-api';
import { useDittoCell } from './cell-api';
import { useDittoTheme } from './theme-api';

export const DittoIPCKey: InjectionKey<ReturnType<typeof useDittoIPC>> = Symbol('ditto-ipc');
export const DittoWindowKey: InjectionKey<ReturnType<typeof useDittoWindow>> = Symbol('ditto-window');
export const DittoFSKey: InjectionKey<ReturnType<typeof useDittoFS>> = Symbol('ditto-fs');
export const DittoNetKey: InjectionKey<ReturnType<typeof useDittoNet>> = Symbol('ditto-net');
export const DittoAuthKey: InjectionKey<ReturnType<typeof useDittoAuth>> = Symbol('ditto-auth');
export const DittoUIKey: InjectionKey<ReturnType<typeof useDittoUI>> = Symbol('ditto-ui');
export const DittoWidgetKey: InjectionKey<ReturnType<typeof useDittoWidget>> = Symbol('ditto-widget');
export const DittoAppKey: InjectionKey<ReturnType<typeof useDittoApp>> = Symbol('ditto-app');
export const DittoCellKey: InjectionKey<ReturnType<typeof useDittoCell>> = Symbol('ditto-cell');
export const DittoThemeKey: InjectionKey<ReturnType<typeof useDittoTheme>> = Symbol('ditto-theme');

export const DittoSDK = {
  install(app: App) {
    const ipc = useDittoIPC();
    app.provide(DittoIPCKey, ipc);

    const windowApi = useDittoWindow();
    app.provide(DittoWindowKey, windowApi);

    const fs = useDittoFS();
    app.provide(DittoFSKey, fs);

    const net = useDittoNet();
    app.provide(DittoNetKey, net);

    const auth = useDittoAuth();
    app.provide(DittoAuthKey, auth);

    const ui = useDittoUI();
    app.provide(DittoUIKey, ui);

    const widget = useDittoWidget();
    app.provide(DittoWidgetKey, widget);

    const appApi = useDittoApp();
    app.provide(DittoAppKey, appApi);

    const cellApi = useDittoCell();
    app.provide(DittoCellKey, cellApi);

    const themeApi = useDittoTheme();
    app.provide(DittoThemeKey, themeApi);
  },
};

export { useDittoIPC } from './ipc-api';
export { useDittoWindow } from './window-api';
export { useDittoFS } from './fs-api';
export { useDittoNet } from './net-api';
export { useDittoAuth } from './auth-api';
export { useDittoUI } from './ui-api';
export { useDittoWidget } from './widget-api';
export { useDittoApp } from './app-api';
export { useDittoCell } from './cell-api';
export { useDittoTheme } from './theme-api';
export type { ThemeInfo, AnimationPreset } from './theme-api';
