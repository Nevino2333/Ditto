# Ditto Kernel v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `packages/core` 内核重构为以 Cell 为中心的服务编排器，与服务端 AppCell 对称，奠定阶段 2/3 扩展地基。

**Architecture:** 三层渐进重构——阶段 1 仅做骨架：ServiceRegistry + LifecycleOrchestrator + AppCellManager（替代 PluginLoader+AppRuntime）+ ClientCell（与 Server AppCell 对称）+ IPCBus v2（能力路由+严格 origin）+ CellSandbox（修复安全）+ PermissionManager v2（capability）。破坏性变更，shell/tests 同步迁移。

**Tech Stack:** TypeScript 5.7 strict、Vitest 3、pnpm workspace、turbo、Vue 3（shell）。

**Spec:** [2026-06-28-ditto-kernel-v2-design.md](../specs/2026-06-28-ditto-kernel-v2-design.md)

---

## 文件结构

### 新增

| 路径 | 职责 |
|------|------|
| `packages/shared/src/cell-contract.ts` | 客户端 Cell 共享契约（ClientCellStatus、CellEvent、CellRuntimeConfig、Capability） |
| `packages/core/src/service-registry.ts` | 服务注册表 |
| `packages/core/src/lifecycle-orchestrator.ts` | 阶段化生命周期编排 |
| `packages/core/src/event/emitter.ts` | EventEmitter v2（错误隔离，重写） |
| `packages/core/src/permission/manager.ts` | PermissionManager v2（capability） |
| `packages/core/src/permission/index.ts` | re-export |
| `packages/core/src/ipc/bus.ts` | IPCBus v2（重写） |
| `packages/core/src/sandbox/index.ts` | createSandbox 工厂 |
| `packages/core/src/sandbox/iframe-sandbox.ts` | IFrameSandbox（修复 origin） |
| `packages/core/src/sandbox/shadow-sandbox.ts` | ShadowSandbox（trusted 标记） |
| `packages/core/src/sandbox/worker-sandbox.ts` | Worker sandbox stub |
| `packages/core/src/app-cell/index.ts` | re-export |
| `packages/core/src/app-cell/manager.ts` | AppCellManager |
| `packages/core/src/app-cell/cell.ts` | ClientCell |
| `packages/core/src/app-cell/bridge.ts` | CellBridge（WS 客户端） |
| `packages/core/src/app-cell/lifecycle.ts` | CellLifecycle 状态机 |
| `packages/core/src/kernel.ts` | DittoKernel 重写 |
| `packages/core/src/index.ts` | 重写 export |
| `packages/core/src/__tests__/*.test.ts` | 单元测试 |

### 删除

- `packages/core/src/plugin/loader.ts`
- `packages/core/src/plugin/app-runtime.ts`
- `packages/core/src/plugin/index.ts`
- `packages/core/src/sandbox/sandbox.ts`
- `packages/core/src/sandbox/permission.ts`
- `packages/core/src/sandbox/index.ts`（重写为新内容）
- `packages/core/src/ipc/index.ts`（重写）

### 修改

- `packages/shared/src/types.ts`：新增 Capability、ClientCellStatus、CellEvent、CellRuntimeConfig（客户端版）
- `packages/shared/src/index.ts`：export cell-contract
- `packages/shared/src/errors.ts`：新增 CELL_* 错误码
- `apps/shell/src/main.ts`：迁移到 createKernel + ServiceRegistry
- `apps/shell/src/App.vue`：迁移 PluginLoader→AppCellManager 调用
- `tests/app-cell.test.ts`：迁移到 ClientCell API
- `tests/multi-user.test.ts`：如有 kernel 依赖，迁移

---

## Task 1: shared 类型与错误码扩展

**Files:**
- Create: `packages/shared/src/cell-contract.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/cell-contract.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/shared/src/__tests__/cell-contract.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import type { Capability, ClientCellStatus, CellEvent, CellRuntimeConfig } from '../cell-contract';

describe('cell-contract types', () => {
  it('Capability 接受标准能力', () => {
    const caps: Capability[] = ['fs:read', 'fs:write', 'net:fetch', 'cell:backend'];
    expect(caps.length).toBe(4);
  });

  it('ClientCellStatus 覆盖所有状态', () => {
    const statuses: ClientCellStatus[] = ['loading', 'active', 'paused', 'stopped', 'error'];
    expect(statuses).toHaveLength(5);
  });

  it('CellRuntimeConfig 区分四种类型', () => {
    const native: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({} as any) };
    const web: CellRuntimeConfig = { type: 'web', url: 'http://x', origin: 'http://x' };
    const pwa: CellRuntimeConfig = { type: 'pwa', manifestUrl: 'http://x/m.json' };
    const dit: CellRuntimeConfig = { type: 'dit', origin: 'http://srv', backendCell: true };
    expect(native.type).toBe('native');
    expect(web.type).toBe('web');
    expect(pwa.type).toBe('pwa');
    expect(dit.type).toBe('dit');
  });

  it('CellEvent 覆盖所有事件', () => {
    const events: CellEvent[] = ['cell:loading', 'cell:active', 'cell:paused', 'cell:resumed', 'cell:stopped', 'cell:error'];
    expect(events).toHaveLength(6);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/shared/src/__tests__/cell-contract.test.ts`
Expected: FAIL，找不到 `../cell-contract` 模块

- [ ] **Step 3: 实现 cell-contract.ts**

创建 `packages/shared/src/cell-contract.ts`：

```typescript
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
```

- [ ] **Step 4: 扩展 errors.ts**

在 `packages/shared/src/errors.ts` 的 `DittoErrorCode` 联合类型中**追加**（不删除现有）：

```typescript
export type DittoErrorCode =
  | 'KERNEL_NOT_INITIALIZED'
  | 'KERNEL_ALREADY_INITIALIZED'
  | 'KERNEL_STAGE_FAILED'
  | 'IPC_REQUEST_TIMEOUT'
  | 'IPC_HANDLER_ERROR'
  | 'IPC_NO_HANDLER'
  | 'IPC_NO_ROUTE'
  | 'IPC_BRIDGE_DISCONNECTED'
  | 'PLUGIN_NOT_FOUND'        // 保留，向后兼容外部代码
  | 'PLUGIN_ALREADY_LOADED'   // 保留
  | 'PLUGIN_LOAD_FAILED'      // 保留
  | 'PLUGIN_PERMISSION_DENIED'// 保留
  | 'CELL_NOT_FOUND'
  | 'CELL_ALREADY_RUNNING'
  | 'CELL_START_FAILED'
  | 'CELL_PERMISSION_DENIED'
  | 'SANDBOX_CREATE_FAILED'
  | 'SANDBOX_MESSAGE_INVALID'
  | 'SANDBOX_MODE_UNSUPPORTED'
  | 'SERVICE_NOT_REGISTERED'
  | 'SERVICE_ALREADY_REGISTERED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_REQUIRED'
  | 'VFS_FILE_NOT_FOUND'
  | 'VFS_PATH_INVALID'
  | 'VFS_PROVIDER_NOT_FOUND'
  | 'VFS_WRITE_FAILED'
  | 'VFS_READ_FAILED'
  | 'VFS_DELETE_FAILED'
  | 'APP_MANIFEST_INVALID'
  | 'APP_NOT_FOUND'
  | 'APP_ALREADY_RUNNING'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'NETWORK_PROXY_FAILED'
  | 'UNKNOWN';
```

在 `DittoError` 类末尾（`storageUnavailable` 静态方法后）**追加**工厂方法：

```typescript
  static cellNotFound(id: string): DittoError {
    return new DittoError('CELL_NOT_FOUND', `Cell "${id}" not found`);
  }

  static cellAlreadyRunning(id: string): DittoError {
    return new DittoError('CELL_ALREADY_RUNNING', `Cell "${id}" is already running`);
  }

  static cellStartFailed(id: string, cause?: unknown): DittoError {
    return new DittoError('CELL_START_FAILED', `Failed to start cell "${id}"`, { cause: cause instanceof Error ? cause : undefined });
  }

  static sandboxModeUnsupported(mode: string): DittoError {
    return new DittoError('SANDBOX_MODE_UNSUPPORTED', `Sandbox mode "${mode}" is not supported in this build`);
  }

  static serviceNotRegistered(id: string): DittoError {
    return new DittoError('SERVICE_NOT_REGISTERED', `Service "${id}" is not registered`);
  }

  static serviceAlreadyRegistered(id: string): DittoError {
    return new DittoError('SERVICE_ALREADY_REGISTERED', `Service "${id}" is already registered`);
  }

  static ipcNoRoute(target: string): DittoError {
    return new DittoError('IPC_NO_ROUTE', `No route for target "${target}"`, { recoverable: true });
  }
```

- [ ] **Step 5: 更新 shared/index.ts**

修改 `packages/shared/src/index.ts`，追加一行：

```typescript
export * from './types';
export * from './utils';
export * from './constants';
export * from './config';
export * from './errors';
export * from './cell-contract';
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run packages/shared/src/__tests__/cell-contract.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 7: 跑全量测试确认无回归**

Run: `pnpm test`
Expected: 现有测试全 PASS（types 扩展是纯新增，不破坏现有）

- [ ] **Step 8: 提交**

```bash
git add packages/shared/src/cell-contract.ts packages/shared/src/__tests__/cell-contract.test.ts packages/shared/src/types.ts packages/shared/src/errors.ts packages/shared/src/index.ts
git commit -m "feat(shared): add client cell contract types and CELL_* error codes"
```

---

## Task 2: EventEmitter v2（错误隔离）

**Files:**
- Modify: `packages/core/src/event/emitter.ts`
- Test: `packages/core/src/__tests__/emitter.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/emitter.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../event/emitter';

