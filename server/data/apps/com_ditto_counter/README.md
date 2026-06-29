# Ditto Counter

> 协作计数器 — dit 类型应用示例，演示前后端对称 Cell 架构

## 简介

Ditto Counter 是一个演示性应用，展示 dit 类型应用如何同时利用：

- **前端 Cell**（iframe-strict/shadow-trusted 沙盒）：HTML/CSS/JS 用户界面
- **后端 Cell**（服务端 Node/Bun 进程）：HTTP 路由 + WebSocket + 持久化 + 跨 Cell IPC

两者通过 **CellBridge** 对称通信，前端 fetch 调用后端 HTTP 路由，并通过 WebSocket 接收实时广播。

## 应用 ID

`com.ditto.counter`

## 功能演示

| 能力 | 后端 API | 前端调用 |
|------|----------|----------|
| 读取计数 | `GET /api/cell/com.ditto.counter/counter` | 启动时拉取 |
| 增加 +1 | `POST /api/cell/com.ditto.counter/counter/inc` | 按钮 |
| 减少 -1 | `POST /api/cell/com.ditto.counter/counter/dec` | 按钮 |
| 重置归零 | `POST /api/cell/com.ditto.counter/counter/reset` | 按钮 |
| 健康检查 | `GET /api/cell/com.ditto.counter/health` | 系统监控 |
| 事件历史 | `GET /api/cell/com.ditto.counter/stats` | UI 历史面板 |
| 实时同步 | WebSocket `/ws` + IPC `counter:update` | 多客户端同步 |

## 后端 Cell 生命周期

```
onInit      → 读取/初始化 CellStorage 中的 counter 值
onStart     → 记录生命周期指标
onStop      → 通知所有 WebSocket 客户端即将停止
onDestroy   → 清理活跃客户端集合与历史
registerRoutes      → 注册 HTTP 路由（health/counter/stats）
registerWebSocket   → 声明支持 WebSocket（实际推送由 CellIPC.broadcastToWS 完成）
```

## 持久化

Counter 值通过 `ctx.storage.put('counter:value', ...)` 持久化到 CellStorage（应用作用域）。即使后端 Cell 被销毁重建，counter 值依然保留。

## 跨 Cell 通信

调用 `ctx.ipc.send('counter:update', state, '*')` 会广播到所有订阅了 `counter:update` 通道的 Cell。这意味着其他 dit 应用也能监听本应用的计数变化，实现应用间联动。

## 启动流程

1. 用户从 Dock/桌面打开 Counter 应用
2. AppCellManager 检查是否已有运行中的 shared Cell
3. 若无 → 调用 `onInit` + `registerRoutes` + `onStart`
4. Cell 路由挂载到 Hono 应用：`/api/cell/com.ditto.counter/*`
5. 前端 iframe 加载 `/api/apps/com.ditto.counter/frontend/index.html`
6. 前端调用 `GET /counter` 拉取初始值
7. 前端连接 `/ws` 订阅 `counter:update` 通道
8. 用户点击 +1 → `POST /counter/inc` → 后端更新存储 + 广播 → 所有客户端收到更新

## 休眠与唤醒

当应用空闲超过 `hibernateAfterMs`（默认 15 分钟），AppCellManager 会调用 `cell.hibernate()`，进入 `hibernated` 状态。下次用户操作时调用 `cell.wake()` 重新进入 `running` 状态，触发 `onStart`。

## 文件结构

```
com_ditto_counter/
├── manifest.json       # 应用清单（type: dit, backend.entry）
├── frontend/
│   └── index.html      # 前端 UI（HTTP fetch + WebSocket）
├── backend/
│   └── index.ts        # 后端 Cell 模块（生命周期 + 路由 + WS）
└── README.md           # 本文件
```

## 开发参考

- [Ditto 内核 v2 设计规范](../../../docs/superpowers/specs/2026-06-28-ditto-kernel-v2-design.md)
- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [AppCellManager 源码](../../../server/src/services/app-cell/manager.ts)
