# Ditto 架构文档

> Ditto WebOS 的内核架构、Cell 对称设计、生命周期状态机、沙盒安全模型、权限系统、IPCBus v2 与服务编排。

## 目录

- [架构总览](#架构总览)
- [内核架构](#内核架构)
  - [ServiceRegistry 工厂模式](#serviceregistry-工厂模式)
  - [LifecycleOrchestrator 阶段化启动](#lifecycleorchestrator-阶段化启动)
  - [AppCellManager Cell 生命周期](#appcellmanager-cell-生命周期)
- [客户端-服务端对称 Cell 架构](#客户端-服务端对称-cell-架构)
- [Cell 生命周期状态机](#cell-生命周期状态机)
- [沙盒安全模型](#沙盒安全模型)
- [权限系统](#权限系统)
- [IPCBus v2](#ipcbus-v2)
- [服务编排](#服务编排)

## 架构总览

DittoKernel 是以 Cell 为中心的服务编排器，把浏览器变成一个真正的操作系统。内核由以下子系统组成：

```
DittoKernel
├── ServiceRegistry        # 服务注册表，工厂模式懒创建
├── LifecycleOrchestrator  # 阶段化 init/destroy，每阶段错误隔离
├── IPCBus (v2)            # 能力路由 + 严格 origin + 中间件链
├── AppCellManager         # 客户端 Cell 编排器（替代 PluginLoader + AppRuntime）
│   └── ClientCell[]       # 与服务端 CellInstance 对称
│       ├── CellSandbox    # 统一沙盒接口（IFrame / Shadow / Worker）
│       ├── CellBridge     # 与服务端 CellInstance 的 IPC 桥接（WS）
│       └── CellLifecycle  # load → activate → pause → resume → unload
├── PermissionManager (v2) # capability-based 细粒度权限
├── EventEmitter           # 命名空间事件 + 错误隔离
└── PersistenceStore       # 持久化存储
```

源码位置：`packages/core/src/kernel.ts`

### 与服务端对称关系

| 服务端 | 客户端 | 共享契约 |
|--------|--------|----------|
| `AppCellManager`（`server/src/services/app-cell/manager.ts`） | `AppCellManager`（`packages/core/src/app-cell/manager.ts`） | Cell 生命周期状态机 |
| `CellInstanceImpl` | `ClientCell` | `CellContext`、`CellStatus` |
| `CellMembrane` | `CellSandbox` | `Sandbox` 接口 |
| `CellIPCBridge` | `CellBridge` | `IPCMessage` 协议 |
| `CellRouter` | `IPCBus` 能力路由 | `IPCMessage.target` 路由规则 |
| `CellContext` | `CellContext`（client 简化版） | 用户隔离的存储/日志 |

共享契约定义在 `packages/shared/src/cell-contract.ts`，两端各自实现，保证心智模型统一。

## 内核架构

### ServiceRegistry 工厂模式

源码：`packages/core/src/service-registry.ts`

ServiceRegistry 替代原本 kernel 上硬挂的成员，采用工厂模式懒创建 —— 首次 `resolve` 才实例化，避免启动期一次性创建所有服务的开销。

**核心 API**：

```typescript
export class ServiceRegistry {
  register<T>(id: ServiceId, factory: ServiceFactory<T>): void;
  resolve<T>(id: ServiceId): T;
  async resolveAsync<T>(id: ServiceId): Promise<T>;
  has(id: ServiceId): boolean;
  list(): ServiceId[];
  async shutdown(): Promise<void>;
}
```

**特性**：

- **工厂模式**：`ServiceFactory<T> = (ctx: ServiceResolveContext) => T | Promise<T>`，工厂函数接收 `resolve` / `has` 方法，支持服务间依赖
- **懒创建**：实例化后才缓存，未 resolve 的服务不占内存
- **同步/异步工厂**：`resolve` 用于同步工厂，`resolveAsync` 用于返回 Promise 的异步工厂
- **逆序销毁**：`shutdown` 按注册逆序调用每个实例的 `destroy()`，单个 destroy 异常不中断（错误收集后统一 warn）
- **重复注册保护**：同一 id 二次注册抛 `DittoError.serviceAlreadyRegistered`

**注册示例**：

```typescript
import type { DittoKernel } from '@ditto/core';
import { registerKernelServices } from '@ditto/services';

const kernel = createKernel({ kernel: { id: 'my-kernel' } });
await kernel.init();

// 注册 8 个 UI 服务（懒创建）
registerKernelServices(kernel);

// 自定义服务
kernel.services.register('my-service', (ctx) => {
  const ipc = ctx.resolve('ipc');
  return new MyService(ipc);
});

// 使用
const svc = kernel.services.resolve<MyService>('my-service');
```

### LifecycleOrchestrator 阶段化启动

源码：`packages/core/src/lifecycle-orchestrator.ts`

阶段化生命周期编排，按固定顺序执行 7 个 stage 的 `onInit`，destroy 时逆序执行 `onDestroy`。

**阶段顺序**：

```
storage → events → ipc → permissions → services → cells → ready
```

| Stage | 作用 | 内核默认注册 |
|-------|------|--------------|
| `storage` | 持久化存储就绪 | `PersistenceStore` 已在构造函数创建 |
| `events` | EventEmitter 就绪 | 无额外操作（构造时已创建） |
| `ipc` | IPCBus v2 就绪 | 注册 `ipc` 服务 |
| `permissions` | 权限管理就绪 | 加载持久化权限、注册 `permissions` 服务 |
| `services` | 业务服务就绪 | 注册 `events` / `store` 服务 |
| `cells` | Cell 管理器就绪 | 创建 `AppCellManager`、注册 `cells` 服务 |
| `ready` | 启动完成 | 触发 `kernel:ready` 事件 |

**关键特性**：

- **错误隔离**：单个 stage 的 handler 抛错不会中断后续 stage，错误通过 `stage-error` 事件派发
- **逆序销毁**：`destroy` 逆序执行 `onDestroy`，`cells` stage 最先销毁（释放应用资源）
- **可扩展**：通过 `onStage(stage, handler)` 注册自定义阶段逻辑，返回 unsubscribe 函数

```typescript
// 自定义阶段 handler
kernel.lifecycle.onStage('services', {
  onInit: async () => {
    console.log('services stage init');
    await loadExternalData();
  },
  onDestroy: async () => {
    console.log('services stage destroy');
  },
});

// 监听阶段错误
kernel.lifecycle.onStageError((stage, error) => {
  console.error(`Stage ${stage} failed:`, error);
});
```

### AppCellManager Cell 生命周期

源码：`packages/core/src/app-cell/manager.ts`

AppCellManager 是客户端 Cell 编排器，与服务端 `AppCellManager` 对称，承担应用全生命周期管理。

**核心职责**：

- 启动 / 停止 / 暂停 / 恢复 Cell
- 为 dit 类型应用创建 `CellBridge`（WebSocket 桥接）
- 代理 Cell 事件到统一 emitter（`cell:active` / `cell:error` / `cell:stopped`）
- 权限请求委托给 `PermissionManager`

**启动流程**（`startCell`）：

1. 检查 appId 是否已 active，已运行则抛 `cellAlreadyRunning`
2. 若是 dit 类型且有 backendCell，创建 `CellBridge` 并通过 WebSocket 连接服务端 `/ws`
3. 创建 `ClientCell`，注入 container、bridge、requestPermission 回调
4. 代理 cell 事件到 manager emitter
5. 调用 `cell.activate()`，触发权限请求 → 沙盒创建 → 挂载 → 状态转换

```typescript
const cell = await kernel.cellManager.startCell(
  'com.ditto.notes',
  manifest,
  { type: 'dit', origin: 'http://localhost:3001', backendCell: true }
);
```

## 客户端-服务端对称 Cell 架构

Ditto 的核心创新是前后端对称的 Cell 架构：dit 类型的应用同时拥有前端（ClientCell）和后端（CellInstance），通过 CellBridge 双向通信。

### 架构图

```
┌─────────────────── 客户端（浏览器）───────────────────┐
│  DittoKernel                                          │
│  ├── AppCellManager                                   │
│  │   └── ClientCell                                   │
│  │       ├── CellSandbox (iframe-strict)              │
│  │       │   └── <iframe src="frontend/index.html">   │
│  │       └── CellBridge                               │
│  │           ├── WebSocket → ws://server/ws           │
│  │           └── HTTP → /api/cell/{appId}/start|stop  │
│  ├── IPCBus v2                                        │
│  └── PermissionManager                                │
└───────────────────────┬───────────────────────────────┘
                        │ WebSocket + HTTP
┌───────────────────────▼───────────────────────────────┐
│  服务端（Bun + Hono）                                  │
│  AppCellManager                                       │
│  ├── CellInstanceImpl                                 │
│  │   ├── CellContext (db/storage/ipc/logger/metrics)   │
│  │   ├── CellRouter (get/post/put/delete/ws)           │
│  │   └── CellIPCBridge                                │
│  ├── ResourceQuotaManager                             │
│  ├── TrafficShaper                                    │
│  ├── FairScheduler                                    │
│  └── ElasticScaler (hibernate/wake/throttle)          │
└───────────────────────────────────────────────────────┘
```

### ClientCell（客户端）

源码：`packages/core/src/app-cell/cell.ts`

ClientCell 是客户端应用实例，承担应用全生命周期。

- **四种类型**：native（Vue 组件）/ web（远程 URL）/ pwa（PWA manifest）/ dit（前后端 Cell）
- **沙盒选择**：native 用 `shadow-trusted`，其他用 `iframe-strict`
- **dit 类型特殊处理**：activate 时调用 `bridge.notifyStart()`，pause 时 `notifyHibernate()`，resume 时 `notifyWake()`，unload 时 `notifyStop()`

### CellInstanceImpl（服务端）

源码：`server/src/services/app-cell/cell-instance.ts`

服务端 Cell 实例，加载并执行 `AppCellModule`。

- **生命周期**：start → hibernate → wake → stop → destroy
- **模块加载**：动态 `import(backendDir + entry)`，调用 `onInit` → `registerRoutes` → `onStart`
- **健康检查**：定时检查 cell 状态（默认 30s）
- **内存监控**：定时采样 `process.memoryUsage()`（默认 10s）
- **资源副本**：`shared`（多用户共享）/ `exclusive`（独占）

### CellBridge（桥接层）

源码：`packages/core/src/app-cell/bridge.ts`

CellBridge 是客户端 ↔ 服务端的 IPC 桥接，双通道：

- **WebSocket**：连接 `ws://server/ws?userId=xxx`，双向实时消息（`{ type: 'ditto-ipc', message }`）
- **HTTP**：调用 `/api/cell/{appId}/start|stop|hibernate|wake` 控制后端 Cell 生命周期

```typescript
// HTTP 端点
POST /api/cell/{appId}/start      // 启动后端 Cell
POST /api/cell/{appId}/stop       // 停止后端 Cell
POST /api/cell/{appId}/hibernate  // 冬眠（释放资源，保留 state）
POST /api/cell/{appId}/wake       // 唤醒（从冬眠恢复）
GET  /api/cell/{appId}/health     // 健康检查
```

## Cell 生命周期状态机

### 客户端状态机

源码：`packages/core/src/app-cell/lifecycle.ts` + `packages/shared/src/cell-contract.ts`

```
        ┌─────────────────────────────────────┐
        │                                     │
        ▼                                     │
   ┌─────────┐         ┌─────────┐            │
   │ loading │ ──────► │ active  │            │
   └────┬────┘         └────┬────┘            │
        │                   │                 │
        │          ┌────────┼────────┐        │
        │          ▼        │        ▼        │
        │     ┌─────────┐  │  ┌──────────┐    │
        └────►│ paused  │  │  │ stopped  │    │
              └────┬────┘  │  └──────────┘    │
                   │       │                  │
                   └───────┘──────────────────┘
```

**合法转换**（`TRANSITIONS` 表）：

| From | To |
|------|-----|
| `loading` | `active` / `error` / `stopped` |
| `active` | `paused` / `stopped` / `error` |
| `paused` | `active` / `stopped` |
| `stopped` | （终态） |
| `error` | `stopped` / `loading` |

通过 `canTransition(from, to)` 查询合法性，`assertTransition(from, to)` 在非法转换时抛 `CELL_START_FAILED`。

### 服务端状态机

服务端 `CellInstance.status` 比 client 更细，包含冬眠子态：

```
creating → running ⇄ hibernated → stopped
                │           │
                ▼           ▼
              error       waking → running
```

| 状态 | 含义 |
|------|------|
| `creating` | 正在加载后端模块、初始化 context |
| `running` | 正常运行，接受请求 |
| `hibernating` | 正在冬眠（停止健康检查与内存监控） |
| `hibernated` | 已冬眠，保留 state，释放 CPU/内存 |
| `waking` | 正在唤醒（重新调用 `onStart`） |
| `stopping` | 正在停止 |
| `stopped` | 已停止（终态） |
| `error` | 异常 |

**冬眠机制**（ElasticScaler 驱动）：

- 空闲超过 `hibernateAfterMs`（默认 15 分钟）自动冬眠
- 客户端 `resume` 时 `CellBridge.notifyWake()` 唤醒
- 冬眠期间前端发请求返回 503，SDK 会自动重试 wake

## 沙盒安全模型

源码：`packages/core/src/sandbox/index.ts`

### 三档沙盒模式

| 模式 | 适用场景 | 隔离强度 | origin 校验 |
|------|---------|---------|-------------|
| `iframe-strict` | 第三方应用（web / pwa / dit） | 强隔离 | 强制白名单，拒绝 `*` |
| `shadow-trusted` | native 应用（shell 信任） | 无隔离（Shadow DOM） | 不适用 |
| `worker` | 预留（阶段 2） | — | 抛 `SANDBOX_MODE_UNSUPPORTED` |

### iframe-strict 安全收紧

源码：`packages/core/src/sandbox/iframe-sandbox.ts`

```typescript
// 默认 sandbox 属性：allow-scripts（不含 allow-same-origin）
const attrs = o.sandboxAttributes ?? 'allow-scripts';
this.sandboxAttributes = o.allowSameOrigin ? `${attrs} allow-same-origin` : attrs;
```

**关键安全措施**：

1. **origin 强制白名单**：构造时必须提供 `origin`，构造时为空则抛 `SANDBOX_CREATE_FAILED`
2. **默认不含 allow-same-origin**：第三方应用无法访问宿主 cookie、localStorage、DOM
3. **message 校验三重防护**：
   - `event.data.type !== DITTO_MSG_TYPE` 过滤非 Ditto 消息
   - `event.origin !== this.allowedOrigin` 拒绝非白名单 origin
   - `event.source !== this.iframe.contentWindow` 拒绝非本 iframe 消息
4. **trusted 应用显式声明**：`allowSameOrigin: true` 才会加上 `allow-same-origin`

```typescript
import { createSandbox } from '@ditto/core';

// 第三方应用（默认安全）
const sandbox = createSandbox('com.third.app', 'iframe-strict', {
  origin: 'https://third-party.com',
});

// trusted 应用（需要 same-origin 访问）
const trustedSandbox = createSandbox('com.trusted.app', 'iframe-strict', {
  origin: 'https://trusted.com',
  allowSameOrigin: true,
});
```

### shadow-trusted

源码：`packages/core/src/sandbox/shadow-sandbox.ts`

native 应用使用 ShadowSandbox，无 origin 隔离，直接挂载到宿主 DOM（通过 Shadow DOM 封装样式）。仅用于 shell 内置应用，第三方应用不可使用。

## 权限系统

源码：`packages/core/src/permission/manager.ts` + `packages/shared/src/cell-contract.ts`

### capability-based 设计

权限类型从 string 改为 `Capability` 联合类型，支持编辑器自动补全：

```typescript
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
  | (string & {});  // 兜底允许自定义扩展
```

### dev / prod 模式

```typescript
export class PermissionManager {
  constructor(opts: { dev?: boolean; store?: PersistenceStore; storageKey?: string });

  async request(appId: string, capability: Capability): Promise<boolean>;
  grant(appId: string, capability: Capability): void;
  revoke(appId: string, capability: Capability): void;
  isGranted(appId: string, capability: Capability): boolean;
  loadFromStore(): void;
  saveToStore(): void;
}
```

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `dev: true` | manifest 声明即自动授权（console.warn 提示） | 开发期，避免阻塞 |
| `dev: false`（默认） | 默认拒绝，console.warn 提示 | 生产环境 |

- **持久化**：`persistDecisions: true` 时，权限决策通过 `PersistenceStore` 跨会话保留
- **加载时机**：kernel `permissions` stage 调用 `loadFromStore()`
- **请求链路**：ClientCell.activate → 遍历 manifest.permissions → `requestPermission` 回调 → PermissionManager.request

### 全局单例已删除

`getPermissionManager()` 已删除（破坏性变更），改用依赖注入：

```typescript
// ❌ 旧 API（已删除）
import { getPermissionManager } from '@ditto/core';
const pm = getPermissionManager();

// ✅ 新 API
const pm = kernel.permissions;          // 直接访问
// 或
const pm = kernel.services.resolve<PermissionManager>('permissions');
```

## IPCBus v2

源码：`packages/core/src/ipc/bus.ts`

### 关键变更

1. **connectBridge 强制 origin 白名单**：拒绝 `*`，必须 `http(s)://...`，否则抛 `IPC_BRIDGE_DISCONNECTED`
2. **中间件链迭代执行**（onion 模式）：避免递归栈溢出，支持中间件吞消息
3. **handler 异常隔离**：单个 handler 抛错触发 `ipc:handler-error` 事件，不影响其他 handler
4. **destroy 清理 pending**：销毁时所有 pending request 立即 reject，避免内存泄漏

### 消息类型

```typescript
export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error';
  channel: string;
  source: string;
  target?: string;        // 'host' / appId / '*'
  payload: unknown;
  timestamp: number;
  requestId?: string;     // request/response 配对
}
```

### 中间件链（onion 模式）

```typescript
// 注册中间件
const unsubscribe = kernel.ipc.use((message, next) => {
  console.log('[before]', message.channel);
  next(message);                    // 传递给下一层
  console.log('[after]', message.channel);
});

// 中间件可吞消息（不调 next 则后续不执行）
kernel.ipc.use((message, next) => {
  if (message.channel === 'blocked') return;  // 吞掉
  next(message);
});
```

执行顺序：`a:before → b:before → b:after → a:after`（典型 onion 语义）。

### 跨窗口桥接

```typescript
// 连接 iframe / popup 窗口
kernel.ipc.connectBridge(iframe.contentWindow, 'https://app-origin.com');

// 严格校验：origin 不能为 '*'
kernel.ipc.connectBridge(win, '*');  // ❌ 抛 IPC_BRIDGE_DISCONNECTED
```

### handler 错误隔离

handler 异常被捕获，派发到 `ipc:handler-error` 频道，不影响同一频道的其他 handler：

```typescript
kernel.ipc.on('ipc:handler-error', (msg) => {
  console.error('Handler error on', msg.payload.channel, msg.payload.error);
});
```

## 服务编排

### 8 个 UI 服务

源码：`packages/services/src/register.ts`

`registerKernelServices(kernel)` 把 services 包的 8 个服务注册到 `ServiceRegistry`，懒创建：

| ServiceId | 实现 | 类型 | 职责 |
|-----------|------|------|------|
| `dialog` | `useDialogStore` | Pinia store | 对话框 / 确认框 / 文件选择 |
| `notification` | `useNotificationStore` | Pinia store | 系统通知中心 |
| `window` | `useWindowStore` | Pinia store | 窗口管理（focus/minimize/maximize/snap） |
| `widget` | `useWidgetStore` | Pinia store | 桌面小组件 |
| `island` | `useIslandStore` | Pinia store | Dynamic Island 槽位 |
| `search` | `useSearchStore` | Pinia store | 全局搜索 |
| `vfs` | `getVFS()` | 类单例 | 虚拟文件系统（IndexedDB / OPFS） |
| `net-proxy` | `getNetProxy()` | 类单例 | 网络代理（带缓存） |

### kernel 内部服务

由 `DittoKernel.registerStages()` 在各 stage 注册：

| ServiceId | 注册 stage | 实现 |
|-----------|-----------|------|
| `ipc` | `ipc` | `IPCBus` |
| `permissions` | `permissions` | `PermissionManager` |
| `events` | `services` | `EventEmitter` |
| `store` | `services` | `PersistenceStore` |
| `cells` | `cells` | `AppCellManager` |

### 完整服务注册示例

```typescript
import { createKernel } from '@ditto/core';
import { registerKernelServices } from '@ditto/services';

const kernel = createKernel({
  kernel: { id: 'my-kernel', dev: true },
});

// 注册 UI 服务（必须在 init 之后调用，因为 ServiceRegistry 此时才就绪）
await kernel.init();
registerKernelServices(kernel);

// 按需 resolve
const windowStore = kernel.services.resolve('window');
const dialog = kernel.services.resolve('dialog');
const vfs = kernel.services.resolve('vfs');

// 销毁时自动逆序 shutdown
await kernel.destroy();
```

### 关闭流程

`kernel.destroy()` 触发：

1. `LifecycleOrchestrator.destroy()` 逆序执行各 stage `onDestroy`（cells 最先）
2. `ServiceRegistry.shutdown()` 逆序调用每个实例 `destroy()`
3. `IPCBus.destroy()` 清理 bridge、pending request、handlers
4. `EventEmitter.removeAllListeners()`
5. 状态转为 `destroyed`