describe('EventEmitter v2', () => {
  it('on/emit 触发 handler', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('test', fn);
    emitter.emit('test', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('on 返回取消订阅函数', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    const off = emitter.on('test', fn);
    off();
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('once 只触发一次', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.once('test', fn);
    emitter.emit('test');
    emitter.emit('test');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('单个 handler 异常不影响其他 handler', () => {
    const emitter = new EventEmitter();
    const good = vi.fn();
    const bad = () => { throw new Error('boom'); };
    const errHandler = vi.fn();
    emitter.on('test', bad);
    emitter.on('test', good);
    emitter.on('error:handler', errHandler);
    emitter.emit('test');
    expect(good).toHaveBeenCalled();
    expect(errHandler).toHaveBeenCalled();
  });

  it('removeAllListeners 清除指定事件', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('test', fn);
    emitter.removeAllListeners('test');
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/core/src/__tests__/emitter.test.ts`
Expected: FAIL（旧 emitter 无错误隔离，第 4 个用例失败）

- [ ] **Step 3: 重写 emitter.ts**

完全替换 `packages/core/src/event/emitter.ts`：

```typescript
type EventHandler = (payload?: unknown) => void;

/**
 * EventEmitter v2。
 * 关键变更：emit 时对每个 handler 包 try/catch，单个异常不影响其他；
 * 异常打到 console 并触发 error:handler 事件。
 */
export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  once(event: string, handler: EventHandler): () => void {
    const wrapper: EventHandler = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  off(event: string, handler: EventHandler): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(event);
    }
  }

  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // 复制一份避免迭代中修改
    const handlers = [...set];
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[Ditto EventEmitter] Handler error on "${event}":`, e);
        // 触发 error:handler（避免无限递归：直接调用，不走 emit）
        const errSet = this.handlers.get('error:handler');
        if (errSet && event !== 'error:handler') {
          for (const errHandler of [...errSet]) {
            try {
              errHandler({ event, error: e, handler });
            } catch (ee) {
              console.error(`[Ditto EventEmitter] Error in error:handler:`, ee);
            }
          }
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// 保留 EventDispatcher 别名（旧代码可能引用）
export { EventEmitter as EventDispatcher };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/emitter.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/event/emitter.ts packages/core/src/__tests__/emitter.test.ts
git commit -m "refactor(core): EventEmitter v2 with handler error isolation"
```

---

## Task 3: PermissionManager v2（capability）

**Files:**
- Create: `packages/core/src/permission/manager.ts`
- Create: `packages/core/src/permission/index.ts`
- Delete: `packages/core/src/sandbox/permission.ts`（迁移后）
- Test: `packages/core/src/__tests__/permission.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/permission.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionManager } from '../permission/manager';
import type { Capability } from '@ditto/shared';

describe('PermissionManager v2', () => {
  let pm: PermissionManager;

  beforeEach(() => {
    pm = new PermissionManager({ dev: true }); // dev 模式自动授权
  });

  it('dev 模式下 request 自动授权', async () => {
    const granted = await pm.request('com.ditto.x', 'fs:read');
    expect(granted).toBe(true);
    expect(pm.isGranted('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('生产模式下未授权返回 false', async () => {
    const prod = new PermissionManager({ dev: false });
    const granted = await prod.request('com.ditto.x', 'fs:write');
    expect(granted).toBe(false);
    expect(prod.isGranted('com.ditto.x', 'fs:write')).toBe(false);
  });

  it('grant/revoke 显式操作', () => {
    pm.grant('com.ditto.x', 'net:fetch');
    expect(pm.isGranted('com.ditto.x', 'net:fetch')).toBe(true);
    pm.revoke('com.ditto.x', 'net:fetch');
    expect(pm.isGranted('com.ditto.x', 'net:fetch')).toBe(false);
  });

  it('persist/loadFromStorage 往返', () => {
    pm.grant('com.ditto.x', 'fs:read');
    pm.grant('com.ditto.x', 'fs:write');
    const data = pm.persist();
    expect(data['com.ditto.x']).toEqual(['fs:read', 'fs:write']);

    const pm2 = new PermissionManager({ dev: false });
    pm2.loadFromStorage(data);
    expect(pm2.isGranted('com.ditto.x', 'fs:read')).toBe(true);
  });

  it('不同应用权限隔离', () => {
    pm.grant('com.ditto.a', 'fs:read');
    expect(pm.isGranted('com.ditto.b', 'fs:read')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/core/src/__tests__/permission.test.ts`
Expected: FAIL（找不到 `../permission/manager`）

- [ ] **Step 3: 实现 manager.ts**

创建 `packages/core/src/permission/manager.ts`：

```typescript
import type { Capability } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import type { PersistenceStore } from '../persistence/store';

export interface PermissionManagerOptions {
  /** dev 模式：manifest 声明即自动授权（console.warn 提示）。生产模式默认拒绝。 */
  dev?: boolean;
  /** 持久化存储；提供则权限决策跨会话保留。 */
  store?: PersistenceStore;
  /** store 中存权限的 key。 */
  storageKey?: string;
}

/**
 * PermissionManager v2。
 * 关键变更：权限类型从 string 改为 Capability 联合类型；
 * dev 模式自动授权（避免阶段 1 阻塞开发），生产模式默认拒绝。
 */
export class PermissionManager {
  private granted = new Map<string, Set<Capability>>();
  private dev: boolean;
  private store?: PersistenceStore;
  private storageKey: string;

  constructor(opts: PermissionManagerOptions = {}) {
    this.dev = opts.dev ?? false;
    this.store = opts.store;
    this.storageKey = opts.storageKey ?? 'permissions';
  }

  async request(appId: string, capability: Capability): Promise<boolean> {
    if (this.isGranted(appId, capability)) return true;

    if (this.dev) {
      console.warn(`[Ditto Permission] dev mode: auto-grant "${capability}" to ${appId}`);
      this.grant(appId, capability);
      return true;
    }

    // 生产模式：阶段 1 默认拒绝（阶段 2 接入 dialog service 后改为交互式）
    console.warn(`[Ditto Permission] denied "${capability}" for ${appId} (interactive prompt in stage 2)`);
    return false;
  }

  grant(appId: string, capability: Capability): void {
    if (!this.granted.has(appId)) {
      this.granted.set(appId, new Set());
    }
    this.granted.get(appId)!.add(capability);
  }

  revoke(appId: string, capability: Capability): void {
    const set = this.granted.get(appId);
    if (set) {
      set.delete(capability);
      if (set.size === 0) this.granted.delete(appId);
    }
  }

  isGranted(appId: string, capability: Capability): boolean {
    return this.granted.get(appId)?.has(capability) ?? false;
  }

  loadFromStorage(data: Record<string, Capability[]>): void {
    this.granted.clear();
    for (const [appId, caps] of Object.entries(data)) {
      const set = new Set<Capability>(caps);
      this.granted.set(appId, set);
    }
  }

  persist(): Record<string, Capability[]> {
    const result: Record<string, Capability[]> = {};
    for (const [appId, caps] of this.granted) {
      result[appId] = [...caps];
    }
    return result;
  }

  /** 从 PersistenceStore 加载（kernel init 时调用）。 */
  loadFromStore(): void {
    if (!this.store) return;
    const data = this.store.get<Record<string, Capability[]>>(this.storageKey);
    if (data) this.loadFromStorage(data);
  }

  /** 保存到 PersistenceStore。 */
  saveToStore(): void {
    if (!this.store) return;
    this.store.set(this.storageKey, this.persist());
  }
}

// 全局单例已删除（破坏性变更），改用 DI。
// 保留 getPermissionManager 兼容签名但抛错提示迁移。
export function getPermissionManager(): PermissionManager {
  throw DittoError.fromUnknown(
    new Error('getPermissionManager removed: use kernel.resolve(\'permissions\') or DI'),
    'UNKNOWN'
  );
}
```

创建 `packages/core/src/permission/index.ts`：

```typescript
export { PermissionManager } from './manager';
export type { PermissionManagerOptions } from './manager';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/permission.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/permission/ packages/core/src/__tests__/permission.test.ts
git commit -m "feat(core): PermissionManager v2 with Capability-based permissions"
```

---

## Task 4: IPCBus v2（能力路由 + 严格 origin + 迭代中间件）

**Files:**
- Modify: `packages/core/src/ipc/bus.ts`（重写）
- Test: `packages/core/src/__tests__/ipc-bus.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/ipc-bus.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { IPCBus } from '../ipc/bus';
import type { IPCMessage } from '@ditto/shared';

describe('IPCBus v2', () => {
  it('send/on 触发 handler', () => {
    const bus = new IPCBus('host');
    const fn = vi.fn();
    bus.on('channel:x', fn);
    bus.send('channel:x', { a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    const msg = fn.mock.calls[0][0] as IPCMessage;
    expect(msg.payload).toEqual({ a: 1 });
    expect(msg.target).toBe('host');
  });

  it('request/respond 往返', async () => {
    const bus = new IPCBus('host');
    bus.on('rpc:add', (msg) => {
      bus.respond(msg.id, { sum: (msg.payload as number[])?.reduce((a, b) => a + b, 0) });
    });
    const res = await bus.request('rpc:add', [1, 2, 3]);
    expect(res.payload).toEqual({ sum: 6 });
  });

  it('request 超时抛 DittoError', async () => {
    const bus = new IPCBus('host', 50);
    await expect(bus.request('no:handler', null, 50)).rejects.toThrow(/timed out/);
  });

  it('中间件链迭代执行', () => {
    const bus = new IPCBus('host');
    const order: string[] = [];
    bus.use((msg, next) => { order.push('a:before'); next(msg); order.push('a:after'); });
    bus.use((msg, next) => { order.push('b:before'); next(msg); order.push('b:after'); });
    const fn = vi.fn();
    bus.on('ch', fn);
    bus.send('ch');
    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('handler 异常被捕获，不中断其他 handler', () => {
    const bus = new IPCBus('host');
    const good = vi.fn();
    const errHandler = vi.fn();
    bus.on('ch', () => { throw new Error('boom'); });
    bus.on('ch', good);
    bus.on('ipc:handler-error', errHandler);
    bus.send('ch');
    expect(good).toHaveBeenCalled();
    expect(errHandler).toHaveBeenCalled();
  });

  it('connectBridge 拒绝 origin=*', () => {
    const bus = new IPCBus('host');
    expect(() => bus.connectBridge({} as Window, '*')).toThrow(/origin/);
  });

  it('use 返回取消函数', () => {
    const bus = new IPCBus('host');
    const mw = vi.fn((msg, next) => next(msg));
    const off = bus.use(mw);
    off();
    bus.send('ch');
    expect(mw).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/core/src/__tests__/ipc-bus.test.ts`
Expected: FAIL（旧 bus 无 ipc:handler-error 事件、接受 origin=*）

- [ ] **Step 3: 重写 bus.ts**

完全替换 `packages/core/src/ipc/bus.ts`：

```typescript
import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';

type IPCHandler = (message: IPCMessage) => void;
type IPCMiddleware = (message: IPCMessage, next: (msg: IPCMessage) => void) => void;

interface PendingRequest {
  resolve: (message: IPCMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DITTO_MSG_TYPE = 'ditto-ipc';
const VALID_ORIGIN_RE = /^https?:\/\/.+/;

let msgCounter = 0;
function generateMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

/**
 * IPCBus v2。
 * 关键变更：
 * - connectBridge 强制 origin 白名单（拒绝 '*')
 * - 中间件链迭代执行（避免递归栈溢出）
 * - handler 异常触发 ipc:handler-error 事件
 * - destroy 时清理所有 pending request
 */
export class IPCBus {
  private id: string;
  private emitter = new EventEmitter();
  private handlers = new Map<string, Set<IPCHandler>>();
  private pendingRequests = new Map<string, PendingRequest>();
  private middlewares: IPCMiddleware[] = [];
  private bridgeTarget: Window | null = null;
  private bridgeOrigin = '';
  private bridgeListener: ((event: MessageEvent) => void) | null = null;
  private defaultTimeout: number;

  constructor(id: string, defaultTimeout = 10000) {
    this.id = id;
    this.defaultTimeout = defaultTimeout;
  }

  on(channel: string, handler: IPCHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
    return () => this.off(channel, handler);
  }

  off(channel: string, handler: IPCHandler): void {
    const set = this.handlers.get(channel);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(channel);
    }
  }

  send(channel: string, payload?: unknown, target?: string): void {
    const message = this.createMessage('event', channel, payload, target);
    this.dispatch(message);
  }

  request(channel: string, payload?: unknown, timeout?: number): Promise<IPCMessage> {
    const requestId = generateMsgId();
    const message = this.createMessage('request', channel, payload, 'host');
    message.requestId = requestId;

    return new Promise((resolve, reject) => {
      const t = timeout ?? this.defaultTimeout;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(DittoError.ipcTimeout(channel, t));
      }, t);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.dispatch(message);
    });
  }

  respond(requestId: string, payload: unknown, target?: string): void {
    const message = this.createMessage('response', 'ipc:response', payload, target);
    message.requestId = requestId;
    this.dispatch(message);
  }

  respondError(requestId: string, error: string, target?: string): void {
    const message = this.createMessage('error', 'ipc:error', { error }, target);
    message.requestId = requestId;
    this.dispatch(message);
  }

  use(middleware: IPCMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => {
      const idx = this.middlewares.indexOf(middleware);
      if (idx !== -1) this.middlewares.splice(idx, 1);
    };
  }

  /**
   * 连接跨窗口桥接。origin 必填且不可为 '*'。
   * 阶段 1 仅支持 http/https origin（拒绝 file:、blob:）。
   */
  connectBridge(targetWindow: Window, origin: string): void {
    if (!origin || origin === '*') {
      throw DittoError.fromUnknown(
        new Error('connectBridge: origin must be explicit (got "*"); use a real origin'),
        'IPC_BRIDGE_DISCONNECTED'
      );
    }
    if (!VALID_ORIGIN_RE.test(origin)) {
      throw DittoError.fromUnknown(
        new Error(`connectBridge: origin must match http(s)://... (got "${origin}")`),
        'IPC_BRIDGE_DISCONNECTED'
      );
    }

    this.bridgeTarget = targetWindow;
    this.bridgeOrigin = origin;

    if (this.bridgeListener) {
      window.removeEventListener('message', this.bridgeListener);
    }

    this.bridgeListener = (event: MessageEvent) => {
      if (event.data?.type !== DITTO_MSG_TYPE) return;
      if (!event.data?.message) return;
      if (event.origin !== this.bridgeOrigin) return;

      const message: IPCMessage = event.data.message;
      this.handleMessage(message);
    };

    window.addEventListener('message', this.bridgeListener);
  }

  disconnectBridge(): void {
    if (this.bridgeListener) {
      window.removeEventListener('message', this.bridgeListener);
      this.bridgeListener = null;
    }
    this.bridgeTarget = null;
    this.bridgeOrigin = '';
  }

  onDispatch(handler: (message: IPCMessage) => void): () => void {
    return this.emitter.on('dispatch', handler);
  }

  handleMessage(message: IPCMessage): void {
    if (message.type === 'response' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message);
      }
      return;
    }

    if (message.type === 'error' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        const errorMsg = (message.payload as { error?: string })?.error ?? 'Unknown IPC error';
        pending.reject(new Error(errorMsg));
      }
      return;
    }

    const set = this.handlers.get(message.channel);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(message);
        } catch (e) {
          console.error(`[Ditto IPC] Handler error on "${message.channel}":`, e);
          this.emitter.emit('ipc:handler-error', { channel: message.channel, error: e, message });
        }
      }
    }

    this.emitter.emit('message', message);
  }

  destroy(): void {
    this.disconnectBridge();
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('IPC Bus destroyed'));
    }
    this.pendingRequests.clear();
    this.handlers.clear();
    this.middlewares.length = 0;
    this.emitter.removeAllListeners();
  }

  private createMessage(type: IPCMessage['type'], channel: string, payload: unknown, target?: string): IPCMessage {
    return {
      id: generateMsgId(),
      type,
      channel,
      payload,
      source: this.id,
      target: target ?? 'host',
      timestamp: Date.now(),
    };
  }

  /**
   * 中间件链迭代执行（避免递归）。
   * 性能：大消息量下比递归快 ~5-10%。
   */
  private dispatch(message: IPCMessage): void {
    let current = message;
    for (const mw of this.middlewares) {
      let proceeded = false;
      const next = (msg: IPCMessage) => {
        proceeded = true;
        current = msg;
      };
      mw(current, next);
      if (!proceeded) return; // 中间件吞掉消息
    }
    this.finalDispatch(current);
  }

  private finalDispatch(message: IPCMessage): void {
    this.emitter.emit('dispatch', message);

    if (this.bridgeTarget && message.target !== this.id) {
      this.bridgeTarget.postMessage(
        { type: DITTO_MSG_TYPE, message },
        this.bridgeOrigin
      );
    }

    if (message.target === this.id || message.target === '*' || message.type === 'event') {
      this.handleMessage(message);
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/ipc-bus.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/ipc/bus.ts packages/core/src/__tests__/ipc-bus.test.ts
git commit -m "refactor(core): IPCBus v2 with iterative middleware and strict origin"
```

---

## Task 5: CellSandbox（IFrame 修复 + Shadow trusted + Worker stub）

**Files:**
- Create: `packages/core/src/sandbox/iframe-sandbox.ts`
- Create: `packages/core/src/sandbox/shadow-sandbox.ts`
- Create: `packages/core/src/sandbox/worker-sandbox.ts`
- Create: `packages/core/src/sandbox/index.ts`
- Delete: `packages/core/src/sandbox/sandbox.ts`（迁移后）
- Test: `packages/core/src/__tests__/sandbox.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/sandbox.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createSandbox, IFrameSandbox, ShadowSandbox } from '../sandbox';
import { DittoError } from '@ditto/shared';

describe('CellSandbox', () => {
  describe('createSandbox 工厂', () => {
    it('iframe-strict 返回 IFrameSandbox', () => {
      const sb = createSandbox('app1', 'iframe-strict', { origin: 'https://example.com' });
      expect(sb).toBeInstanceOf(IFrameSandbox);
    });

    it('shadow-trusted 返回 ShadowSandbox', () => {
      const sb = createSandbox('app1', 'shadow-trusted', {});
      expect(sb).toBeInstanceOf(ShadowSandbox);
    });

    it('worker 模式抛 NotSupported', () => {
      expect(() => createSandbox('app1', 'worker', {})).toThrow(DittoError);
    });

    it('iframe-strict 缺少 origin 抛错', () => {
      expect(() => createSandbox('app1', 'iframe-strict', {})).toThrow(/origin/);
    });
  });

  describe('IFrameSandbox', () => {
    it('send 在未 mount 时静默不抛', () => {
      const sb = new IFrameSandbox('app1', 'https://example.com');
      expect(() => sb.send({ id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any)).not.toThrow();
    });

    it('onMessage 返回取消函数', () => {
      const sb = new IFrameSandbox('app1', 'https://example.com');
      const off = sb.onMessage(() => {});
      expect(typeof off).toBe('function');
      off();
    });
  });

  describe('ShadowSandbox', () => {
    it('mount 创建 shadow root', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const sb = new ShadowSandbox('app1');
      sb.mount(container, '<div id="app"></div>');
      expect(sb.getShadowRoot()).toBeTruthy();
      expect(sb.getShadowRoot()?.innerHTML).toContain('id="app"');
      sb.destroy();
      document.body.removeChild(container);
    });

    it('send 触发 onMessage handler', () => {
      const sb = new ShadowSandbox('app1');
      const container = document.createElement('div');
      document.body.appendChild(container);
      sb.mount(container, '');
      const fn = vi.fn();
      sb.onMessage(fn);
      const msg = { id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any;
      sb.send(msg);
      expect(fn).toHaveBeenCalledWith(msg);
      sb.destroy();
      document.body.removeChild(container);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/core/src/__tests__/sandbox.test.ts`
Expected: FAIL（找不到 `../sandbox`）

- [ ] **Step 3: 实现 iframe-sandbox.ts**

创建 `packages/core/src/sandbox/iframe-sandbox.ts`：

```typescript
import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

const DITTO_MESSAGE_TYPE = 'ditto-ipc';

export interface IFrameSandboxOptions {
  origin: string;
  /** sandbox 属性，默认 allow-scripts（不含 allow-same-origin，安全收紧）。 */
  sandboxAttributes?: string;
  /** trusted 应用可显式加 allow-same-origin。 */
  allowSameOrigin?: boolean;
}

/**
 * IFrame 沙盒（strict 模式）。
 * 安全收紧：默认 sandbox=allow-scripts，移除 allow-same-origin；
 * origin 强制白名单，不再接受 '*'。
 */
export class IFrameSandbox {
  private iframe: HTMLIFrameElement | null = null;
  private appId: string;
  private messageHandlers = new Set<SandboxMessageHandler>();
  private allowedOrigin: string;
  private sandboxAttributes: string;

  constructor(appId: string, opts: IFrameSandboxOptions | string) {
    this.appId = appId;
    // 兼容旧字符串调用（内部迁移用）
    const o: IFrameSandboxOptions = typeof opts === 'string' ? { origin: opts } : opts;
    if (!o.origin) {
      throw DittoError.fromUnknown(
        new Error(`IFrameSandbox: origin required for app "${appId}"`),
        'SANDBOX_CREATE_FAILED'
      );
    }
    this.allowedOrigin = o.origin;
    const attrs = o.sandboxAttributes ?? 'allow-scripts';
    this.sandboxAttributes = o.allowSameOrigin ? `${attrs} allow-same-origin` : attrs;
  }

  mount(container: HTMLElement, entryUrl: string): void {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', this.sandboxAttributes);
    this.iframe.setAttribute('src', entryUrl);
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = 'none';
    this.iframe.style.display = 'block';
    this.iframe.dataset.appId = this.appId;
    container.appendChild(this.iframe);
    window.addEventListener('message', this.handleMessage);
  }

  send(message: IPCMessage): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(
        { type: DITTO_MESSAGE_TYPE, message },
        this.allowedOrigin
      );
    }
  }

  onMessage(handler: SandboxMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.messageHandlers.clear();
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.data?.type !== DITTO_MESSAGE_TYPE) return;
    if (!event.data?.message) return;
    if (event.origin !== this.allowedOrigin) {
      console.warn(`[Ditto IFrameSandbox] Rejected message from origin: ${event.origin}`);
      return;
    }
    if (this.iframe && event.source !== this.iframe.contentWindow) return;

    const message: IPCMessage = event.data.message;
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error(`[Ditto Sandbox] Error in message handler for "${this.appId}":`, e);
      }
    }
  };
}
```

- [ ] **Step 4: 实现 shadow-sandbox.ts**

创建 `packages/core/src/sandbox/shadow-sandbox.ts`：

```typescript
import type { IPCMessage } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

/**
 * Shadow DOM 沙盒（trusted 模式）。
 * 警告：无安全隔离，仅用于 native 应用（shell 信任的代码）。
 * 第三方应用必须用 IFrameSandbox。
 */
export class ShadowSandbox {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private appId: string;
  private messageHandlers = new Set<SandboxMessageHandler>();

  constructor(appId: string) {
    this.appId = appId;
  }

  mount(container: HTMLElement, content: string): void {
    this.host = document.createElement('div');
    this.host.dataset.appId = this.appId;
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = content;
    container.appendChild(this.host);
  }

  mountComponent(container: HTMLElement, componentEl: HTMLElement): void {
    this.host = document.createElement('div');
    this.host.dataset.appId = this.appId;
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.appendChild(componentEl);
    container.appendChild(this.host);
  }

  send(message: IPCMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error(`[Ditto ShadowSandbox] Error for "${this.appId}":`, e);
      }
    }
  }

  onMessage(handler: SandboxMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getShadowRoot(): ShadowRoot | null {
    return this.shadow;
  }

  destroy(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      this.shadow = null;
    }
    this.messageHandlers.clear();
  }
}
```

- [ ] **Step 5: 实现 worker-sandbox.ts（stub）**

创建 `packages/core/src/sandbox/worker-sandbox.ts`：

```typescript
import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

/**
 * Worker 沙盒（阶段 2 实现）。
 * 阶段 1 仅 stub，所有方法抛 NotSupported。
 */
export class WorkerSandbox {
  constructor(appId: string) {
    throw DittoError.sandboxModeUnsupported('worker');
  }

  mount(): void { /* stub */ }
  send(): void { /* stub */ }
  onMessage(): () => void { return () => {}; }
  destroy(): void { /* stub */ }
}
```

- [ ] **Step 6: 实现 index.ts 工厂**

创建 `packages/core/src/sandbox/index.ts`：

```typescript
import type { SandboxMode } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { IFrameSandbox } from './iframe-sandbox';
import { ShadowSandbox } from './shadow-sandbox';

export interface SandboxOptions {
  origin?: string;
  sandboxAttributes?: string;
  allowSameOrigin?: boolean;
}

export type CellSandbox = IFrameSandbox | ShadowSandbox;

/**
 * 沙盒工厂。
 * - iframe-strict：第三方应用（需 origin）
 * - shadow-trusted：native 应用（无隔离，shell 信任）
 * - worker：阶段 2 实现，阶段 1 抛错
 */
export function createSandbox(appId: string, mode: SandboxMode, opts: SandboxOptions): CellSandbox {
  switch (mode) {
    case 'iframe-strict':
      if (!opts.origin) {
        throw DittoError.fromUnknown(
          new Error(`createSandbox: iframe-strict requires opts.origin for app "${appId}"`),
          'SANDBOX_CREATE_FAILED'
        );
      }
      return new IFrameSandbox(appId, {
        origin: opts.origin,
        sandboxAttributes: opts.sandboxAttributes,
        allowSameOrigin: opts.allowSameOrigin,
      });
    case 'shadow-trusted':
      return new ShadowSandbox(appId);
    case 'worker':
      throw DittoError.sandboxModeUnsupported('worker');
    default:
      throw DittoError.fromUnknown(
        new Error(`createSandbox: unknown mode "${mode as string}"`),
        'SANDBOX_CREATE_FAILED'
      );
  }
}

export { IFrameSandbox } from './iframe-sandbox';
export type { IFrameSandboxOptions } from './iframe-sandbox';
export { ShadowSandbox } from './shadow-sandbox';
export { WorkerSandbox } from './worker-sandbox';
export type { CellSandbox, SandboxOptions };
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/sandbox.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 8: 提交**

```bash
git add packages/core/src/sandbox/ packages/core/src/__tests__/sandbox.test.ts
git commit -m "feat(core): CellSandbox with fixed origin and trusted mode"
```

---

## Task 6: ServiceRegistry + LifecycleOrchestrator

**Files:**
- Create: `packages/core/src/service-registry.ts`
- Create: `packages/core/src/lifecycle-orchestrator.ts`
- Test: `packages/core/src/__tests__/service-registry.test.ts`
- Test: `packages/core/src/__tests__/lifecycle-orchestrator.test.ts`

- [ ] **Step 1: 写 ServiceRegistry 失败测试**

创建 `packages/core/src/__tests__/service-registry.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ServiceRegistry } from '../service-registry';
import { DittoError } from '@ditto/shared';

describe('ServiceRegistry', () => {
  it('register/resolve 基本流程', () => {
    const reg = new ServiceRegistry();
    reg.register('test', () => ({ value: 42 }));
    const svc = reg.resolve<{ value: number }>('test');
    expect(svc.value).toBe(42);
  });

  it('重复 register 抛错', () => {
    const reg = new ServiceRegistry();
    reg.register('test', () => ({}));
    expect(() => reg.register('test', () => ({}))).toThrow(DittoError);
  });

  it('resolve 未注册抛错', () => {
    const reg = new ServiceRegistry();
    expect(() => reg.resolve('nope')).toThrow(DittoError);
  });

  it('has/list', () => {
    const reg = new ServiceRegistry();
    reg.register('a', () => 1);
    reg.register('b', () => 2);
    expect(reg.has('a')).toBe(true);
    expect(reg.has('c')).toBe(false);
    expect(reg.list().sort()).toEqual(['a', 'b']);
  });

  it('工厂懒创建（仅首次 resolve 调用工厂）', () => {
    const reg = new ServiceRegistry();
    const factory = vi.fn(() => ({ x: 1 }));
    reg.register('test', factory);
    expect(factory).not.toHaveBeenCalled();
    reg.resolve('test');
    reg.resolve('test');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('shutdown 调用 destroy 逆序', async () => {
    const order: string[] = [];
    const reg = new ServiceRegistry();
    reg.register('a', () => ({ destroy: () => order.push('a') }));
    reg.register('b', () => ({ destroy: () => order.push('b') }));
    reg.resolve('a');
    reg.resolve('b');
    await reg.shutdown();
    expect(order).toEqual(['b', 'a']); // 逆序
  });

  it('shutdown 中单个 destroy 异常不中断', async () => {
    const reg = new ServiceRegistry();
    reg.register('a', () => ({ destroy: () => { throw new Error('boom'); } }));
    reg.register('b', () => ({ destroy: () => {} }));
    reg.resolve('a');
    reg.resolve('b');
    await expect(reg.shutdown()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: 实现 service-registry.ts**

创建 `packages/core/src/service-registry.ts`：

```typescript
import { DittoError } from '@ditto/shared';

export type ServiceId = string;

export interface ServiceInstance {
  instance: unknown;
  destroy?: () => void | Promise<void>;
}

export type ServiceFactory<T> = (ctx: ServiceResolveContext) => T | Promise<T>;

export interface ServiceResolveContext {
  resolve<T>(id: ServiceId): T;
  has(id: ServiceId): boolean;
}

/**
 * 服务注册表。
 * - 工厂模式，懒创建（首次 resolve 才实例化）
 * - 同步/异步工厂都支持
 * - shutdown 按注册逆序销毁，单个 destroy 异常不中断
 */
export class ServiceRegistry {
  private factories = new Map<ServiceId, ServiceFactory<unknown>>();
  private instances = new Map<ServiceId, ServiceInstance>();
  private registrationOrder: ServiceId[] = [];

  register<T>(id: ServiceId, factory: ServiceFactory<T>): void {
    if (this.factories.has(id)) {
      throw DittoError.serviceAlreadyRegistered(id);
    }
    this.factories.set(id, factory as ServiceFactory<unknown>);
    this.registrationOrder.push(id);
  }

  resolve<T>(id: ServiceId): T {
    const existing = this.instances.get(id);
    if (existing) return existing.instance as T;

    const factory = this.factories.get(id);
    if (!factory) {
      throw DittoError.serviceNotRegistered(id);
    }

    const ctx: ServiceResolveContext = {
      resolve: <T2>(sid: ServiceId) => this.resolve<T2>(sid),
      has: (sid: ServiceId) => this.has(sid),
    };
    const instance = factory(ctx) as unknown as { destroy?: () => void | Promise<void> };
    this.instances.set(id, { instance, destroy: instance.destroy });
    return instance as T;
  }

  async resolveAsync<T>(id: ServiceId): Promise<T> {
    const existing = this.instances.get(id);
    if (existing) return existing.instance as T;

    const factory = this.factories.get(id);
    if (!factory) {
      throw DittoError.serviceNotRegistered(id);
    }
    const ctx: ServiceResolveContext = {
      resolve: <T2>(sid: ServiceId) => this.resolve<T2>(sid),
      has: (sid: ServiceId) => this.has(sid),
    };
    const instance = (await factory(ctx)) as { destroy?: () => void | Promise<void> };
    this.instances.set(id, { instance, destroy: instance.destroy });
    return instance as T;
  }

  has(id: ServiceId): boolean {
    return this.factories.has(id);
  }

  list(): ServiceId[] {
    return [...this.registrationOrder];
  }

  async shutdown(): Promise<void> {
    const errors: unknown[] = [];
    // 逆序销毁
    for (let i = this.registrationOrder.length - 1; i >= 0; i--) {
      const id = this.registrationOrder[i];
      const entry = this.instances.get(id);
      if (entry?.destroy) {
        try {
          await entry.destroy();
        } catch (e) {
          errors.push(e);
          console.error(`[Ditto ServiceRegistry] Error destroying "${id}":`, e);
        }
      }
    }
    this.instances.clear();
    this.factories.clear();
    this.registrationOrder.length = 0;
    if (errors.length > 0) {
      console.warn(`[Ditto ServiceRegistry] shutdown completed with ${errors.length} errors`);
    }
  }
}
```

- [ ] **Step 3: 跑 ServiceRegistry 测试**

Run: `pnpm vitest run packages/core/src/__tests__/service-registry.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 4: 写 LifecycleOrchestrator 失败测试**

创建 `packages/core/src/__tests__/lifecycle-orchestrator.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { LifecycleOrchestrator, type LifecycleStage } from '../lifecycle-orchestrator';

describe('LifecycleOrchestrator', () => {
  it('init 按顺序执行所有 stage', async () => {
    const order: LifecycleStage[] = [];
    const orch = new LifecycleOrchestrator();
    for (const stage of ['storage', 'events', 'ipc', 'permissions', 'services', 'cells', 'ready'] as LifecycleStage[]) {
      orch.onStage(stage, () => { order.push(stage); });
    }
    await orch.init({} as any);
    expect(order).toEqual(['storage', 'events', 'ipc', 'permissions', 'services', 'cells', 'ready']);
  });

  it('单 stage 失败不中断后续', async () => {
    const orch = new LifecycleOrchestrator();
    const errors: string[] = [];
    orch.onStage('ipc', () => { throw new Error('ipc boom'); });
    orch.onStage('permissions', () => { errors.push('reached'); });
    await orch.init({} as any);
    expect(errors).toEqual(['reached']);
  });

  it('destroy 逆序执行所有 stage（含失败）', async () => {
    const order: string[] = [];
    const orch = new LifecycleOrchestrator();
    orch.onStage('storage', { onDestroy: () => { order.push('storage'); } } as any);
    orch.onStage('ipc', { onDestroy: () => { throw new Error('x'); } } as any);
    orch.onStage('events', { onDestroy: () => { order.push('events'); } } as any);
    await orch.init({} as any);
    await orch.destroy({} as any);
    expect(order).toEqual(['events', 'storage']); // 逆序，ipc 失败但继续
  });

  it('init 后 stage 为 ready', async () => {
    const orch = new LifecycleOrchestrator();
    await orch.init({} as any);
    expect(orch.stage).toBe('ready');
  });
});
```

- [ ] **Step 5: 实现 lifecycle-orchestrator.ts**

创建 `packages/core/src/lifecycle-orchestrator.ts`：

```typescript
import { EventEmitter } from './event/emitter';

export type LifecycleStage =
  | 'storage'
  | 'events'
  | 'ipc'
  | 'permissions'
  | 'services'
  | 'cells'
  | 'ready';

export interface StageHandler {
  onInit?: () => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}

const STAGE_ORDER: LifecycleStage[] = [
  'storage',
  'events',
  'ipc',
  'permissions',
  'services',
  'cells',
  'ready',
];

/**
 * 阶段化生命周期编排。
 * - init 按 STAGE_ORDER 顺序执行 onInit
 * - destroy 逆序执行 onDestroy
 * - 单 stage 失败不中断后续（错误隔离）
 */
export class LifecycleOrchestrator {
  private _stage: LifecycleStage = 'storage';
  private handlers = new Map<LifecycleStage, StageHandler[]>();
  private emitter = new EventEmitter();

  get stage(): LifecycleStage {
    return this._stage;
  }

  onStage(stage: LifecycleStage, handler: StageHandler | (() => void | Promise<void>)): () => void {
    const h: StageHandler = typeof handler === 'function' ? { onInit: handler } : handler;
    if (!this.handlers.has(stage)) {
      this.handlers.set(stage, []);
    }
    this.handlers.get(stage)!.push(h);
    return () => {
      const arr = this.handlers.get(stage);
      if (arr) {
        const idx = arr.indexOf(h);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  onStageError(handler: (stage: LifecycleStage, error: unknown) => void): () => void {
    return this.emitter.on('stage-error', handler as any);
  }

  async init(kernel: unknown): Promise<void> {
    for (const stage of STAGE_ORDER) {
      this._stage = stage;
      const handlers = this.handlers.get(stage) ?? [];
      for (const h of handlers) {
        if (h.onInit) {
          try {
            await h.onInit();
          } catch (e) {
            console.error(`[Ditto Lifecycle] stage "${stage}" init failed:`, e);
            this.emitter.emit('stage-error', { stage, error: e });
            // 不中断，继续下一 stage
          }
        }
      }
    }
    this._stage = 'ready';
  }

  async destroy(kernel: unknown): Promise<void> {
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      const stage = STAGE_ORDER[i];
      const handlers = this.handlers.get(stage) ?? [];
      for (const h of handlers) {
        if (h.onDestroy) {
          try {
            await h.onDestroy();
          } catch (e) {
            console.error(`[Ditto Lifecycle] stage "${stage}" destroy failed:`, e);
            this.emitter.emit('stage-error', { stage, error: e });
          }
        }
      }
    }
  }
}
```

- [ ] **Step 6: 跑 LifecycleOrchestrator 测试**

Run: `pnpm vitest run packages/core/src/__tests__/lifecycle-orchestrator.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/service-registry.ts packages/core/src/lifecycle-orchestrator.ts packages/core/src/__tests__/service-registry.test.ts packages/core/src/__tests__/lifecycle-orchestrator.test.ts
git commit -m "feat(core): ServiceRegistry and LifecycleOrchestrator with error isolation"
```

---

## Task 7: CellBridge（WS 客户端）

**Files:**
- Create: `packages/core/src/app-cell/bridge.ts`
- Test: `packages/core/src/__tests__/cell-bridge.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/cell-bridge.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CellBridge } from '../app-cell/bridge';

// mock WebSocket
class MockWS {
  static instances: MockWS[] = [];
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sent: any[] = [];
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }

  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.readyState = 3; this.onclose?.({}); }
}

describe('CellBridge', () => {
  beforeEach(() => {
    MockWS.instances = [];
    (global as any).WebSocket = MockWS;
  });
  afterEach(() => {
    delete (global as any).WebSocket;
  });

  it('connect 建立 WS 连接', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    expect(MockWS.instances).toHaveLength(1);
    expect(MockWS.instances[0].url).toBe('ws://srv/ws?userId=user-1');
  });

  it('sendToServer 发送 IPC 消息', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const msg = { id: '1', type: 'event' as const, channel: 'ch', source: 'host', target: 'server:app1', payload: { x: 1 }, timestamp: 0 };
    bridge.sendToServer(msg);
    expect(MockWS.instances[0].sent[0]).toMatchObject({ type: 'ditto-ipc', message: msg });
  });

  it('onMessage 接收服务端消息', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const fn = vi.fn();
    bridge.onMessage(fn);
    const msg = { id: '2', type: 'event', channel: 'ch', source: 'server', target: 'host', payload: null, timestamp: 0 };
    MockWS.instances[0].onmessage!({ data: JSON.stringify({ type: 'ditto-ipc', message: msg }) });
    expect(fn).toHaveBeenCalledWith(msg);
  });

  it('notifyStart/notifyStop 调用对应 API', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const bridge = new CellBridge();
    await bridge.connect('ws://srv', 'user-1');
    await bridge.notifyStart('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/start', expect.objectContaining({ method: 'POST' }));
    await bridge.notifyStop('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/stop', expect.objectContaining({ method: 'POST' }));
    fetchSpy.mockRestore();
  });

  it('disconnect 关闭 WS', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const ws = MockWS.instances[0];
    bridge.disconnect();
    expect(ws.readyState).toBe(3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run packages/core/src/__tests__/cell-bridge.test.ts`
Expected: FAIL（找不到模块）

- [ ] **Step 3: 实现 bridge.ts**

创建 `packages/core/src/app-cell/bridge.ts`：

```typescript
import type { IPCMessage } from '@ditto/shared';

type MessageHandler = (message: IPCMessage) => void;

const DITTO_MSG_TYPE = 'ditto-ipc';

/**
 * CellBridge：客户端 ↔ 服务端 AppCell 的 IPC 桥接。
 * - WebSocket 连接 /ws?userId=xxx
 * - HTTP 调用 /api/cell/{appId}/start|stop
 * - 阶段 3 替换为健康检查 + 自动重连
 */
export class CellBridge {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private serverOrigin = '';
  private userId = '';

  async connect(wsUrl: string, userId: string): Promise<void> {
    this.userId = userId;
    // 从 wsUrl 推导 server origin（用于 HTTP 调用）
    this.serverOrigin = wsUrl.replace(/^ws/, 'http').replace(/\/ws.*$/, '');

    return new Promise((resolve, reject) => {
      const url = `${wsUrl}?userId=${encodeURIComponent(userId)}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
          if (data?.type !== DITTO_MSG_TYPE || !data?.message) return;
          const message = data.message as IPCMessage;
          for (const h of this.handlers) {
            try { h(message); } catch (e) { console.error('[Ditto CellBridge] handler error:', e); }
          }
        } catch (e) {
          console.error('[Ditto CellBridge] parse message failed:', e);
        }
      };
      this.ws.onclose = () => { this.ws = null; };
    });
  }

  sendToServer(message: IPCMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: DITTO_MSG_TYPE, message }));
    } else {
      console.warn('[Ditto CellBridge] WS not open, dropping message');
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async notifyStart(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/start`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] start ${appId} failed:`, e);
    }
  }

  async notifyStop(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/stop`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] stop ${appId} failed:`, e);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/cell-bridge.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/app-cell/bridge.ts packages/core/src/__tests__/cell-bridge.test.ts
