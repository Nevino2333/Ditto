# Ditto WebOS

> 一个基于 Web 的操作系统框架，支持第三方应用开发、Chrome 80+ 兼容、跨设备响应式。

Ditto 把浏览器变成一个真正的操作系统：以 **Cell** 为中心的对称架构，前端 ClientCell 与后端 CellInstance 通过 CellBridge 双向通信；内置 ServiceRegistry 服务编排、阶段化生命周期、capability-based 权限系统、严格 origin 沙盒、IPCBus v2 中间件链；并通过 .dit 打包格式、SDK（9 个 composable）与 CLI 构建完整的第三方应用生态。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg)](https://pnpm.io)
[![Chrome](https://img.shields.io/badge/chrome-%3E%3D80-blue.svg)](https://www.google.com/chrome/)

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [文档导航](#文档导航)
- [贡献指南](#贡献指南)

## 特性

- **Cell 架构**：客户端 `ClientCell` ↔ 服务端 `CellInstance` 对称设计，通过 `CellBridge`（WebSocket + HTTP）双向通信，支持 `loading → active → paused → stopped` 状态机与服务端 `creating → running → hibernated → stopped` 冬眠机制
- **Chrome 80 兼容**：通过 `@vitejs/plugin-legacy` 适配 Chrome 78+/Firefox 72+/Safari 13+，`build.target` 降至 `es2015`、`cssTarget` 降至 `chrome78`，自带 flex-gap polyfill
- **跨设备响应式**：桌面 / 平板 / 手机三档断点（768 / 1024 / 1280），`useDeviceMode`、`useSwipe`、`useDrag`、`useResize` 等 composable 支持触控手势
- **PWA 离线支持**：`vite-plugin-pwa` autoUpdate 模式，Workbox 缓存静态资源与 Google Fonts，可独立安装
- **深度定制**：ThemeEngine 基于 CSS 变量驱动，支持运行时切换、组件级 override、4 档动画预设（none / subtle / normal / expressive），教育场景可一键切换低动效模式
- **第三方应用 SDK**：9 个 Vue 3 composable（IPC / Window / FS / Net / Auth / UI / Widget / App / Cell），通过 `DittoSDK` plugin 注入，应用内 `inject` 即可调用系统能力
- **服务编排**：ServiceRegistry 工厂模式懒创建，LifecycleOrchestrator 7 阶段顺序启动（storage → events → ipc → permissions → services → cells → ready），单阶段失败不中断
- **沙盒安全**：`iframe-strict`（第三方应用，强制 origin 白名单，默认 `allow-scripts` 不含 `allow-same-origin`）/ `shadow-trusted`（native 应用）/ `worker`（预留）三档隔离
- **capability-based 权限**：`fs:read`、`net:fetch`、`clipboard:write`、`cell:backend` 等 11+ 细粒度能力，dev 模式自动授权、生产模式默认拒绝并可持久化
- **IPCBus v2**：严格 origin 校验、onion 模式中间件链、handler 异常隔离、pending request 超时清理
- **.dit 打包格式**：ZIP 压缩，支持 AES-256-GCM 加密（PBKDF2 派生）与 Ed25519 签名，CLI 一键 `pack / install / verify / publish`
- **资源配额与弹性伸缩**：服务端 ResourceQuotaManager / TrafficShaper / FairScheduler / ElasticScaler 四件套，支持 Cell 冬眠、唤醒、限流、共享/独占副本

## 快速开始

### 环境要求

| 工具 | 最低版本 | 用途 |
|------|---------|------|
| Node.js | 20+ | 前端构建、CLI、packager |
| pnpm | 9+ | monorepo 包管理（`packageManager` 字段固定为 `pnpm@9.15.0`） |
| Bun | 最新 | server 运行时（`bun run --watch src/index.ts`） |

### 安装依赖

```bash
# 在项目根目录执行
pnpm install
```

### 开发模式

Ditto 需要同时启动前端 shell（端口 3000）与后端 server（端口 3001）。推荐两个终端分别启动：

```bash
# 终端 1：启动后端 server（Bun 运行时）
cd server
bun run --watch src/index.ts

# 终端 2：启动前端 shell（Vite dev server，自动打开浏览器）
cd apps/shell
pnpm dev
```

或使用 turbo 一键启动全部 dev 任务（turbo 会并行调度所有 workspace 的 `dev` script）：

```bash
pnpm dev
```

Vite dev server 已配置代理，`/api` 与 `/ws` 请求会转发到 `http://localhost:3001`，无需额外 CORS 处理。

### 构建生产产物

```bash
pnpm build
```

turbo 会按依赖拓扑顺序构建（`dependsOn: ["^build"]`），输出到各包的 `dist/` 目录。shell 产物在 `apps/shell/dist`，可直接托管。

### 运行测试

```bash
pnpm test
```

测试基于 vitest，覆盖 core 的 service-registry、lifecycle-orchestrator、app-cell-manager、cell-bridge、client-cell、ipc-bus、permission、sandbox、kernel、emitter 全部模块。

### 清理产物

```bash
pnpm clean
```

## 项目结构

```
ditto-webos/
├── packages/                # 共享包（pnpm workspace）
│   ├── shared/              # 共享类型、配置、常量、错误、Cell 契约
│   ├── core/                # 内核：ServiceRegistry / LifecycleOrchestrator / AppCellManager / ClientCell / CellBridge / IPCBus / PermissionManager / Sandbox
│   ├── ui/                  # Vue 3 UI 组件库：DWindow / DDesktop / DTaskbar / DStartMenu / DDialog / DNotification / DContextMenu / DWidgetBoard
│   ├── services/            # Pinia 服务包：dialog / notification / window / widget / island / search / vfs / net-proxy
│   ├── theme/               # 主题引擎：ThemeEngine / tokens / presets（dittoLight / dittoDark）
│   ├── sdk/                 # 第三方应用 SDK：9 个 composable + DittoSDK plugin
│   ├── adapter/             # 移动端适配：useDeviceMode / useSwipe / useDrag / useResize
│   ├── packager/            # .dit 打包/解包/加密/签名/校验
│   └── cli/                 # CLI 脚手架：pack / install / verify / publish
├── apps/
│   └── shell/               # 桌面环境（Vue 3 + Vite + PWA + legacy plugin）
├── server/                  # Bun + Hono 后端
│   └── src/services/        # AppCell / auth / vfs / market / proxy / realtime / resource-fabric / admin
├── test-apps/               # 示例应用（calc / notes / weather / theme / widget 等）
├── Ditto_Market/            # 应用市场数据与发布脚本
├── docs/                    # 文档（架构 / 第三方开发 / 主题 / 部署 / API 参考）
├── tests/                   # 端到端测试（app-cell / multi-user / packager / resource-fabric）
├── pnpm-workspace.yaml      # workspace 声明（packages/* + apps/* + server）
├── turbo.json               # turbo 任务编排
└── package.json             # 根 package.json（dev/build/test/lint/clean 脚本）
```

### 核心包职责

| 包 | 入口 | 职责 |
|----|------|------|
| `@ditto/shared` | `packages/shared/src/index.ts` | 共享类型（`AppManifest`、`IPCMessage`、`ThemeTokens`、`CellContext`…）、`DittoConfig`、`DittoError`、`Capability`、`CellRuntimeConfig` |
| `@ditto/core` | `packages/core/src/index.ts` | 内核 `DittoKernel` / `createKernel`、`ServiceRegistry`、`LifecycleOrchestrator`、`AppCellManager`、`ClientCell`、`CellBridge`、`IPCBus`、`PermissionManager`、Sandbox |
| `@ditto/ui` | `packages/ui/src/components/index.ts` | 8 个 Vue 组件 + `useDrag` / `useResize` composable |
| `@ditto/services` | `packages/services/src/index.ts` | 8 个 Pinia store + `registerKernelServices` 注入函数 |
| `@ditto/theme` | `packages/theme/src/index.ts` | `ThemeEngine` / `getThemeEngine` / `dittoTokens` / `dittoLight` / `dittoDark` |
| `@ditto/sdk` | `packages/sdk/src/index.ts` | 9 个 composable + `DittoSDK` plugin + InjectionKey |
| `@ditto/adapter` | `packages/adapter/src/index.ts` | `useDeviceMode` / `useSwipe` 移动端 composable |
| `@ditto/packager` | `packages/packager/src/index.ts` | `Packager` 类：pack / unpack / validate / encrypt / decrypt / sign / verify |
| `@ditto/cli` | `packages/cli/src/bin.ts` | `ditto pack/install/verify/publish` 命令 |

## 技术栈

### 前端

- **框架**：Vue 3.5+（`<script setup>` + Composition API）
- **状态管理**：Pinia 2.2+
- **构建工具**：Vite 6.0+ + `@vitejs/plugin-vue` + `@vitejs/plugin-legacy`
- **PWA**：`vite-plugin-pwa` 1.2+（Workbox autoUpdate）
- **语言**：TypeScript 5.7+（strict mode）
- **CSS 变量**：ThemeEngine 通过 `--ditto-*` CSS 变量驱动

### 后端

- **运行时**：Bun（最新版）
- **框架**：Hono 4.7+
- **WebSocket**：Bun 原生 `Bun.serve` upgrade
- **存储**：文件系统 + 内存（VFS 走前端 IndexedDB / OPFS）

### 工程化

- **monorepo**：pnpm workspace + turbo 2.4+
- **测试**：vitest 3.0+ + happy-dom
- **代码执行**：tsx 4.21+（packager / CLI 脚本）
- **类型检查**：vue-tsc 3.2+

## 文档导航

- [架构文档](docs/architecture.md) — 内核架构、Cell 对称设计、生命周期状态机、沙盒安全、权限系统、IPCBus v2、服务编排
- [第三方应用开发指南](docs/third-party-app-development.md) — manifest 规范、.dit 打包、9 个 SDK composable、后端 Cell 开发、完整示例
- [主题与定制](docs/theme-system.md) — ThemeTokens 结构、自定义主题、运行时切换、组件级 override、动画预设
- [部署指南](docs/deployment.md) — 开发/生产部署、PWA 离线、环境变量、性能优化、Chrome 80 兼容
- [API 参考](docs/api-reference.md) — Kernel / ServiceRegistry / AppCellManager / ClientCell / CellBridge / PermissionManager / IPCBus API

## 贡献指南

1. Fork 仓库并创建特性分支：`git checkout -b feature/your-feature`
2. 遵循 TypeScript strict 模式与现有代码风格
3. 为新功能补充 vitest 测试（参考 `packages/core/src/__tests__/`）
4. 提交前执行 `pnpm test` 与 `pnpm build` 确保通过
5. 提交信息使用 conventional commits（`feat:` / `fix:` / `docs:` / `refactor:`）
6. 发起 Pull Request 并关联 issue

## 许可证

MIT License — 详见 LICENSE 文件。
