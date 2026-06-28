# Ditto Kernel v2 设计规格

- **日期**: 2026-06-28
- **范围**: `packages/core` 内核重构（阶段 1）
- **状态**: 待用户审核
- **关联**: [issue.md](../../issue.md)、[2026-05-11-ditto-market-design.md](./2026-05-11-ditto-market-design.md)

## 1. 背景与目标

### 1.1 现状问题

当前 [kernel.ts](file:///d:/NetWork/Ditto/packages/core/src/kernel.ts) 仅 135 行，是 5 个子系统的简单聚合，存在以下结构性问题：

| 问题 | 证据 | 影响 |
|------|------|------|
| 服务未编排 | `packages/services` 中的 VFS/WindowManager/Notification 等是独立 Pinia store，kernel 不感知 | 内核无法统一管理服务生命周期，无法做依赖拓扑启动 |
| Plugin/App 双轨 | [PluginLoader](file:///d:/NetWork/Ditto/packages/core/src/plugin/loader.ts) 与 [AppRuntime](file:///d:/NetWork/Ditto/packages/core/src/plugin/app-runtime.ts) 并行存在，逻辑重叠（都做 manifest 加载、权限请求、沙盒创建、IPC 绑定） | 词汇不统一、行为不一致、维护成本翻倍 |
| 与服务端不对称 | 服务端已有完善的 [AppCell](file:///d:/NetWork/Ditto/server/src/services/app-cell/index.ts) 架构（CellMembrane/CellInstance/CellRouter/CellContext），客户端无对应抽象 | 前后端心智模型割裂，dit 应用前后端协同需要手动 fetch |
| 全局单例副作用 | [`getKernel()`](file:///d:/NetWork/Ditto/packages/core/src/kernel.ts#L130) 隐式创建实例 | 多实例不可用、测试隔离困难 |
| 沙盒安全弱 | [ShadowSandbox](file:///d:/NetWork/Ditto/packages/core/src/sandbox/sandbox.ts#L78) 无任何隔离；[IFrameSandbox](file:///d:/NetWork/Ditto/packages/core/src/sandbox/sandbox.ts#L13) origin 默认 `*` | 第三方应用可访问宿主 DOM、绕过权限 |
| 生命周期脆弱 | [lifecycle hooks](file:///d:/NetWork/Ditto/packages/core/src/kernel.ts#L61) 单个失败中断整个 init；destroy 路径未捕获 hook 异常 | 一个服务挂掉整个内核起不来 |
| SDK 未接入 | [packages/sdk](file:///d:/NetWork/Ditto/packages/sdk/src/index.ts) 是孤立 API 集合，不通过 kernel 注入 | 应用拿不到一致的运行时上下文 |

### 1.2 目标

把 kernel 重构为**以 Cell 为中心的服务编排器**，与服务端 AppCell 架构对称，奠定后续服务化、应用运行时、健壮性三层能力扩展的地基。

### 1.3 非目标（本次不做）

- dit 文件加载器（阶段 2）
- services 包注册为 kernel services（阶段 2）
- 健康检查、自动恢复、事件追踪日志（阶段 3）
- shell UI 重写（不在内核范围内，但 shell 调用点需同步迁移）

## 2. 设计原则

| 原则 | 含义 | 落地 |
|------|------|------|
| **服务端-客户端对称** | 客户端引入与 [server AppCell](file:///d:/NetWork/Ditto/server/src/services/app-cell/index.ts) 对称的 Cell 抽象 | ClientCell ↔ ServerCell 共享 CellContext/CellBridge 接口 |
| **破坏性纯净重构** | 不保留旧 API facade，PluginLoader/IPCBus/Sandbox 旧 API 直接删除 | shell/tests 同步迁移 |
| **三层渐进** | 阶段 1 只做骨架，阶段 2 服务化，阶段 3 健壮性 | 接口预留扩展点，实现按阶段填充 |
| **类型优先** | TypeScript strict，所有公共 API 有完整类型签名 | `tsconfig.base.json` 已是 strict |
| **易开发性** | 第三方应用开发者拿到 typed SDK + dev 模式 + 模板 | 阶段 1 打通 SDK 注入路径，模板与 CLI 在阶段 2 |
| **性能最优** | 零拷贝 IPC、lazy mount、按需注册、Cell 暂停/恢复 | 见 §7 |
| **API 美观性** | 命名一致、显式依赖、函数式优先、无隐式状态 | 见 §8 |

## 3. 架构总览

### 3.1 新内核组成

```
DittoKernel
├── ServiceRegistry        # 服务注册表，替代原本硬挂的成员
├── LifecycleOrchestrator  # 阶段化 init/destroy，每阶段错误隔离
├── IPCBus (v2)            # 能力路由 + 严格 origin + 中间件链
├── AppCellManager         # 客户端 Cell 编排器（替代 PluginLoader + AppRuntime）
│   └── ClientCell[]       # 与 Server AppCell 对称
│       ├── CellSandbox    # 统一沙盒接口（IFrame / Shadow / Worker）
│       ├── CellBridge     # 与 Server AppCell 的 IPC 桥接（WS）
│       └── CellLifecycle  # load → activate → pause → resume → unload
├── PermissionManager (v2) # 细粒度权限（按 capability 而非字符串）
├── EventEmitter           # 保留，加命名空间 + 错误隔离
└── PersistenceStore       # 保留，不变
```

### 3.2 与服务端对称关系

| 服务端 | 客户端 | 共享契约 |
|--------|--------|----------|
| `AppCellManager` | `AppCellManager` | Cell 生命周期状态机 |
| `CellInstance` | `ClientCell` | `CellContext`、`CellStatus` |
| `CellMembrane` | `CellSandbox` | `Sandbox` 接口 |
| `CellIPCBridge` | `CellBridge` | `IPCMessage` 协议 |
| `CellRouter` | `IPCBus` 能力路由 | `IPCMessage.target` 路由规则 |
| `CellContext` | `CellContext`（client 简化版） | 用户隔离的存储/日志 |

共享契约定义在 `packages/shared/src/cell-contract.ts`（新增），两端各自实现。

## 4. 组件设计

### 4.1 ServiceRegistry

服务注册表，替代原本 kernel 上硬挂的成员。

```typescript
interface ServiceRegistry {
  register<T>(id: ServiceId, factory: ServiceFactory<T>): void;
  resolve<T>(id: ServiceId): T;
  has(id: ServiceId): boolean;
  list(): ServiceId[];
  shutdown(): Promise<void>;
}

type ServiceFactory<T> = (ctx: KernelContext) => T | Promise<T>;

interface KernelContext {
  config: DittoConfig;
  store: PersistenceStore;
  events: EventEmitter;
  ipc: IPCBus;
  permissions: PermissionManager;
  // 阶段 2 起还有 vfs/windowManager/...
}
```

**特性**：
- 工厂模式，避免循环依赖（服务按需创建）
- 同步/异步工厂都支持
- `shutdown()` 按注册逆序销毁
- 重复 register 抛错，避免隐式覆盖

### 4.2 LifecycleOrchestrator

阶段化生命周期，每阶段错误隔离。

```typescript
type LifecycleStage =
  | 'storage'      // PersistenceStore 初始化
  | 'events'       // EventEmitter
  | 'ipc'          // IPCBus
  | 'permissions'  // PermissionManager
  | 'services'     // ServiceRegistry 启动已注册服务
  | 'cells'        // AppCellManager 准备就绪
  | 'ready';

interface LifecycleOrchestrator {
  stage: LifecycleStage;
  init(kernel: DittoKernel): Promise<void>;
  destroy(kernel: DittoKernel): Promise<void>;
  onStage(stage: LifecycleStage, handler: () => void | Promise<void>): () => void;
}
```

**错误隔离策略**：
- 单个 stage 失败 → 标记该 stage 为 `failed`，记录错误，**不中断后续 stage**（除非该 stage 是其他 stage 的硬依赖）
- `services` stage 中单个服务启动失败 → 记录错误，继续启动其他服务
- `destroy` 路径：每个 stage 的销毁都包 try/catch，确保所有 stage 都被尝试销毁

### 4.3 IPCBus v2

```typescript
interface IPCBus {
  on(channel: string, handler: IPCHandler): () => void;
  send(channel: string, payload?: unknown, target?: string): void;
  request(channel: string, payload?: unknown, timeout?: number): Promise<IPCMessage>;
  respond(requestId: string, payload: unknown, target?: string): void;
  use(middleware: IPCMiddleware): () => void;
  connectBridge(targetWindow: Window, origin: string): void;  // origin 必填
  onDispatch(handler: (message: IPCMessage) => void): () => void;
  handleMessage(message: IPCMessage): void;
  destroy(): void;
}
```

**v2 关键变更**：
- `connectBridge(origin)`：origin **必填**，不再接受 `'*'`（生产环境强制白名单）
- 中间件链优化：避免每条消息递归调用，改为迭代式（性能 +5%）
- 能力路由：`target` 支持按 capability 路由（如 `target: '@vfs'` 路由到 VFS 服务），不仅按 appId
- `handleMessage` 中 handler 异常已被捕获（已有），新增错误事件 `ipc:handler-error`

### 4.4 AppCellManager + ClientCell

```typescript
interface AppCellManager {
  startCell(appId: string, manifest: AppManifest, config: CellRuntimeConfig): Promise<ClientCell>;
  stopCell(appId: string): Promise<void>;
  pauseCell(appId: string): Promise<void>;     // 阶段 1 留接口，阶段 2 实现
  resumeCell(appId: string): Promise<void>;    // 同上
  getCell(appId: string): ClientCell | undefined;
  getAllCells(): ClientCell[];
  onCellEvent(event: CellEvent, handler: CellEventHandler): () => void;
  destroy(): Promise<void>;
}

interface ClientCell {
  readonly appId: string;
  readonly manifest: AppManifest;
  readonly status: CellStatus;  // 'loading' | 'active' | 'paused' | 'stopped' | 'error'
  readonly sandbox: CellSandbox;
  readonly bridge: CellBridge;
  activate(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  unload(): Promise<void>;
  onError(handler: (err: Error) => void): () => void;
}

type CellRuntimeConfig =
  | { type: 'native'; componentLoader: () => Promise<any> }
  | { type: 'web'; url: string; origin: string; sandboxAttributes?: string }
  | { type: 'pwa'; manifestUrl: string; scope?: string; startUrl?: string }
  | { type: 'dit'; origin: string; backendCell?: boolean };
// dit 类型：origin = Ditto server URL（如 http://localhost:3001），
// frontend 由 `${origin}/api/apps/{appId}/frontend/index.html` 派生；
// backendCell=true 时通过 CellBridge 启动服务端 Cell
```

**与旧代码的关系**：
- 替代 [PluginLoader.load](file:///d:/NetWork/Ditto/packages/core/src/plugin/loader.ts#L34) 与 [AppRuntime.startApp](file:///d:/NetWork/Ditto/packages/core/src/plugin/app-runtime.ts#L60)，统一为 `AppCellManager.startCell`
- 后端 polling 逻辑（[startBackendPolling](file:///d:/NetWork/Ditto/packages/core/src/plugin/app-runtime.ts#L302)）迁移到 `CellBridge`，可被阶段 3 的健康检查替换
- dit 应用的 `/api/cell/{appId}/start` 调用迁移到 `CellBridge`

### 4.5 CellSandbox

统一沙盒接口，修复安全问题。

```typescript
interface CellSandbox {
  mount(container: HTMLElement, entry: SandboxEntry): void;
  send(message: IPCMessage): void;
  onMessage(handler: SandboxMessageHandler): () => void;
  destroy(): void;
}

type SandboxMode = 'iframe-strict' | 'shadow-trusted' | 'worker';

function createSandbox(appId: string, mode: SandboxMode, opts: SandboxOptions): CellSandbox;
```

**安全修复**：
- `iframe-strict`：默认 sandbox 属性 `allow-scripts`，**移除** `allow-same-origin`（除非显式声明 trusted），origin 强制白名单
- `shadow-trusted`：明确标记为 trusted（仅 native 应用可用），文档警示
- 新增 `worker` 模式（阶段 1 仅留接口，阶段 2 实现纯 JS 应用隔离）
- 删除 `IFrameSandbox` / `ShadowSandbox` 的 export，统一通过 `createSandbox` 工厂

### 4.6 PermissionManager v2

细粒度权限，按 capability 而非字符串。

```typescript
type Capability =
  | 'fs:read' | 'fs:write'
  | 'net:fetch' | 'net:websocket'
  | 'clipboard:read' | 'clipboard:write'
  | 'notification:show'
  | 'window:multi' | 'window:fullscreen'
  | 'cell:backend'    // dit 应用启动后端
  | 'cell:peer'       // 与其他 Cell 通信
  | string;  // 允许自定义扩展

interface PermissionManager {
  request(appId: string, capability: Capability): Promise<boolean>;
  grant(appId: string, capability: Capability): void;
  revoke(appId: string, capability: Capability): void;
  isGranted(appId: string, capability: Capability): boolean;
  loadFromStorage(data: Record<string, Capability[]>): void;
  persist(): Record<string, Capability[]>;
}
```

**v2 变更**：
- 权限类型从 `string` 改为 `Capability` 联合类型，编辑器自动补全
- `request` 返回 Promise（保留），但内部 UI 弹窗逻辑移到 `packages/services/dialog`（阶段 2）
- 阶段 1 默认策略：
  - 生产模式：所有 capability 默认拒绝；manifest 声明 → `console.warn` 提示并**返回 false**（应用拿不到权限，由 shell 在阶段 2 接入弹窗后改为交互式授权）
  - dev 模式（`config.kernel.dev === true`）：manifest 声明 → `console.warn` 提示并**自动授权**，避免阶段 1 阻塞开发

### 4.7 EventEmitter v2

保留接口，加错误隔离。

```typescript
interface EventEmitter {
  on(event: string, handler: EventHandler): () => void;
  once(event: string, handler: EventHandler): () => void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, payload?: unknown): void;
  removeAllListeners(event?: string): void;
}
```

**变更**：`emit` 内部对每个 handler 包 try/catch，单个 handler 异常不影响其他 handler；错误打到 console 并触发 `error:handler` 事件。

## 5. 数据流

### 5.1 应用启动流程

```
shell
  → kernel.cellManager.startCell(appId, manifest, config)
    → permissions.request(appId, capability)（按需）
    → createSandbox(appId, mode, opts)
    → sandbox.mount(container, entry)
    → bridge.connect()  // dit 类型才连接 WS
    → cell.activate()
    → events.emit('cell:active', cell)
```

### 5.2 IPC 路由

```
应用 Cell
  → sandbox.send(message)
  → IPCBus.dispatch(message)
    → middlewares 链（迭代执行）
    → finalDispatch:
      → 若 target === '@vfs' 等 capability 前缀 → 路由到对应 kernel service（阶段 2 启用，阶段 1 该类 target 无对应 service 则丢弃并 warn）
      → 若 target === appId → 路由到目标 Cell
      → 若 target === '*' → 广播到所有 running Cell
      → 若 target === 'host' → 本地 handler
      → 若 target === 'server:<appId>' 且当前 Cell 为 dit 类型 → bridge.sendToServer(message)
      → 否则 → 丢弃并触发 ipc:no-route 事件
```

### 5.3 服务端 Cell 协同

```
ClientCell（dit 类型）
  → CellBridge.connect(origin, userId)
  → WebSocket 连接 /ws
  → server AppCellManager.startCellForUser(appId, userId)
    → CellMembrane 隔离
    → CellContext 创建用户隔离存储
  → ClientCell 持续通过 CellBridge 路由 IPC
  → 暂停（阶段 2）：ClientCell.pause() → bridge.notifyPause() → server ElasticScaler.hibernateCell()
```

## 6. 错误处理与健壮性

### 6.1 阶段 1 范围

| 边界 | 策略 |
|------|------|
| LifecycleOrchestrator stage | 单 stage 失败不中断其他 stage，记录到 `kernel:stage-error` 事件 |
| ServiceRegistry | 单服务启动失败记录错误，继续启动其他 |
| IPCBus handler | 单 handler 异常捕获，触发 `ipc:handler-error` 事件 |
| EventEmitter handler | 单 handler 异常捕获，触发 `error:handler` 事件 |
| Cell 启动 | 启动失败 → cell.status = 'error'，不影响其他 Cell |
| Cell 运行时 | sandbox.onMessage 异常已捕获（保留），新增 cell-level error 事件 |
| LifecycleOrchestrator destroy | 每个 stage 销毁包 try/catch，全部尝试 |

### 6.2 阶段 3 范围（占位，本次不实现）

- 健康检查：周期性 ping Cell，超时标记 stale
- 自动恢复：stale Cell 自动重启（带退避）
- 事件追踪日志：所有 kernel/cell 事件写入 ring buffer
- metrics 上报：IPC 延迟、Cell 启动时间、错误率

## 7. 性能策略

| 优化点 | 措施 | 预期收益 |
|--------|------|----------|
| IPC 中间件链 | 递归改迭代，避免栈溢出 + 函数调用开销 | 大消息量下 +5~10% |
| Cell lazy mount | sandbox.mount 延迟到 activate 阶段 | 启动更快 |
| Service lazy resolve | ServiceRegistry 工厂模式，按需创建 | 减少冷启动时间 |
| Cell 暂停/恢复 | pauseCell 时释放 DOM 资源（保留 state） | 多应用场景内存占用降低 |
| IPC 序列化 | 使用 structuredClone（支持后）替代 JSON.parse/stringify | 二进制数据传输更快 |
| 事件去抖 | 高频事件（resize/scroll）去抖 | 减少 handler 调用 |

## 8. API 优雅性约定

> 注：本节指内核 API 层面的优雅性。用户界面美观性与易用性见 §9。

- **命名**：Cell/App/Service 三类词汇严格区分；Cell = 应用实例，App = 应用包，Service = 内核服务
- **类型优先**：所有公共 API 有完整 TSDoc + 类型签名，无 `any`（除 Vue 组件 loader 暂保留）
- **函数式优先**：工厂函数优于 class 继承；纯函数优于有状态方法
- **显式依赖**：服务通过 `KernelContext` 注入，不通过全局 `getKernel()`
- **不可变优先**：状态读取用 readonly，修改通过显式方法
- **错误显式**：抛 `DittoError`（已有），不返回 null/undefined 表示错误
- **文件组织**：每个公共类/接口单文件，`index.ts` 仅 re-export

## 9. 用户界面美观性与易用性

> **范围声明**：UI 美化与易用性主要属于**阶段 2**（服务化与应用运行时）。阶段 1 仅迁移 shell 调用点，不改 UI。但阶段 1 内核必须为 UI 服务预留扩展点，避免阶段 2 重构。

### 9.1 设计目标

| 维度 | 目标 |
|------|------|
| **一致性** | 所有 UI 来自 [packages/ui](file:///d:/NetWork/Ditto/packages/ui/src/components) 组件库（DWindow/DTaskbar/DDesktop/DNotification/DDialog/DStartMenu/DWidgetBoard/DContextMenu），无散落组件 |
| **主题化** | 通过 [packages/theme](file:///d:/NetWork/Ditto/packages/theme/src/engine.ts) 引擎运行时切换；支持 token 级定制（已有 midnight/nord/ocean/forest 四套） |
| **响应式** | 桌面/平板/手机三档布局，由 [packages/adapter](file:///d:/NetWork/Ditto/packages/adapter/src/mobile/useDeviceMode.ts) 检测驱动 |
| **可访问性** | WCAG 2.1 AA：键盘完整可达、屏幕阅读器语义化、对比度达标、字号可调 |
| **性能** | 组件懒加载、虚拟列表（任务栏多应用场景）、CSS `containment`、动画走 `transform`/`opacity` |
| **易用性** | 见 §9.3 |

### 9.2 内核为 UI 提供的扩展点（阶段 1 预留，阶段 2 实现）

阶段 1 通过 `ServiceRegistry` 预留以下 service id，阶段 2 注册实现：

| ServiceId | 用途 | 阶段 2 实现 |
|-----------|------|-------------|
| `dialog` | 模态/非模态对话框 API（确认/输入/选择/自定义） | 包装 [packages/services/dialog](file:///d:/NetWork/Ditto/packages/services/src/dialog) + [DDialog](file:///d:/NetWork/Ditto/packages/ui/src/components/DDialog) |
| `notification` | 通知 API（推送/聚合/操作按钮） | 包装 [notification-center](file:///d:/NetWork/Ditto/packages/services/src/notification-center) + [DNotification](file:///d:/NetWork/Ditto/packages/ui/src/components/DNotification) |
| `window` | 窗口管理 API（创建/移动/缩放/吸附/最大化/多桌面） | 包装 [window-manager](file:///d:/NetWork/Ditto/packages/services/src/window-manager) + [DWindow](file:///d:/NetWork/Ditto/packages/ui/src/components/DWindow) |
| `widget` | 桌面小组件 API（注册/拖拽/配置） | 包装 [widget](file:///d:/NetWork/Ditto/packages/services/src/widget) + [DWidgetBoard](file:///d:/NetWork/Ditto/packages/ui/src/components/DWidgetBoard) |
| `island` | 灵动岛/状态栏 API | 包装 [island](file:///d:/NetWork/Ditto/packages/services/src/island) |
| `search` | 全局搜索 API | 包装 [search](file:///d:/NetWork/Ditto/packages/services/src/search) |
| `vfs` | 虚拟文件系统 API | 包装 [vfs](file:///d:/NetWork/Ditto/packages/services/src/vfs) |
| `net-proxy` | 网络代理 API（绕过 CORS、缓存） | 包装 [net-proxy](file:///d:/NetWork/Ditto/packages/services/src/net-proxy) |

应用通过 SDK 调用：`sdk.dialog.confirm(...)` → 内部 `kernel.resolve('dialog').confirm(...)` → 触发 DDialog 显示。

### 9.3 易用性要求

#### 9.3.1 应用发现与启动
- **开始菜单**：[DStartMenu](file:///d:/NetWork/Ditto/packages/ui/src/components/DStartMenu) 显示已安装应用，支持搜索/分类/最近使用
- **市场入口**：开始菜单内集成"获取更多应用"→ [Market.vue](file:///d:/NetWork/Ditto/apps/shell/src/apps/Market.vue)
- **桌面图标**：[DDesktop](file:///d:/NetWork/Ditto/packages/ui/src/components/DDesktop) 支持拖拽排列、双击启动
- **任务栏固定**：[DTaskbar](file:///d:/NetWork/Ditto/packages/ui/src/components/DTaskbar) 支持右键固定/取消固定
- **即开即用**：点击图标 → 立即显示 loading → 沙盒就绪后切换到窗口（无需显式"安装"步骤）

#### 9.3.2 窗口管理
- 拖拽移动、边缘缩放、双击标题栏最大化
- 吸附区域检测（左半/右半/全屏/四象限）→ 见 [window-manager/layout.ts](file:///d:/NetWork/Ditto/packages/services/src/window-manager/layout.ts)
- 多桌面切换（Ctrl+1~9）
- 任务栏显示运行中窗口、最小化恢复
- 关闭确认（应用可拦截）

#### 9.3.3 通知与对话框
- 通知：右下角聚合、操作按钮、点击跳转、可滑动关闭
- 模态对话框：背景遮罩、ESC 关闭、Tab 焦点陷阱
- 输入对话框：表单校验、回车确认

#### 9.3.4 文件管理
- [FileManager.vue](file:///d:/NetWork/Ditto/apps/shell/src/apps/FileManager.vue) 可视化 VFS
- 拖拽上传、多选（Ctrl/Shift）、右键菜单（复制/移动/重命名/删除）
- 路径面包屑、最近访问

#### 9.3.5 第三方应用 UI 易用性
- **SDK 统一组件库**：第三方应用通过 SDK 拿到与 shell 同款的 UI 组件（DWindow/DDialog 等），保证视觉一致
- **manifest 声明**：`preferredWindowSize`、`minWindowSize`、`theme`（dark/light/auto）、`singleInstance`
- **加载状态**：应用启动 → 显示骨架屏 → 就绪后切换
- **错误状态**：应用崩溃 → 窗口内显示错误页 + "重新加载"按钮
- **快捷键**：应用可声明 `accelerators`，kernel 路由到对应 Cell

### 9.4 视觉规范（阶段 2 落地）

- **设计语言**：现代扁平 + 微动效；圆角 8px、阴影层级 3 档、过渡 200ms ease-out
- **配色**：通过 theme tokens 派生，亮/暗双模式
- **图标**：统一图标库（lucide-vue-next 推荐），不混用多套图标
- **字体**：系统字体栈优先（`-apple-system, BlinkMacSystemFont, "Segoe UI", ...`），中文回退到 `"PingFang SC", "Microsoft YaHei"`
- **间距**：8px 网格，组件内 padding 12/16/24 三档
- **动效**：窗口开合 200ms、通知滑入 300ms、按钮点击 100ms 反馈

## 10. 阶段 1 详细范围

### 10.1 新增文件

```
packages/core/src/
├── kernel.ts                          # 重写
├── service-registry.ts                # 新增
├── lifecycle-orchestrator.ts          # 新增
├── app-cell/
│   ├── index.ts
│   ├── manager.ts                     # AppCellManager
│   ├── cell.ts                        # ClientCell
│   ├── bridge.ts                      # CellBridge
│   └── lifecycle.ts                   # CellLifecycle 状态机
├── sandbox/
│   ├── index.ts                       # createSandbox 工厂
│   ├── iframe-sandbox.ts              # IFrameSandbox（修复 origin）
│   ├── shadow-sandbox.ts             # ShadowSandbox（标记 trusted）
│   └── worker-sandbox.ts              # 阶段 1 仅 stub
├── ipc/
│   └── bus.ts                         # v2 重写
├── event/
│   └── emitter.ts                     # v2 重写（错误隔离）
├── permission/
│   └── manager.ts                     # v2（capability）
├── persistence/                       # 保留
└── index.ts                            # 重写 export
```

### 10.2 删除文件

- `packages/core/src/plugin/loader.ts`（合并入 app-cell/manager.ts）
- `packages/core/src/plugin/app-runtime.ts`（合并入 app-cell/manager.ts）
- `packages/core/src/plugin/index.ts`
- `packages/core/src/sandbox/sandbox.ts`（拆分为 sandbox/ 下多个文件）
- `packages/core/src/sandbox/permission.ts`（迁移到 permission/manager.ts）
- `packages/core/src/sandbox/index.ts`

### 10.3 修改文件

- `packages/core/src/kernel.ts`：完全重写
- `packages/core/src/index.ts`：更新 export
- `packages/core/package.json`：补充 exports 字段
- `packages/shared/src/types.ts`：新增 `Capability`、`CellStatus`、`CellEvent`、`CellRuntimeConfig`
- `packages/shared/src/cell-contract.ts`：新增，前后端共享契约
- `packages/shared/src/index.ts`：新增 export
- `apps/shell/src/main.ts`：迁移到新 kernel API
- `apps/shell/src/App.vue`：迁移到新 kernel API
- `apps/shell/src/stores/market.ts`：如有依赖 PluginLoader，迁移
- `tests/app-cell.test.ts`：迁移到新 API
- `tests/multi-user.test.ts`：如有依赖，迁移
- `tests/packager.test.ts`：不依赖 kernel，不变
- `tests/resource-fabric.test.ts`：不依赖 kernel，不变

### 10.4 验收标准

- 所有现有测试通过（迁移后）
- 新增单元测试覆盖：ServiceRegistry、LifecycleOrchestrator、AppCellManager、ClientCell、CellSandbox、IPCBus v2、PermissionManager v2
- `pnpm build` 通过
- `pnpm typecheck` 通过（如有）
- shell 能正常启动并加载一个测试应用（手动验证）

## 11. 测试策略

### 11.1 单元测试

| 模块 | 关键用例 |
|------|----------|
| ServiceRegistry | 注册/解析/重复注册抛错/shutdown 逆序 |
| LifecycleOrchestrator | 各 stage 顺序/单 stage 失败不中断/destroy 全部尝试 |
| AppCellManager | 启动/停止/重复启动抛错/destroy 全部停止 |
| ClientCell | 状态机转换/error 事件 |
| CellSandbox | iframe origin 校验/shadow trusted 标记 |
| IPCBus v2 | 路由/capability 路由/中间件链/handler 错误隔离 |
| PermissionManager v2 | request/grant/revoke/persist |

### 11.2 集成测试

- kernel init → startCell → IPC 往返 → stopCell → destroy 全流程
- dit 类型 Cell 通过 mock CellBridge 与服务端通信（mock WebSocket）

### 11.3 性能基准（阶段 1 仅记录基线）

- IPC 单次往返延迟（同 origin）
- Cell 启动时间（native/web/dit 各 10 次取中位数）

## 12. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| shell 迁移工作量大 | 中 | 中 | 阶段 1 范围严格控制，shell 只迁移调用点，不重写 UI |
| 与服务端 CellContext 接口不完全对称 | 中 | 中 | 共享契约文件先定义，两端各自实现，允许客户端简化 |
| ShadowSandbox 改为 trusted 后破坏 native 应用 | 低 | 高 | native 应用通过 manifest.sandbox='trusted' 显式声明 |
| Worker sandbox stub 无法工作 | 低 | 低 | 阶段 1 仅 stub，createSandbox 抛 NotSupported |
| LifecycleOrchestrator 错误隔离掩盖真实问题 | 中 | 中 | 失败的 stage 触发 `kernel:stage-error` 事件，shell 在 dev 模式下显示 |

## 13. 阶段后续衔接

- **阶段 2**：services 包（VFS/WindowManager/Notification/Dialog/Widget/Island/Search/NetProxy）注册为 kernel services；SDK 作为 kernel service 注入 Cell；dit 文件加载器集成；Cell pause/resume 完整实现；CLI 脚手架（dit init/dev/build）；应用模板（Vue/React/Vanilla）
- **阶段 3**：健康检查；自动恢复；事件追踪日志（ring buffer）；metrics 上报；Worker sandbox 实现

## 14. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 内核主轴 | 全部要，分阶段做 | 用户明确要求 |
| 架构对齐 | 服务端-客户端对称 Cell | 词汇统一，后续扩展连贯 |
| API 兼容性 | 破坏性纯净重构 | 避免技术债，shell/tests 同步迁移 |
| 阶段方案 | 三层渐进重构（骨架→服务化→健壮性） | 每层可验证，风险分散 |
| 全局单例 | 删除 getKernel()，显式 createKernel + DI | 测试隔离 + 多实例支持 |
| 沙盒安全 | IFrame origin 强制白名单 + ShadowSandbox 标记 trusted | 第三方应用安全基线 |
| UI 美观性范围 | 阶段 1 仅预留 ServiceRegistry 扩展点（dialog/notification/window/widget/island/search/vfs/net-proxy），UI 美化与易用性在阶段 2 落地 | 用户明确"美观性指用户界面、强调易用性"；阶段 1 聚焦内核骨架，避免范围蔓延 |