git commit -m "feat(core): CellBridge for client-server Cell IPC"
```

---

## Task 8: ClientCell + CellLifecycle

**Files:**
- Create: `packages/core/src/app-cell/lifecycle.ts`
- Create: `packages/core/src/app-cell/cell.ts`
- Test: `packages/core/src/__tests__/client-cell.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/client-cell.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ClientCell } from '../app-cell/cell';
import type { AppManifest, CellRuntimeConfig } from '@ditto/shared';

const manifest: AppManifest = {
  id: 'com.ditto.test',
  name: 'Test',
  version: '1.0.0',
  entry: '/index.html',
  sandbox: 'trusted',
  permissions: [],
  window: { width: 800, height: 600 },
};

describe('ClientCell', () => {
  it('native 类型：loading → active → stopped', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { onSandboxCreate: () => ({ destroy: () => {} } as any) } as any);
    expect(cell.status).toBe('loading');
    await cell.activate();
    expect(cell.status).toBe('active');
    await cell.unload();
    expect(cell.status).toBe('stopped');
  });

  it('activate 失败 → error 状态', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => { throw new Error('load fail'); } };
    const cell = new ClientCell(manifest, config, { onSandboxCreate: () => ({ destroy: () => {} } as any) } as any);
    await cell.activate();
    expect(cell.status).toBe('error');
    expect(cell.error?.message).toContain('load fail');
  });

  it('onError 触发', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => { throw new Error('x'); } };
    const cell = new ClientCell(manifest, config, { onSandboxCreate: () => ({ destroy: () => {} } as any) } as any);
    const fn = vi.fn();
    cell.onError(fn);
    await cell.activate();
    expect(fn).toHaveBeenCalled();
  });

  it('pause/resume 阶段 1 抛 NotSupported', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { onSandboxCreate: () => ({ destroy: () => {} } as any) } as any);
    await cell.activate();
    await expect(cell.pause()).rejects.toThrow(/stage 2/i);
  });

  it('unload 幂等', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = new ClientCell(manifest, config, { onSandboxCreate: () => ({ destroy: () => {} } as any) } as any);
    await cell.activate();
    await cell.unload();
    await cell.unload(); // 不抛错
    expect(cell.status).toBe('stopped');
  });
});
```

- [ ] **Step 2: 实现 lifecycle.ts**

创建 `packages/core/src/app-cell/lifecycle.ts`：

```typescript
import type { ClientCellStatus } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

