# Ditto API 参考

> Ditto WebOS 核心 API 参考，涵盖 Kernel、ServiceRegistry、AppCellManager、ClientCell、CellBridge、PermissionManager 与 IPCBus。

## 目录

- [Kernel API](#kernel-api)
  - [createKernel](#createkernel)
  - [DittoKernel 类](#dittokernel-类)
  - [KernelState](#kernelstate)
- [ServiceRegistry API](#serviceregistry-api)
- [AppCellManager API](#appcellmanager-api)
- [ClientCell API](#clientcell-api)
- [CellBridge API](#cellbridge-api)
- [PermissionManager API](#permissionmanager-api)
- [IPCBus API](#ipcbus-api)
- [EventEmitter API](#eventemitter-api)

## Kernel API

源码：`packages/core/src/kernel.ts`

### createKernel

创建 DittoKernel 实例（工厂函数，替代旧的全局单例 `getKernel()`）。

```typescript
function createKernel(config?: DeepPartial<DittoConfig>): DittoKernel;
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `DeepPartial<DittoConfig>` | 配置对象（部分配置，深度合并到默认值） |

**返回**：`DittoKernel` 实例

**示例**：

```typescript
import { createKernel } from '@ditto/core';

const kernel = createKernel({
  kernel: {
    id: 'my-kernel',
    dev: true,           // dev 模式，权限自动授权
    strictMode: false,
  },
  window: {
    defaultWidth: 1024,
    defaultHeight: 768,
  },
  theme: {
    defaultScheme: 'dark',
    followSystem: false,
  },
});

await kernel.init();
```

### DittoKernel 类

```typescript
class DittoKernel {
  readonly config: DittoConfig;
  readonly services: ServiceRegistry;
  readonly lifecycle: LifecycleOrchestrator;
  readonly events: EventEmitter;
  readonly store: PersistenceStore;
  readonly ipc: IPCBus;
  readonly permissions: PermissionManager;
  readonly cellManager: AppCellManager;

  constructor(config?: DeepPartial<DittoConfig>);
  setContainer(element: HTMLElement): void;
  async init(): Promise<void>;
  async destroy(): Promise<void>;
  isInitialized(): boolean;
  get state(): KernelState;
}
```

**成员说明**：

| 成员 | 类型 | 说明 |
|------|------|------|
| `config` | `DittoConfig` | 合并后的完整配置 |
| `services` | `ServiceRegistry` | 服务注册表 |
| `lifecycle` | `LifecycleOrchestrator` | 生命周期编排器 |
| `events` | `EventEmitter` | 全局事件发射器 |
| `store` | `PersistenceStore` | 持久化存储 |
| `ipc` | `IPCBus` | IPC 总线 v2 |
| `permissions` | `PermissionManager` | 权限管理器 |
| `cellManager` | `AppCellManager` | Cell 管理器（init 后可用） |

**方法说明**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `setContainer` | `(element: HTMLElement) => void` | 设置 Cell 容器元素（init 前调用） |
| `init` | `() => Promise<void>` | 初始化内核，触发各 stage |
| `destroy` | `() => Promise<void>` | 销毁内核，逆序清理资源 |
| `isInitialized` | `() => boolean` | 是否已初始化 |
| `state` | `KernelState`（getter） | 当前内核状态 |

**完整使用示例**：

```typescript
import { createKernel } from '@ditto/core';
import { registerKernelServices } from '@ditto/services';

const kernel = createKernel({ kernel: { id: 'app', dev: true } });

// 设置容器（可选，默认 document.body）
kernel.setContainer(document.getElementById('app-container'));

// 监听内核事件
kernel.events.on('kernel:initializing', () => console.log('启动中...'));
kernel.events.on('kernel:ready', () => console.log('就绪'));
kernel.events.on('kernel:error', (err) => console.error('错误:', err));

// 初始化
await kernel.init();

// 注册 UI 服务
registerKernelServices(kernel);

// 启动应用
const manifest = { /* AppManifest */ };
const cell = await kernel.cellManager.startCell('com.ditto.app', manifest, {
  type: 'dit',
  origin: 'http://localhost:3001',
  backendCell: true,
});

// 销毁
await kernel.destroy();
```

### KernelState

```typescript
type KernelState = 'created' | 'initializing' | 'ready' | 'destroying' | 'destroyed';
```

**状态转换**：

```
created → initializing → ready
                  ↓
              destroying → destroyed
```

| 状态 | 说明 |
|------|------|
| `created` | 已创建，未初始化 |
| `initializing` | 正在初始化（执行各 stage） |
| `ready` | 初始化完成，可用 |
| `destroying` | 正在销毁 |
| `destroyed` | 已销毁（终态） |

## ServiceRegistry API

源码：`packages/core/src/service-registry.ts`

```typescript
class ServiceRegistry {
  register<T>(id: ServiceId, factory: ServiceFactory<T>): void;
  resolve<T>(id: ServiceId): T;
  async resolveAsync<T>(id: ServiceId): Promise<T>;
  has(id: ServiceId): boolean;
  list(): ServiceId[];
  async shutdown(): Promise<void>;
}
```

### register

注册服务工厂（懒创建）。

```typescript
register<T>(id: ServiceId, factory: ServiceFactory<T>): void;
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 服务唯一 ID |
| `factory` | `(ctx: ServiceResolveContext) => T \| Promise<T>` | 工厂函数 |

`ServiceResolveContext`：

```typescript
interface ServiceResolveContext {
  resolve<T>(id: ServiceId): T;   // 同步解析依赖
  has(id: ServiceId): boolean;    // 检查依赖是否存在
}
```

**示例**：

```typescript
kernel.services.register('my-service', (ctx) => {
  const ipc = ctx.resolve('ipc');
  return new MyService(ipc);
});
```

**异常**：`DittoError.serviceAlreadyRegistered`（id 已存在）

### resolve

同步解析服务（首次调用时实例化）。

```typescript
resolve<T>(id: ServiceId): T;
```

**异常**：`DittoError.serviceNotRegistered`（id 不存在）

### resolveAsync

异步解析服务（工厂返回 Promise 时使用）。

```typescript
async resolveAsync<T>(id: ServiceId): Promise<T>;
```

### has

检查服务是否已注册。

```typescript
has(id: ServiceId): boolean;
```

### list

列出所有已注册的服务 ID（按注册顺序）。

```typescript
list(): ServiceId[];
```

### shutdown

逆序销毁所有已实例化的服务。

```typescript
async shutdown(): Promise<void>;
```

- 按注册**逆序**调用每个实例的 `destroy()` 方法
- 单个 destroy 异常不中断（收集错误后统一 warn）

## AppCellManager API

源码：`packages/core/src/app-cell/manager.ts`

```typescript
class AppCellManager {
  constructor(ipc: IPCBus, permissions: PermissionManager, container: HTMLElement);

  async startCell(appId: string, manifest: AppManifest, config: CellRuntimeConfig): Promise<ClientCell>;
  async stopCell(appId: string): Promise<void>;
  async pauseCell(appId: string): Promise<void>;
  async resumeCell(appId: string): Promise<void>;

  getCell(appId: string): ClientCell | undefined;
  getAllCells(): ClientCell[];
  getActiveCells(): ClientCell[];

  onCellEvent(event: CellEvent, handler: CellEventHandler): () => void;
  async destroy(): Promise<void>;
}
```

### startCell

启动一个 Cell（应用实例）。

```typescript
async startCell(appId: string, manifest: AppManifest, config: CellRuntimeConfig): Promise<ClientCell>;
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `appId` | `string` | 应用唯一 ID |
| `manifest` | `AppManifest` | 应用清单 |
| `config` | `CellRuntimeConfig` | 运行时配置（4 种类型） |

**CellRuntimeConfig 类型**：

```typescript
type CellRuntimeConfig =
  | { type: 'native'; componentLoader: () => Promise<unknown> }
  | { type: 'web'; url: string; origin: string; sandboxAttributes?: string }
  | { type: 'pwa'; manifestUrl: string; scope?: string; startUrl?: string }
  | { type: 'dit'; origin: string; backendCell?: boolean };
```

**异常**：`DittoError.cellAlreadyRunning`（appId 已 active）

**示例**：

```typescript
// dit 类型（前后端 Cell）
const cell = await kernel.cellManager.startCell(
  'com.ditto.notes',
  manifest,
  { type: 'dit', origin: 'http://localhost:3001', backendCell: true }
);

// web 类型（远程 URL）
const webCell = await kernel.cellManager.startCell(
  'com.external.app',
  webManifest,
  { type: 'web', url: 'https://external-app.com', origin: 'https://external-app.com' }
);

// native 类型（Vue 组件）
const nativeCell = await kernel.cellManager.startCell(
  'com.ditto.settings',
  nativeManifest,
  { type: 'native', componentLoader: () => import('./Settings.vue') }
);
```

### stopCell

停止并卸载 Cell。

```typescript
async stopCell(appId: string): Promise<void>;
```

- 调用 `cell.unload()`（dit 类型会通知服务端 stop）
- 移除 Cell 实例与 CellBridge
- 触发 `cell:stopped` 事件

### pauseCell

暂停 Cell（隐藏 DOM，dit 类型通知服务端 hibernate）。

```typescript
async pauseCell(appId: string): Promise<void>;
```

### resumeCell

恢复暂停的 Cell（dit 类型通知服务端 wake）。

```typescript
async resumeCell(appId: string): Promise<void>;
```

### 查询方法

```typescript
getCell(appId: string): ClientCell | undefined;     // 获取单个
getAllCells(): ClientCell[];                         // 获取全部
getActiveCells(): ClientCell[];                      // 获取 active 状态的
```

### onCellEvent

订阅 Cell 事件。

```typescript
onCellEvent(event: CellEvent, handler: CellEventHandler): () => void;
```

**CellEvent 类型**：

```typescript
type CellEvent =
  | 'cell:loading'
  | 'cell:active'
  | 'cell:paused'
  | 'cell:resumed'
  | 'cell:stopped'
  | 'cell:error';
```

**示例**：

```typescript
const unsubscribe = kernel.cellManager.onCellEvent('cell:active', (payload) => {
  const { appId, cell } = payload as { appId: string; cell: ClientCell };
  console.log(`Cell ${appId} activated`);
});

// 取消订阅
unsubscribe();
```

### destroy

销毁所有 Cell 并清理。

```typescript
async destroy(): Promise<void>;
```

## ClientCell API

源码：`packages/core/src/app-cell/cell.ts`

```typescript
class ClientCell {
  constructor(manifest: AppManifest, config: CellRuntimeConfig, deps: ClientCellDeps);

  readonly manifest: AppManifest;
  get appId(): string;
  get status(): ClientCellStatus;
  get error(): Error | undefined;
  get sandbox(): CellSandbox | null;

  async activate(): Promise<void>;
  async pause(): Promise<void>;
  async resume(): Promise<void>;
  async unload(): Promise<void>;

  onActive(handler: () => void): () => void;
  onPaused(handler: () => void): () => void;
  onResumed(handler: () => void): () => void;
  onStopped(handler: () => void): () => void;
  onError(handler: (err: Error) => void): () => void;
}
```

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `manifest` | `AppManifest` | 应用清单 |
| `appId` | `string`（getter） | 应用 ID（取自 manifest.id） |
| `status` | `ClientCellStatus`（getter） | 当前状态 |
| `error` | `Error \| undefined`（getter） | 错误信息 |
| `sandbox` | `CellSandbox \| null`（getter） | 沙盒实例 |

### 生命周期方法

#### activate

激活 Cell（权限请求 → 沙盒创建 → 挂载 → 状态转换）。

```typescript
async activate(): Promise<void>;
```

- 遍历 manifest.permissions，调用 `deps.requestPermission`
- 创建沙盒（native → shadow-trusted，其他 → iframe-strict）
- 挂载到容器
- dit 类型通知服务端 start
- 状态：`loading` → `active`（失败转 `error`）

#### pause

暂停 Cell。

```typescript
async pause(): Promise<void>;
```

- dit 类型通知服务端 hibernate
- 隐藏沙盒 DOM（保留 state）
- 状态：`active` → `paused`

#### resume

恢复暂停的 Cell。

```typescript
async resume(): Promise<void>;
```

- dit 类型通知服务端 wake
- 恢复沙盒显示
- 状态：`paused` → `active`

#### unload

卸载并停止 Cell。

```typescript
async unload(): Promise<void>;
```

- dit 类型通知服务端 stop
- 销毁沙盒
- 状态：任意 → `stopped`

### 事件订阅

每个方法返回 unsubscribe 函数。

```typescript
const off1 = cell.onActive(() => console.log('激活'));
const off2 = cell.onError((err) => console.error('错误:', err));
const off3 = cell.onStopped(() => console.log('已停止'));

// 清理
off1(); off2(); off3();
```

### ClientCellStatus

```typescript
type ClientCellStatus = 'loading' | 'active' | 'paused' | 'stopped' | 'error';
```

## CellBridge API

源码：`packages/core/src/app-cell/bridge.ts`

```typescript
class CellBridge {
  async connect(wsUrl: string, userId: string): Promise<void>;
  sendToServer(message: IPCMessage): void;
  onMessage(handler: MessageHandler): () => void;

  async notifyStart(appId: string): Promise<void>;
  async notifyStop(appId: string): Promise<void>;
  async notifyHibernate(appId: string): Promise<void>;
  async notifyWake(appId: string): Promise<void>;

  disconnect(): void;
}
```

### connect

建立 WebSocket 连接。

```typescript
async connect(wsUrl: string, userId: string): Promise<void>;
```

- 自动推导 server origin（用于 HTTP 调用）
- 连接 `wsUrl?userId=xxx`
- 失败时 reject

### WebSocket 通信

```typescript
sendToServer(message: IPCMessage): void;
onMessage(handler: (message: IPCMessage) => void): () => void;
```

`sendToServer` 在 WS 未 open 时 drop 消息并 warn。

### 生命周期通知（HTTP）

```typescript
async notifyStart(appId: string): Promise<void>;      // POST /api/cell/{appId}/start
async notifyStop(appId: string): Promise<void>;         // POST /api/cell/{appId}/stop
async notifyHibernate(appId: string): Promise<void>;   // POST /api/cell/{appId}/hibernate
async notifyWake(appId: string): Promise<void>;        // POST /api/cell/{appId}/wake
```

所有通知失败时 console.warn，不抛错（fire-and-forget 语义）。

### disconnect

关闭 WebSocket 并清理 handler。

```typescript
disconnect(): void;
```

## PermissionManager API

源码：`packages/core/src/permission/manager.ts`

```typescript
class PermissionManager {
  constructor(opts: PermissionManagerOptions);

  async request(appId: string, capability: Capability): Promise<boolean>;
  grant(appId: string, capability: Capability): void;
  revoke(appId: string, capability: Capability): void;
  isGranted(appId: string, capability: Capability): boolean;

  loadFromStorage(data: Record<string, Capability[]>): void;
  loadFromStore(): void;
  persist(): Record<string, Capability[]>;
  saveToStore(): void;
}
```

### PermissionManagerOptions

```typescript
interface PermissionManagerOptions {
  dev?: boolean;              // dev 模式：自动授权（默认 false）
  store?: PersistenceStore;   // 持久化存储
  storageKey?: string;        // store 中的 key（默认 'permissions'）
}
```

### request

请求权限。

```typescript
async request(appId: string, capability: Capability): Promise<boolean>;
```

**行为**：

- 已授权 → 立即返回 `true`
- dev 模式 → 自动授权（console.warn），返回 `true`
- 生产模式 → 默认拒绝（console.warn），返回 `false`

### grant / revoke

手动授权 / 撤销。

```typescript
grant(appId: string, capability: Capability): void;
revoke(appId: string, capability: Capability): void;
```

### isGranted

检查是否已授权。

```typescript
isGranted(appId: string, capability: Capability): boolean;
```

### Capability 类型

源码：`packages/shared/src/cell-contract.ts`

```typescript
type Capability =
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
  | (string & {});  // 兜底允许自定义扩展
```

### 持久化

```typescript
loadFromStorage(data: Record<string, Capability[]>): void;   // 从内存对象加载
loadFromStore(): void;                                          // 从 PersistenceStore 加载
persist(): Record<string, Capability[]>;                       // 导出为对象
saveToStore(): void;                                            // 保存到 PersistenceStore
```

**示例**：

```typescript
// kernel init 时自动调用 loadFromStore()
// 手动保存
kernel.permissions.saveToStore();

// 导出权限数据
const data = kernel.permissions.persist();
console.log(data);
// {
//   "com.ditto.notes": ["fs:read", "fs:write"],
//   "com.ditto.weather": ["net:fetch"]
// }
```

## IPCBus API

源码：`packages/core/src/ipc/bus.ts`

```typescript
class IPCBus {
  constructor(id: string, defaultTimeout?: number);

  on(channel: string, handler: IPCHandler): () => void;
  off(channel: string, handler: IPCHandler): void;
  send(channel: string, payload?: unknown, target?: string): void;
  request(channel: string, payload?: unknown, timeout?: number): Promise<IPCMessage>;
  respond(requestId: string, payload: unknown, target?: string): void;
  respondError(requestId: string, error: string, target?: string): void;

  use(middleware: IPCMiddleware): () => void;

  connectBridge(targetWindow: Window, origin: string): void;
  disconnectBridge(): void;

  onDispatch(handler: (message: IPCMessage) => void): () => void;
  handleMessage(message: IPCMessage): void;

  destroy(): void;
}
```

### on / off

订阅 / 取消订阅频道。

```typescript
on(channel: string, handler: IPCHandler): () => void;
off(channel: string, handler: IPCHandler): void;
```

`on` 返回 unsubscribe 函数。

```typescript
type IPCHandler = (message: IPCMessage) => void;
```

### send

发送事件消息（无响应）。

```typescript
send(channel: string, payload?: unknown, target?: string): void;
```

| 参数 | 说明 |
|------|------|
| `channel` | 频道名（如 `window:close`） |
| `payload` | 消息内容 |
| `target` | 目标（`'host'` / appId / `'*'`，默认 `'host'`） |

### request

发送请求消息并等待响应。

```typescript
request(channel: string, payload?: unknown, timeout?: number): Promise<IPCMessage>;
```

- 自动生成 `requestId`
- 超时抛 `DittoError.ipcTimeout`（默认 10000ms）
- 响应通过 `respond` / `respondError` 配对

### respond / respondError

响应请求。

```typescript
respond(requestId: string, payload: unknown, target?: string): void;
respondError(requestId: string, error: string, target?: string): void;
```

### use

注册中间件（onion 模式）。

```typescript
use(middleware: IPCMiddleware): () => void;
```

```typescript
type IPCMiddleware = (message: IPCMessage, next: (msg: IPCMessage) => void) => void;
```

**示例**：

```typescript
// 日志中间件
const unsub = kernel.ipc.use((msg, next) => {
  console.log(`[IPC] ${msg.channel} from ${msg.source}`);
  next(msg);
  console.log(`[IPC] ${msg.channel} done`);
});

// 鉴权中间件（可吞消息）
kernel.ipc.use((msg, next) => {
  if (msg.channel.startsWith('admin:') && !isAdmin(msg.source)) {
    return;  // 吞掉，不调 next
  }
  next(msg);
});
```

### connectBridge

连接跨窗口桥接（iframe / popup）。

```typescript
connectBridge(targetWindow: Window, origin: string): void;
```

**严格校验**：

- `origin` 不能为 `'*'`，否则抛 `IPC_BRIDGE_DISCONNECTED`
- `origin` 必须匹配 `/^https?:\/\/.+/`，拒绝 `file:` / `blob:`
- 监听 `window.message` 事件，过滤非白名单 origin

### handleMessage

处理接收到的消息（供 CellBridge 调用）。

```typescript
handleMessage(message: IPCMessage): void;
```

- `response` 类型：匹配 pending request，resolve promise
- `error` 类型：匹配 pending request，reject promise
- 其他：派发给对应 channel 的 handler，handler 异常触发 `ipc:handler-error`

### onDispatch

订阅消息派发事件（所有消息都会触发）。

```typescript
onDispatch(handler: (message: IPCMessage) => void): () => void;
```

### IPCMessage 类型

```typescript
interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error';
  channel: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
  requestId?: string;
}
```

### destroy

销毁 IPCBus。

```typescript
destroy(): void;
```

- 断开 bridge
- 清理所有 pending request（reject）
- 清空 handlers 与 middlewares

## EventEmitter API

源码：`packages/core/src/event/emitter.ts`

```typescript
class EventEmitter {
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
  emit(event: string, payload?: unknown): void;
  removeAllListeners(event?: string): void;
  listenerCount(event: string): number;
}
```

### on / off / once

```typescript
const unsub = emitter.on('user:login', (user) => {
  console.log('用户登录:', user);
});

emitter.once('app:ready', () => {
  console.log('应用就绪（仅触发一次）');
});

// 手动取消
unsub();
// 或
emitter.off('user:login', handler);
```

### emit

触发事件。

```typescript
emit(event: string, payload?: unknown): void;
```

- 单个 handler 异常被 try/catch，不影响其他
- 异常触发 `error:handler` 事件（含 `{ event, error, handler }`）

### removeAllListeners

```typescript
removeAllListeners(event?: string): void;
```

- 不传参数：移除所有事件的所有 handler
- 传 event：仅移除该事件

### listenerCount

```typescript
listenerCount(event: string): number;
```

### 内核事件一览

DittoKernel 在生命周期中触发的事件：

| 事件 | 触发时机 | Payload |
|------|---------|---------|
| `kernel:initializing` | init 开始 | `undefined` |
| `kernel:ready` | init 完成 | `undefined` |
| `kernel:destroying` | destroy 开始 | `undefined` |
| `kernel:error` | init 失败 | `Error` |

LifecycleOrchestrator 事件：

| 事件 | 触发时机 | Payload |
|------|---------|---------|
| `stage-error` | stage handler 抛错 | `{ stage, error }` |

IPCBus 事件（通过 `onDispatch` / `on`）：

| 事件 | 触发时机 | Payload |
|------|---------|---------|
| `dispatch` | 消息派发 | `IPCMessage` |
| `message` | 收到消息 | `IPCMessage` |
| `ipc:handler-error` | handler 异常 | `{ channel, error, message }` |

AppCellManager 事件（通过 `onCellEvent`）：

| 事件 | 触发时机 | Payload |
|------|---------|---------|
| `cell:active` | Cell 激活 | `{ appId, cell }` |
| `cell:paused` | Cell 暂停 | `ClientCell` |
| `cell:resumed` | Cell 恢复 | `ClientCell` |
| `cell:stopped` | Cell 停止 | `{ appId, cell }` |
| `cell:error` | Cell 错误 | `{ appId, error }` |
