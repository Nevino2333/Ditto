/**
 * 客户端 Cell 共享契约。
 * 与服务端 CellInstance/CellContext 区分：服务端类型在 types.ts，面向 cell module；
 * 本文件面向客户端 Cell 编排。
 */

/** 细粒度权限能力。联合类型支持编辑器自动补全，string 兜底允许自定义扩展。 */
export type Capability =
  | 'fs:read'
  | 'fs:write'
  | 'net:fetch'
  | 'net:websocket'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'notification:show'
  | 'window:multi'
  | 'window:fullscreen'
  | 'cell:backend'
  | 'cell:peer'
  | (string & {});

/** 客户端 Cell 状态机。与服务端 CellInstance.status 对齐但简化（无 hibernate 子态）。 */
export type ClientCellStatus =
  | 'loading'
  | 'active'
  | 'paused'
  | 'stopped'
  | 'error';

/** Cell 生命周期事件。 */
export type CellEvent =
  | 'cell:loading'
  | 'cell:active'
  | 'cell:paused'
  | 'cell:resumed'
  | 'cell:stopped'
  | 'cell:error';

/** Cell 运行时配置。原生/web/pwa/dit 四种。 */
export type CellRuntimeConfig =
  | { type: 'native'; componentLoader: () => Promise<unknown> }
  | { type: 'web'; url: string; origin: string; sandboxAttributes?: string }
  | { type: 'pwa'; manifestUrl: string; scope?: string; startUrl?: string }
  | { type: 'dit'; origin: string; backendCell?: boolean };

/** 沙盒模式。iframe-strict 用于第三方应用，shadow-trusted 仅 native，worker 留阶段 2。 */
export type SandboxMode = 'iframe-strict' | 'shadow-trusted' | 'worker';