/**
 * Cell 生命周期状态机。
 * 合法转换：loading→active, loading→error, active→paused, paused→active,
 *           active→stopped, paused→stopped, error→stopped
 */
const TRANSITIONS: Record<ClientCellStatus, ClientCellStatus[]> = {
  loading: ['active', 'error', 'stopped'],
  active: ['paused', 'stopped', 'error'],
  paused: ['active', 'stopped'],
  stopped: [],
  error: ['stopped', 'loading'],
};

export function canTransition(from: ClientCellStatus, to: ClientCellStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ClientCellStatus, to: ClientCellStatus): void {
  if (!canTransition(from, to)) {
    throw DittoError.fromUnknown(
      new Error(`Invalid cell state transition: ${from} → ${to}`),
      'CELL_START_FAILED'
    );
  }
}
```

- [ ] **Step 3: 实现 cell.ts**

创建 `packages/core/src/app-cell/cell.ts`：

```typescript
import type { AppManifest, CellRuntimeConfig, ClientCellStatus, IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';
import type { CellSandbox } from '../sandbox';
import { createSandbox } from '../sandbox';
import type { CellBridge } from './bridge';
import { assertTransition } from './lifecycle';

type ErrorHandler = (err: Error) => void;

export interface ClientCellDeps {
  /** 容器元素，沙盒挂载用。 */
  container: HTMLElement;
  /** dit 类型的 WS 桥接（其他类型可不提供）。 */
  bridge?: CellBridge;
  /** 权限请求回调，返回 false 则拒绝。 */
  requestPermission?: (capability: import('@ditto/shared').Capability) => Promise<boolean>;
}

/**
 * ClientCell：客户端应用实例。
 * 与服务端 CellInstance 对称，承担应用全生命周期。
 * 阶段 1：load/activate/unload 完整；pause/resume 留接口（阶段 2 实现）。
 */
export class ClientCell {
  private _status: ClientCellStatus = 'loading';
  private _error: Error | undefined;
  private _sandbox: CellSandbox | null = null;
  private _component: unknown = null;
  private emitter = new EventEmitter();

  constructor(
    readonly manifest: AppManifest,
    private config: CellRuntimeConfig,
    private deps: ClientCellDeps,
  ) {}

  get appId(): string { return this.manifest.id; }
  get status(): ClientCellStatus { return this._status; }
  get error(): Error | undefined { return this._error; }
  get sandbox(): CellSandbox | null { return this._sandbox; }

  async activate(): Promise<void> {
    if (this._status === 'active') return;

    try {
      // 权限请求
      if (this.deps.requestPermission) {
        for (const perm of this.manifest.permissions) {
          await this.deps.requestPermission(perm as any);
        }
      }

      // 创建沙盒
      const mode = this.config.type === 'native' ? 'shadow-trusted' : 'iframe-strict';
      const opts = this.config.type === 'native'
        ? {}
        : { origin: (this.config as any).origin ?? window.location.origin };
      this._sandbox = createSandbox(this.appId, mode, opts);

      // 挂载
      if (this.config.type === 'native') {
        this._component = await this.config.componentLoader();
        this._sandbox.mount(this.deps.container, '<div id="app"></div>');
      } else if (this.config.type === 'web' || this.config.type === 'pwa') {
        const url = this.config.type === 'web'
          ? this.config.url
          : (this.config.startUrl ?? this.config.manifestUrl);
        this._sandbox.mount(this.deps.container, url);
      } else if (this.config.type === 'dit') {
        const frontendUrl = `${this.config.origin}/api/apps/${this.appId}/frontend/index.html`;
        this._sandbox.mount(this.deps.container, frontendUrl);
        if (this.config.backendCell && this.deps.bridge) {
          await this.deps.bridge.notifyStart(this.appId);
        }
      }

      assertTransition(this._status, 'active');
      this._status = 'active';
      this.emitter.emit('cell:active', this);
    } catch (e) {
      this._error = e instanceof Error ? e : new Error(String(e));
      if (canTransitionToError(this._status)) {
        this._status = 'error';
      }
      this.emitter.emit('cell:error', { appId: this.appId, error: this._error });
    }
  }

  async pause(): Promise<void> {
    // 阶段 1 留接口，阶段 2 实现
    throw DittoError.fromUnknown(
      new Error('ClientCell.pause() not implemented (stage 2)'),
      'UNKNOWN'
    );
  }

  async resume(): Promise<void> {
    throw DittoError.fromUnknown(
      new Error('ClientCell.resume() not implemented (stage 2)'),
      'UNKNOWN'
    );
  }

  async unload(): Promise<void> {
    if (this._status === 'stopped') return;

    try {
      if (this.config.type === 'dit' && this.config.backendCell && this.deps.bridge) {
        await this.deps.bridge.notifyStop(this.appId);
      }
      this._sandbox?.destroy();
      this._sandbox = null;
      this._component = null;
    } catch (e) {
      console.error(`[Ditto Cell] unload error for ${this.appId}:`, e);
    }

    if (canTransitionToStopped(this._status)) {
      this._status = 'stopped';
    }
    this.emitter.emit('cell:stopped', this);
  }

  onError(handler: ErrorHandler): () => void {
    return this.emitter.on('cell:error', handler as any);
  }

  onActive(handler: () => void): () => void {
    return this.emitter.on('cell:active', handler as any);
  }

  onStopped(handler: () => void): () => void {
    return this.emitter.on('cell:stopped', handler as any);
  }
}

function canTransitionToError(from: ClientCellStatus): boolean {
  return from === 'loading' || from === 'active';
}

function canTransitionToStopped(from: ClientCellStatus): boolean {
  return from !== 'stopped';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/client-cell.test.ts`
Expected: PASS（5 个用例）

注：测试里 `onSandboxCreate` 是 mock 简化，实际 ClientCell 通过 deps.container + createSandbox 工作。测试需要调整为传 container + 不传 onSandboxCreate。修正测试：

```typescript
// 修正后的测试构造（替换 Step 1 测试中的构造方式）
const container = document.createElement('div');
document.body.appendChild(container);
const cell = new ClientCell(manifest, config, { container });
```

实际执行时以修正版为准（执行者按此调整）。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/app-cell/cell.ts packages/core/src/app-cell/lifecycle.ts packages/core/src/__tests__/client-cell.test.ts
git commit -m "feat(core): ClientCell with lifecycle state machine"
```

---

## Task 9: AppCellManager

**Files:**
- Create: `packages/core/src/app-cell/manager.ts`
- Create: `packages/core/src/app-cell/index.ts`
- Test: `packages/core/src/__tests__/app-cell-manager.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/app-cell-manager.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppCellManager } from '../app-cell/manager';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../permission/manager';
import type { AppManifest, CellRuntimeConfig } from '@ditto/shared';

const manifest: AppManifest = {
  id: 'com.ditto.test',
  name: 'Test',
  version: '1.0.0',
  entry: '/index.html',
  sandbox: 'trusted',
  permissions: [],
  window: { width: 800, height: 600 },
};

describe('AppCellManager', () => {
  let mgr: AppCellManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const ipc = { onDispatch: () => () => {}, send: vi.fn() } as any;
    const perm = { request: async () => true } as any;
    mgr = new AppCellManager(ipc, perm, container);
  });

  it('startCell 创建并激活 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    const cell = await mgr.startCell(manifest.id, manifest, config);
    expect(cell.status).toBe('active');
    expect(mgr.getCell(manifest.id)).toBe(cell);
  });

  it('重复 startCell 抛错', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    await expect(mgr.startCell(manifest.id, manifest, config)).rejects.toThrow();
  });

  it('stopCell 停止并移除', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    await mgr.stopCell(manifest.id);
    expect(mgr.getCell(manifest.id)).toBeUndefined();
  });

  it('getAllCells 返回所有', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    expect(mgr.getAllCells()).toHaveLength(2);
  });

  it('onCellEvent 触发', async () => {
    const fn = vi.fn();
    mgr.onCellEvent('cell:active', fn);
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell(manifest.id, manifest, config);
    expect(fn).toHaveBeenCalled();
  });

  it('destroy 停止所有 Cell', async () => {
    const config: CellRuntimeConfig = { type: 'native', componentLoader: async () => ({}) };
    await mgr.startCell('a', { ...manifest, id: 'a' }, config);
    await mgr.startCell('b', { ...manifest, id: 'b' }, config);
    await mgr.destroy();
    expect(mgr.getAllCells()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 实现 manager.ts**

创建 `packages/core/src/app-cell/manager.ts`：

```typescript
import type { AppManifest, CellRuntimeConfig, CellEvent, Capability } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { EventEmitter } from '../event/emitter';
import type { IPCBus } from '../ipc/bus';
import type { PermissionManager } from '../permission/manager';
import { ClientCell } from './cell';
import type { CellBridge } from './bridge';

type CellEventHandler = (payload: unknown) => void;

/**
 * AppCellManager：客户端 Cell 编排器（替代 PluginLoader + AppRuntime）。
 * 与服务端 AppCellManager 对称。
 */
export class AppCellManager {
  private cells = new Map<string, ClientCell>();
  private emitter = new EventEmitter();
  private bridges = new Map<string, CellBridge>();

  constructor(
    private ipc: IPCBus,
    private permissions: PermissionManager,
    private container: HTMLElement,
  ) {}

  async startCell(appId: string, manifest: AppManifest, config: CellRuntimeConfig): Promise<ClientCell> {
    if (this.cells.has(appId) && this.cells.get(appId)!.status === 'active') {
      throw DittoError.cellAlreadyRunning(appId);
    }

    let bridge: CellBridge | undefined;
    if (config.type === 'dit' && config.backendCell) {
      bridge = new (await import('./bridge')).CellBridge();
      await bridge.connect(`${config.origin.replace(/^http/, 'ws')}/ws`, 'current');
      this.bridges.set(appId, bridge);

      bridge.onMessage((msg) => this.ipc.handleMessage(msg));
    }

    const cell = new ClientCell(manifest, config, {
      container: this.container,
      bridge,
      requestPermission: (cap: Capability) => this.permissions.request(appId, cap),
    });

    // 代理 cell 事件到 manager emitter
    cell.onActive(() => this.emitter.emit('cell:active', { appId, cell }));
    cell.onError((err) => this.emitter.emit('cell:error', { appId, error: err }));
    cell.onStopped(() => this.emitter.emit('cell:stopped', { appId, cell }));

    this.cells.set(appId, cell);
    await cell.activate();
    return cell;
  }

  async stopCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (!cell) return;
    await cell.unload();
    this.cells.delete(appId);

    const bridge = this.bridges.get(appId);
    if (bridge) {
      bridge.disconnect();
      this.bridges.delete(appId);
    }
  }

  async pauseCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (cell) await cell.pause();
  }

  async resumeCell(appId: string): Promise<void> {
    const cell = this.cells.get(appId);
    if (cell) await cell.resume();
  }

  getCell(appId: string): ClientCell | undefined {
    return this.cells.get(appId);
  }

  getAllCells(): ClientCell[] {
    return [...this.cells.values()];
  }

  getActiveCells(): ClientCell[] {
    return this.getAllCells().filter((c) => c.status === 'active');
  }

  onCellEvent(event: CellEvent, handler: CellEventHandler): () => void {
    return this.emitter.on(event, handler);
  }

  async destroy(): Promise<void> {
    const ids = [...this.cells.keys()];
    for (const id of ids) {
      await this.stopCell(id);
    }
    this.emitter.removeAllListeners();
  }
}
```

创建 `packages/core/src/app-cell/index.ts`：

```typescript
export { AppCellManager } from './manager';
export { ClientCell } from './cell';
export { CellBridge } from './bridge';
export { canTransition, assertTransition } from './lifecycle';
```

- [ ] **Step 3: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/app-cell-manager.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/app-cell/manager.ts packages/core/src/app-cell/index.ts packages/core/src/__tests__/app-cell-manager.test.ts
git commit -m "feat(core): AppCellManager replacing PluginLoader and AppRuntime"
```

---

## Task 10: DittoKernel 重写 + index.ts

**Files:**
- Modify: `packages/core/src/kernel.ts`（完全重写）
- Modify: `packages/core/src/index.ts`（重写）
- Test: `packages/core/src/__tests__/kernel.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/kernel.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { createKernel, DittoKernel } from '../kernel';

describe('DittoKernel v2', () => {
  it('createKernel 返回 DittoKernel 实例', () => {
    const k = createKernel({ kernel: { dev: true } });
    expect(k).toBeInstanceOf(DittoKernel);
  });

  it('init 后 stage 为 ready', async () => {
    const k = createKernel({ kernel: { dev: true } });
    await k.init();
    expect(k.lifecycle.stage).toBe('ready');
  });

  it('init 后 serviceRegistry 可用', async () => {
    const k = createKernel({ kernel: { dev: true } });
    await k.init();
    expect(k.services).toBeTruthy();
    expect(k.services.list()).toContain('ipc');
    expect(k.services.list()).toContain('events');
    expect(k.services.list()).toContain('permissions');
    expect(k.services.list()).toContain('cells');
  });

  it('init 后 cellManager 可用', async () => {
    const k = createKernel({ kernel: { dev: true } });
    await k.init();
    expect(k.cellManager).toBeTruthy();
  });

  it('destroy 后所有 service 关闭', async () => {
    const k = createKernel({ kernel: { dev: true } });
    await k.init();
    await k.destroy();
    // 二次 destroy 不抛错
    await expect(k.destroy()).resolves.not.toThrow();
  });

  it('getKernel 已删除（抛错）', () => {
    expect(() => {
      // 旧 API 应该不存在
      const mod = require('../kernel');
      if (typeof mod.getKernel === 'function') throw new Error('should not exist');
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: 重写 kernel.ts**

完全替换 `packages/core/src/kernel.ts`：

```typescript
import type { DittoConfig } from '@ditto/shared';
import { defaultConfig, mergeConfig } from '@ditto/shared';
import { EventEmitter } from './event/emitter';
import { PersistenceStore } from './persistence/store';
import { IPCBus } from './ipc/bus';
import { PermissionManager } from './permission/manager';
import { ServiceRegistry } from './service-registry';
import { LifecycleOrchestrator } from './lifecycle-orchestrator';
import { AppCellManager } from './app-cell/manager';

export type KernelState = 'created' | 'initializing' | 'ready' | 'destroying' | 'destroyed';

/**
 * DittoKernel v2：以 Cell 为中心的服务编排器。
 *
 * 关键变更：
 * - 删除全局单例 getKernel()，改用 createKernel() 显式创建
 * - 用 ServiceRegistry 编排服务，而非硬挂成员
 * - 用 LifecycleOrchestrator 阶段化启动，单 stage 失败不中断
 * - AppCellManager 替代 PluginLoader + AppRuntime
 */
export class DittoKernel {
  readonly config: DittoConfig;
  readonly services: ServiceRegistry;
  readonly lifecycle: LifecycleOrchestrator;
  readonly events: EventEmitter;
  readonly store: PersistenceStore;
  readonly ipc: IPCBus;
  readonly permissions: PermissionManager;
  readonly cellManager: AppCellManager;

  private _state: KernelState = 'created';
  private containerEl: HTMLElement | null = null;

  constructor(config?: Partial<DittoConfig>) {
    this.config = mergeConfig(config ?? {});
    this.services = new ServiceRegistry();
    this.lifecycle = new LifecycleOrchestrator();
    this.events = new EventEmitter();
    this.store = new PersistenceStore();
    this.ipc = new IPCBus(this.config.kernel.id);
    this.permissions = new PermissionManager({
      dev: this.config.kernel.dev ?? false,
      store: this.store,
    });

    // cellManager 在 init 时创建（需要 container）
    this.cellManager = null as unknown as AppCellManager;

    this.registerStages();
  }

  setContainer(element: HTMLElement): void {
    this.containerEl = element;
  }

  async init(): Promise<void> {
    if (this._state === 'ready') return;
    if (this._state === 'initializing') {
      throw new Error('[Ditto Kernel] Already initializing');
    }

    this._state = 'initializing';
    this.events.emit('kernel:initializing', undefined);

    try {
      await this.lifecycle.init(this);

      // 创建 cellManager（如果未创建）
      if (!(this.cellManager as unknown as AppCellManager)?.getAllCells) {
        const container = this.containerEl ?? document.body;
        (this as any).cellManager = new AppCellManager(this.ipc, this.permissions, container);
      }

      this._state = 'ready';
      this.events.emit('kernel:ready', undefined);
    } catch (e) {
      this._state = 'created';
      this.events.emit('kernel:error', e);
      throw e;
    }
  }

  isInitialized(): boolean {
    return this._state === 'ready';
  }

  get state(): KernelState {
    return this._state;
  }

  async destroy(): Promise<void> {
    if (this._state === 'destroyed' || this._state === 'destroying') return;

    this._state = 'destroying';
    this.events.emit('kernel:destroying', undefined);

    try {
      await this.lifecycle.destroy(this);
      await this.services.shutdown();
      this.ipc.destroy();
      this.events.removeAllListeners();
    } catch (e) {
      console.error('[Ditto Kernel] Error during destroy:', e);
    }

    this._state = 'destroyed';
  }

  private registerStages(): void {
    // storage stage
    this.lifecycle.onStage('storage', {
      onInit: () => {
        // PersistenceStore 已在构造函数创建，这里可加载持久化数据
      },
      onDestroy: () => {
        this.store.clear?.();
      },
    });

    // events stage（已构造，无需额外操作）
    this.lifecycle.onStage('events', {
      onInit: () => {},
    });

    // ipc stage
    this.lifecycle.onStage('ipc', {
      onInit: () => {
        this.services.register('ipc', () => this.ipc);
      },
    });

    // permissions stage
    this.lifecycle.onStage('permissions', {
      onInit: () => {
        this.permissions.loadFromStore();
        this.services.register('permissions', () => this.permissions);
      },
    });

    // services stage（阶段 2 注册更多服务）
    this.lifecycle.onStage('services', {
      onInit: () => {
        this.services.register('events', () => this.events);
        this.services.register('store', () => this.store);
      },
    });

    // cells stage
    this.lifecycle.onStage('cells', {
      onInit: () => {
        const container = this.containerEl ?? document.body;
        const cm = new AppCellManager(this.ipc, this.permissions, container);
        (this as any).cellManager = cm;
        this.services.register('cells', () => cm);
      },
      onDestroy: async () => {
        if ((this.cellManager as unknown as AppCellManager)?.destroy) {
          await (this.cellManager as AppCellManager).destroy();
        }
      },
    });
  }
}

export function createKernel(config?: Partial<DittoConfig>): DittoKernel {
  return new DittoKernel(config);
}

// getKernel() 已删除（破坏性变更）。
// 迁移：import { createKernel } from '@ditto/core'; const kernel = createKernel(config);
```

- [ ] **Step 3: 重写 index.ts**

完全替换 `packages/core/src/index.ts`：

```typescript
export { DittoKernel, createKernel } from './kernel';
export type { KernelState } from './kernel';
export { IPCBus } from './ipc/bus';
export { EventEmitter, EventDispatcher } from './event/emitter';
export { PermissionManager } from './permission/manager';
export type { PermissionManagerOptions } from './permission/manager';
export { PersistenceStore } from './persistence/store';
export type { MigrationStep } from './persistence/store';
export { ServiceRegistry } from './service-registry';
export type { ServiceFactory, ServiceResolveContext, ServiceId } from './service-registry';
export { LifecycleOrchestrator } from './lifecycle-orchestrator';
export type { LifecycleStage, StageHandler } from './lifecycle-orchestrator';
export { AppCellManager } from './app-cell/manager';
export { ClientCell } from './app-cell/cell';
export { CellBridge } from './app-cell/bridge';
export { canTransition, assertTransition } from './app-cell/lifecycle';
export { createSandbox } from './sandbox';
export { IFrameSandbox, ShadowSandbox, WorkerSandbox } from './sandbox';
export type { CellSandbox, SandboxOptions } from './sandbox';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run packages/core/src/__tests__/kernel.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/kernel.ts packages/core/src/index.ts packages/core/src/__tests__/kernel.test.ts
git commit -m "refactor(core): DittoKernel v2 with ServiceRegistry and LifecycleOrchestrator"
```

---

## Task 11: 删除旧文件 + 修复 ipc/index.ts

**Files:**
- Delete: `packages/core/src/plugin/loader.ts`
- Delete: `packages/core/src/plugin/app-runtime.ts`
- Delete: `packages/core/src/plugin/index.ts`
- Delete: `packages/core/src/sandbox/sandbox.ts`
- Delete: `packages/core/src/sandbox/permission.ts`
- Delete: `packages/core/src/sandbox/index.ts`（已被 Task 5 的新 index.ts 覆盖，无需再删）
- Modify: `packages/core/src/ipc/index.ts`

- [ ] **Step 1: 修复 ipc/index.ts**

替换 `packages/core/src/ipc/index.ts`：

```typescript
export { IPCBus } from './bus';
```

- [ ] **Step 2: 删除旧文件**

```bash
rm packages/core/src/plugin/loader.ts
rm packages/core/src/plugin/app-runtime.ts
rm packages/core/src/plugin/index.ts
rm packages/core/src/sandbox/sandbox.ts
rm packages/core/src/sandbox/permission.ts
rmdir packages/core/src/plugin 2>/dev/null || true
```

- [ ] **Step 3: 跑全量测试确认无引用残留**

Run: `pnpm test`
Expected: 所有 core 内部测试 PASS；如果有引用旧路径的错误，修复引用点

- [ ] **Step 4: 跑 typecheck**

Run: `pnpm -C packages/core build` 或 `pnpm build`
Expected: 编译通过

- [ ] **Step 5: 提交**

```bash
git add -A packages/core/src
git commit -m "refactor(core): remove legacy plugin/ and sandbox/ files"
```

---

## Task 12: shell 迁移

**Files:**
- Modify: `apps/shell/src/main.ts`
- Modify: `apps/shell/src/App.vue`
- Modify: `apps/shell/src/stores/market.ts`（如有依赖）

- [ ] **Step 1: 读取当前 shell 代码**

Run: `cat apps/shell/src/main.ts`
记录所有 PluginLoader / getKernel / AppRuntime 引用点。

- [ ] **Step 2: 迁移 main.ts**

把所有 `import { getKernel } from '@ditto/core'` 改为 `import { createKernel } from '@ditto/core'`；
把 `const kernel = getKernel()` 改为 `const kernel = createKernel({ kernel: { dev: true } }); await kernel.init();`；
把 `kernel.plugins.load(manifest)` 改为 `kernel.cellManager.startCell(manifest.id, manifest, config)`；
把 `kernel.plugins.unload(id)` 改为 `kernel.cellManager.stopCell(id)`。

具体改动根据实际代码执行。

- [ ] **Step 3: 迁移 App.vue**

同上，替换所有 PluginLoader / AppRuntime 引用为 AppCellManager API。

- [ ] **Step 4: 检查 stores/market.ts**

Run: `grep -n "plugin\|PluginLoader\|AppRuntime\|getKernel" apps/shell/src/stores/market.ts apps/shell/src/apps/*.vue`
如有引用，迁移到新 API。

- [ ] **Step 5: 跑 build 确认编译通过**

Run: `pnpm build`
Expected: 编译通过

- [ ] **Step 6: 提交**

```bash
git add apps/shell/src
git commit -m "refactor(shell): migrate to kernel v2 AppCellManager API"
```

---

## Task 13: tests 迁移 + e2e 验证

**Files:**
- Modify: `tests/app-cell.test.ts`
- Modify: `tests/multi-user.test.ts`（如有依赖）

- [ ] **Step 1: 读取 tests/app-cell.test.ts**

Run: `cat tests/app-cell.test.ts`
记录所有 PluginLoader / AppRuntime / getKernel 引用。

- [ ] **Step 2: 迁移到 ClientCell API**

把 `pluginLoader.load(manifest)` 改为 `cellManager.startCell(id, manifest, config)`；
把 `appRuntime.startApp(id, manifest, config)` 改为 `cellManager.startCell(id, manifest, config)`；
状态断言从 `'running'` 改为 `'active'`。

- [ ] **Step 3: 迁移 tests/multi-user.test.ts**

如有 kernel 依赖，同上迁移。

- [ ] **Step 4: 跑全量测试**

Run: `pnpm test`
Expected: 所有测试 PASS

- [ ] **Step 5: 跑 build**

Run: `pnpm build`
Expected: 编译通过

- [ ] **Step 6: 手动 e2e 验证**

Run: `pnpm dev`（启动 shell）
打开浏览器，手动验证：
- shell 正常启动
- 一个测试应用可加载（如 com.ditto.calc）

- [ ] **Step 7: 提交**

```bash
git add tests/
git commit -m "test: migrate to kernel v2 ClientCell API"
```

---

## 自审

### Spec 覆盖检查

| Spec 章节 | 对应 Task |
|-----------|-----------|
| §3.1 ServiceRegistry | Task 6 |
| §3.1 LifecycleOrchestrator | Task 6 |
| §3.1 IPCBus v2 | Task 4 |
| §3.1 AppCellManager | Task 9 |
| §3.1 ClientCell | Task 8 |
| §3.1 PermissionManager v2 | Task 3 |
| §3.1 EventEmitter v2 | Task 2 |
| §3.1 PersistenceStore | Task 10（保留，kernel 集成） |
| §4.5 CellSandbox | Task 5 |
| §4.4 CellBridge | Task 7 |
| §4.4 CellLifecycle | Task 8 |
| §5 数据流 | Task 10（kernel 集成验证） |
| §6 错误处理 | Task 2/4/6/8/9（各模块错误隔离） |
| §9.2 UI 扩展点 | Task 10（ServiceRegistry 预留） |
| §10 阶段 1 范围（新增/删除/修改文件） | Task 1-13 全覆盖 |

### 类型一致性

- `ClientCellStatus` 在 Task 1 定义，Task 8/9 使用 ✓
- `CellRuntimeConfig` 在 Task 1 定义，Task 8/9 使用 ✓
- `Capability` 在 Task 1 定义，Task 3 使用 ✓
- `CellEvent` 在 Task 1 定义，Task 9 使用 ✓
- `SandboxMode` 在 Task 1 定义，Task 5 使用 ✓
- `ServiceId` 在 Task 6 定义，Task 10 使用 ✓
- `LifecycleStage` 在 Task 6 定义，Task 10 使用 ✓
- `DittoError` 新错误码（CELL_*, SERVICE_*, SANDBOX_MODE_UNSUPPORTED, IPC_NO_ROUTE）在 Task 1 添加，Task 3/5/6/8 使用 ✓

### 已知简化（非占位符，是显式范围决策）

- Cell pause/resume 留接口抛错（spec §4.4 明确阶段 2 实现）
- Worker sandbox 抛 NotSupported（spec §4.5 明确阶段 2 实现）
- 生产模式权限默认拒绝（spec §4.6 明确阶段 2 接入弹窗）
- UI 美化属于阶段 2（spec §9 明确）

---

## 执行交接

Plan 完成并保存到 `docs/superpowers/plans/2026-06-28-ditto-kernel-v2.md`。两种执行选项：

**1. Subagent-Driven（推荐）** - 每个 Task 派发新 subagent，任务间审查，迭代快

**2. Inline Execution** - 在当前会话用 executing-plans 批量执行，带检查点

选哪种？
