# Ditto 第三方应用开发指南

> 本文档面向第三方应用开发者，详细说明如何基于 Ditto SDK 开发、打包、发布应用。

## 目录

- [应用类型](#应用类型)
- [manifest.json 规范](#manifestjson-规范)
- [.dit 打包格式](#dit-打包格式)
- [SDK 使用指南](#sdk-使用指南)
  - [useDittoIPC — IPC 通信](#usedittoipc--ipc-通信)
  - [useDittoWindow — 窗口控制](#usedittowindow--窗口控制)
  - [useDittoFS — 文件系统](#usedittofs--文件系统)
  - [useDittoNet — 网络请求](#usedittonet--网络请求)
  - [useDittoAuth — 认证](#usedittoauth--认证)
  - [useDittoUI — UI 通知与对话框](#usedittoui--ui-通知与对话框)
  - [useDittoWidget — 小组件](#usedittowidget--小组件)
  - [useDittoApp — 应用生命周期](#usedittoapp--应用生命周期)
  - [useDittoCell — 后端 Cell 通信](#usedittocell--后端-cell-通信)
- [权限声明](#权限声明)
- [后端 Cell 开发](#后端-cell-开发)
- [完整示例应用](#完整示例应用)
- [开发调试技巧](#开发调试技巧)

## 应用类型

Ditto 支持四种应用类型，通过 `CellRuntimeConfig.type` 区分：

| 类型 | 说明 | 沙盒模式 | 后端 Cell | 典型场景 |
|------|------|---------|---------|---------|
| `native` | Vue 组件，shell 信任 | `shadow-trusted` | ❌ | 内置应用（Settings、FileManager） |
| `web` | 远程 URL，iframe 加载 | `iframe-strict` | ❌ | 现有 Web 应用接入 |
| `pwa` | PWA manifest 驱动 | `iframe-strict` | ❌ | PWA 应用 |
| `dit` | 前后端对称 Cell | `iframe-strict` | ✅ | 需要后端逻辑的应用（笔记、协作） |

**推荐**：新应用优先选择 `dit` 类型，可同时获得前后端能力与 Ditto 完整生态支持。

## manifest.json 规范

每个 Ditto 应用必须包含 `manifest.json`，描述应用元信息、窗口配置、权限声明与后端配置。

### 完整字段说明

```typescript
interface AppManifest {
  // ─── 基础信息（必填）───
  id: string;              // 应用唯一 ID，格式如 com.ditto.notes（域名倒序）
  name: string;            // 显示名称
  version: string;         // 语义化版本号（如 1.0.0）
  entry: string;            // 前端入口（相对路径，如 frontend/index.html）

  // ─── 描述信息（可选）───
  description?: string;     // 一句话描述
  icon?: string;            // 图标（emoji 或图片路径）
  category?: string;        // 分类：productivity / utility / entertainment / education...
  type?: 'app' | 'widget' | 'plugin' | 'theme' | 'dit';  // 默认 'app'，详见下方「两种 type 的关系」

  // ─── 沙盒与权限 ───
  sandbox: 'strict' | 'trusted';  // strict=iframe 隔离，trusted=Shadow DOM
  permissions: string[];           // 权限声明，见「权限声明」章节

  // ─── 窗口配置（必填）───
  window: {
    width: number;          // 默认宽度
    height: number;         // 默认高度
    minWidth?: number;       // 最小宽度（默认 320）
    minHeight?: number;     // 最小高度（默认 240）
    resizable?: boolean;    // 是否可调整大小
    maximizable?: boolean;  // 是否可最大化
    titlebar?: boolean;     // 是否显示标题栏
  };

  // ─── 后端 Cell 配置（dit 类型专用）───
  backend?: {
    entry: string;          // 后端入口（如 backend/index.ts）
    type: 'cell';           // 固定 'cell'
    port?: number;          // 端口（可选）
    healthCheck?: string;   // 健康检查路径（如 /health）
    env?: Record<string, string>;  // 环境变量注入
  };

  // ─── 国际化 ───
  i18n?: {
    default: string;        // 默认语言（如 'zh-CN'）
    supported: string[];    // 支持的语言列表
  };

  // ─── 依赖 ───
  dependencies?: Record<string, string>;  // 依赖的其他应用（如 { "com.ditto.auth": "^1.0.0" }）

  // ─── 安全 ───
  signature?: {              // 数字签名
    algorithm: string;       // 如 'ed25519'
    value: string;           // 签名值（base64）
    publicKey: string;       // 公钥（base64）
  };
  encryption?: {             // 加密元信息
    algorithm: 'aes-256-gcm';
    keyDerivation: 'pbkdf2';
    iterations: number;      // PBKDF2 迭代次数
    salt: string;            // 盐值（base64）
  };

  // ─── 兼容性 ───
  minDittoVersion?: string;  // 最低 Ditto 版本要求
}
```

### 完整示例

```json
{
  "id": "com.ditto.notes",
  "name": "Ditto Notes",
  "version": "0.1.0",
  "description": "轻量级 Markdown 笔记应用",
  "icon": "📝",
  "entry": "frontend/index.html",
  "category": "productivity",
  "sandbox": "trusted",
  "permissions": ["fs:read", "fs:write", "net:fetch"],
  "type": "app",
  "window": {
    "width": 720,
    "height": 540,
    "minWidth": 480,
    "minHeight": 360,
    "resizable": true,
    "maximizable": true
  },
  "backend": {
    "entry": "backend/index.ts",
    "type": "cell",
    "healthCheck": "/health"
  },
  "i18n": {
    "default": "zh-CN",
    "supported": ["zh-CN", "en-US"]
  },
  "minDittoVersion": "0.1.0"
}
```

### 字段校验规则

`Packager.validate()` 会检查以下规则：

- `id` 必填，且匹配 `/^[\w.-]+$/`（字母、数字、点、连字符、下划线）
- `name` / `version` / `entry` 必填
- `version` 推荐语义化版本（`/^\d+\.\d+\.\d+/`），不符会 warning
- `frontend/` 目录必须存在
- 声明 `backend` 时，`backend.entry` 必填，`backend/` 目录必须存在
- widget 类型 ID 建议以 `widget.` 开头
- theme 类型应包含 `tokens.json`

## .dit 打包格式

Ditto 应用通过 `Packager` 打包为 `.dit`（应用）/ `.ditx`（widget）/ `.ditc`（plugin）/ `.ditz`（theme）文件。

### 包结构

`.dit` 文件本质是 ZIP 压缩包，结构如下：

```
my-app-1.0.0.dit
├── manifest.json          # 应用清单（必填）
├── frontend/              # 前端代码（必填）
│   ├── index.html
│   ├── assets/
│   └── ...
├── backend/               # 后端代码（dit 类型）
│   ├── index.ts
│   └── ...
├── icon.png               # 图标（可选）
├── encryption.meta        # 加密元信息（加密时生成）
└── signature.sig          # 签名文件（签名时生成）
```

### 打包

使用 CLI 打包：

```bash
# 基础打包
ditto pack --manifest ./manifest.json --frontend ./frontend --backend ./backend

# 带加密
ditto pack --manifest ./manifest.json --frontend ./frontend --encrypt --password "your-password"

# 带签名
ditto pack --manifest ./manifest.json --frontend ./frontend --sign --private-key ./key.pem
```

或使用 API：

```typescript
import { Packager } from '@ditto/packager';

const packager = new Packager();

const outputPath = await packager.pack({
  type: 'app',
  manifest: myManifest,
  frontendDir: './frontend',
  backendDir: './backend',     // dit 类型
  iconPath: './icon.png',
  outputPath: './my-app-1.0.0.dit',
  encrypt: { password: 'secret', algorithm: 'aes-256-gcm' },
  sign: { privateKeyPath: './key.pem', algorithm: 'ed25519' },
});
```

### 加密与签名

- **加密**：AES-256-GCM + PBKDF2（默认 100000 次迭代），仅加密代码文件（`.js/.ts/.html/.css/.mjs/.cjs`）
- **签名**：Ed25519 + SHA-256 哈希，生成 `signature.sig`（含 algorithm/value/publicKey）

### 校验

```typescript
const result = await packager.validate('./my-app-1.0.0.dit', {
  checkDependencies: true,
  minDittoVersion: '0.1.0',
});

console.log(result.valid);      // true/false
console.log(result.errors);      // 错误列表
console.log(result.warnings);   // 警告列表
```

### 验证签名

```typescript
const verifyResult = await packager.verify('./my-app-1.0.0.dit');
console.log(verifyResult.verified);  // true/false
console.log(verifyResult.signer);   // 公钥（base64）
```

## SDK 使用指南

SDK 提供 9 个 Vue 3 composable，通过 `DittoSDK` plugin 注入到应用。

### 安装与初始化

在你的应用入口（如 `frontend/index.html` 或 Vue `main.ts`）：

```typescript
import { createApp } from 'vue';
import { DittoSDK } from '@ditto/sdk';

const app = createApp(App);
app.use(DittoSDK);
app.mount('#app');
```

或直接 `inject`：

```typescript
import { inject } from 'vue';
import { DittoWindowKey, useDittoWindow } from '@ditto/sdk';

const windowApi = inject(DittoWindowKey) ?? useDittoWindow();
```

### useDittoIPC — IPC 通信

源码：`packages/sdk/src/ipc-api.ts`

最基础的 IPC composable，其他 composable 都基于它。通过 `window.postMessage` 与宿主通信。

```typescript
import { useDittoIPC } from '@ditto/sdk';

const { send, request, onMessage } = useDittoIPC();

// 发送事件（无需响应）
send('app:ready', { id: 'com.my.app' });

// 发送请求（等待响应，默认 10s 超时）
const result = await request<{ status: string }>('system:status');
console.log(result.status);

// 监听消息
const unsubscribe = onMessage('app:lifecycle', (channel, payload) => {
  console.log('收到', channel, payload);
});

// 组件卸载时自动清理（onUnmounted 内置）
```

**API 签名**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `send` | `(channel: string, payload?: unknown, target?: string) => void` | 发送事件消息 |
| `request` | `<T>(channel: string, payload?: unknown, timeout?: number) => Promise<T>` | 发送请求并等待响应 |
| `onMessage` | `(channel: string, handler: (channel, payload) => void) => () => void` | 监听消息，返回 unsubscribe |

### useDittoWindow — 窗口控制

源码：`packages/sdk/src/window-api.ts`

控制应用窗口行为。

```typescript
import { useDittoWindow } from '@ditto/sdk';

const { setTitle, close, minimize, maximize, restore, setIcon } = useDittoWindow();

// 修改窗口标题
setTitle('我的笔记 - 编辑中');

// 修改图标
setIcon('📝');

// 用户点击退出按钮时
function onExit() {
  close();
}
```

**API 签名**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `setTitle` | `(title: string) => void` | 设置窗口标题 |
| `close` | `() => void` | 关闭窗口 |
| `minimize` | `() => void` | 最小化 |
| `maximize` | `() => void` | 最大化 |
| `restore` | `() => void` | 还原 |
| `setIcon` | `(icon: string) => void` | 设置图标 |

### useDittoFS — 文件系统

源码：`packages/sdk/src/fs-api.ts`

通过 VFS（IndexedDB / OPFS）读写文件，需要 `fs:read` / `fs:write` 权限。

```typescript
import { useDittoFS } from '@ditto/sdk';

const { readFile, readText, writeFile, writeText, listDir, deleteFile, mkdir, stat, rename, exists } = useDittoFS();

// 读取文本
const content = await readText('/my-app/notes/hello.md');

// 写入文本
await writeText('/my-app/notes/hello.md', '# Hello Ditto');

// 读取二进制
const buffer = await readFile('/my-app/images/avatar.png');

// 列目录
const entries = await listDir('/my-app/notes');
console.log(entries);  // ['hello.md', 'todo.md']

// 检查文件是否存在
const hasConfig = await exists('/my-app/config.json');

// 创建目录
await mkdir('/my-app/cache');

// 重命名
await rename('/my-app/old-name.md', '/my-app/new-name.md');

// 获取文件信息
const info = await stat('/my-app/notes/hello.md');
console.log(info.size, info.modified, info.type);

// 删除文件
await deleteFile('/my-app/cache/temp.tmp');
```

**API 签名**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `readFile` | `(path: string) => Promise<ArrayBuffer>` | 读取二进制 |
| `readText` | `(path: string) => Promise<string>` | 读取文本 |
| `writeFile` | `(path: string, data: ArrayBuffer) => Promise<void>` | 写入二进制 |
| `writeText` | `(path: string, text: string) => Promise<void>` | 写入文本 |
| `listDir` | `(path: string) => Promise<string[]>` | 列出目录 |
| `deleteFile` | `(path: string) => Promise<void>` | 删除文件 |
| `mkdir` | `(path: string) => Promise<void>` | 创建目录 |
| `stat` | `(path: string) => Promise<{size, modified, type}>` | 获取信息 |
| `rename` | `(oldPath: string, newPath: string) => Promise<void>` | 重命名/移动 |
| `exists` | `(path: string) => Promise<boolean>` | 检查存在 |

### useDittoNet — 网络请求

源码：`packages/sdk/src/net-api.ts`

通过宿主代理发起网络请求（绕过 CORS），需要 `net:fetch` 权限。

```typescript
import { useDittoNet } from '@ditto/sdk';

const { fetch, getText, getJSON, getBlob, loading, error } = useDittoNet();

// 发起请求
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});
const data = await response.json();

// 简便方法
const text = await getText('https://example.com/robots.txt');
const json = await getJSON<{ items: any[] }>('https://api.example.com/list');
const blob = await getBlob('https://example.com/image.png');

// 响应式状态
console.log(loading.value);  // true/false
console.log(error.value);    // Error | null
```

**API 签名**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `fetch` | `(url: string, options?: RequestInit) => Promise<Response>` | 标准 fetch 封装 |
| `getText` | `(url: string) => Promise<string>` | 获取文本 |
| `getJSON` | `<T>(url: string) => Promise<T>` | 获取 JSON |
| `getBlob` | `(url: string) => Promise<Blob>` | 获取 Blob |
| `loading` | `Ref<boolean>` | 加载状态 |
| `error` | `Ref<Error | null>` | 错误状态 |

### useDittoAuth — 认证

源码：`packages/sdk/src/auth-api.ts`

集成 Ditto 账户系统。

```typescript
import { useDittoAuth } from '@ditto/sdk';

const { isAuthenticated, user, login, register, logout, me } = useDittoAuth();

// 登录
await login('alice', 'password123');
console.log(user.value);  // { id, username, avatar? }

// 注册
await register('bob', 'password456');

// 获取当前用户（自动检测登录状态）
const currentUser = await me();
if (currentUser) {
  console.log('已登录:', currentUser.username);
}

// 登出
await logout();
console.log(isAuthenticated.value);  // false
```

**API 签名**：

| 方法/属性 | 签名 | 说明 |
|----------|------|------|
| `isAuthenticated` | `Ref<boolean>` | 登录状态 |
| `user` | `Ref<{id, username, avatar?} | null>` | 当前用户 |
| `login` | `(username, password) => Promise<void>` | 登录 |
| `register` | `(username, password) => Promise<void>` | 注册 |
| `logout` | `() => Promise<void>` | 登出 |
| `me` | `() => Promise<user | null>` | 获取当前用户 |

### useDittoUI — UI 通知与对话框

源码：`packages/sdk/src/ui-api.ts`

调用系统 UI 组件（通知、对话框、文件选择）。

```typescript
import { useDittoUI } from '@ditto/sdk';

const { showNotification, showOpenFileDialog, showConfirm, showAlert } = useDittoUI();

// 显示通知
showNotification('保存成功', '笔记已自动保存', 'success');
// type: 'info' | 'success' | 'warning' | 'error'

// 确认对话框
const confirmed = await showConfirm('删除确认', '确定删除这条笔记吗？');
if (confirmed) {
  await deleteNote();
}

// 警告框
await showAlert('提示', '请先登录');

// 文件选择
const files = await showOpenFileDialog({ accept: '.md', multiple: true });
for (const file of files) {
  console.log(file.name, file.size, file.type);
  const text = await file.text();
}
```

**API 签名**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `showNotification` | `(title, body, type?) => void` | 显示通知 |
| `showOpenFileDialog` | `(options?: {accept?, multiple?}) => Promise<File[]>` | 文件选择 |
| `showConfirm` | `(title, message) => Promise<boolean>` | 确认框 |
| `showAlert` | `(title, message) => Promise<void>` | 警告框 |

### useDittoWidget — 小组件

源码：`packages/sdk/src/widget-api.ts`

桌面小组件 API（widget 类型应用专用）。

```typescript
import { useDittoWidget } from '@ditto/sdk';

const { data, loading, error, updateData, getData, requestRefresh, resize, notifyHost, requestIslandSlot, updateIslandSlot, removeIslandSlot } = useDittoWidget();

// 更新小组件数据（自动通知宿主刷新）
updateData({ weather: 'sunny', temp: 25 });

// 读取数据
const current = getData();

// 主动请求刷新
requestRefresh();

// 调整小组件尺寸
resize('large');  // 'small' | 'medium' | 'large'

// 通知宿主事件
notifyHost('click', { action: 'open-app' });

// 申请 Dynamic Island 槽位
const slotId = await requestIslandSlot('正在同步...', {
  icon: '🔄',
  priority: 'high',
  expandable: true,
  actions: [{ label: '查看', action: 'view' }],
});

if (slotId) {
  // 更新 Island 内容
  updateIslandSlot(slotId, '同步完成', { priority: 'normal' });

  // 移除 Island 槽位
  setTimeout(() => removeIslandSlot(slotId), 3000);
}
```

**API 签名**：

| 方法/属性 | 签名 | 说明 |
|----------|------|------|
| `data` | `Ref<Record<string, unknown>>` | 小组件数据 |
| `loading` | `Ref<boolean>` | 加载状态 |
| `error` | `Ref<Error | null>` | 错误状态 |
| `updateData` | `(newData) => void` | 更新数据 |
| `getData` | `() => Record` | 获取数据 |
| `requestRefresh` | `() => void` | 请求刷新 |
| `resize` | `(size: 'small'|'medium'|'large') => void` | 调整尺寸 |
| `notifyHost` | `(event, payload?) => void` | 通知宿主 |
| `requestIslandSlot` | `(content, options?) => Promise<string|null>` | 申请 Island 槽位 |
| `updateIslandSlot` | `(slotId, content, options?) => void` | 更新 Island |
| `removeIslandSlot` | `(slotId) => void` | 移除 Island |

### useDittoApp — 应用生命周期

源码：`packages/sdk/src/app-api.ts`

管理应用注册与生命周期事件。

```typescript
import { useDittoApp } from '@ditto/sdk';

const { isReady, appInfo, registerApp, onLifecycle, ready, exit, suspend, requestPermission, getManifest } = useDittoApp();

// 注册应用信息
registerApp({
  id: 'com.ditto.notes',
  name: 'Ditto Notes',
  version: '1.0.0',
  description: 'Markdown 笔记',
});

// 监听生命周期事件
onLifecycle('mount', () => console.log('应用挂载'));
onLifecycle('suspend', async () => {
  console.log('应用被挂起，保存状态');
  await saveState();
});
onLifecycle('resume', async () => {
  console.log('应用恢复');
  await restoreState();
});
onLifecycle('destroy', () => console.log('应用销毁'));

// 通知宿主应用已就绪
ready();

// 请求权限
const granted = await requestPermission('fs:write');
if (granted) {
  await saveFile();
}

// 主动退出
function onExit() {
  exit();
}
```

**生命周期事件**：`init` / `mount` / `unmount` / `suspend` / `resume` / `destroy`

### useDittoCell — 后端 Cell 通信

源码：`packages/sdk/src/cell-api.ts`

dit 类型应用专用，与后端 CellInstance 通信，需要 `cell:backend` 权限。

```typescript
import { useDittoCell } from '@ditto/sdk';

const {
  loading, error, backendStatus,
  cellFetch, cellGet, cellPost, cellPut, cellDelete,
  checkBackendHealth, startBackend, stopBackend, ensureBackendRunning,
  sendToBackend, onBackendMessage, connectWebSocket, disconnectWebSocket,
} = useDittoCell();

// HTTP 调用后端 API（自动唤醒冬眠的 Cell）
const stats = await cellGet('com.ditto.notes', '/stats');
const result = await cellPost('com.ditto.notes', '/notes', { title: 'Hello', content: 'World' });

// 带选项的 fetch
const data = await cellFetch('com.ditto.notes', '/notes/123', {
  method: 'PUT',
  body: { title: 'Updated' },
  timeout: 15000,
  autoWake: true,  // 后端冬眠时自动唤醒
});

// 检查后端状态
const health = await checkBackendHealth('com.ditto.notes');
console.log(backendStatus.value);  // 'running' | 'hibernated' | 'stopped' | 'error'

// 主动启动/停止后端
await startBackend('com.ditto.notes');
await stopBackend('com.ditto.notes');

// WebSocket 实时通信
connectWebSocket('com.ditto.notes');

// 发送消息到后端
sendToBackend('com.ditto.notes', 'note:updated', { id: 123 });

// 监听后端消息
const unsub = onBackendMessage('note:synced', (payload) => {
  console.log('笔记已同步:', payload);
});

// 组件卸载时自动断开 WebSocket（onUnmounted 内置）
```

**API 签名**：

| 方法/属性 | 签名 | 说明 |
|----------|------|------|
| `loading` | `Ref<boolean>` | 加载状态 |
| `error` | `Ref<Error | null>` | 错误状态 |
| `backendStatus` | `Ref<'unknown'|'running'|'hibernated'|'stopped'|'error'>` | 后端状态 |
| `cellFetch` | `<T>(appId, path, options?) => Promise<{data, status, headers}>` | 通用请求 |
| `cellGet` | `<T>(appId, path) => Promise<T>` | GET 请求 |
| `cellPost` | `<T>(appId, path, body?) => Promise<T>` | POST 请求 |
| `cellPut` | `<T>(appId, path, body?) => Promise<T>` | PUT 请求 |
| `cellDelete` | `<T>(appId, path) => Promise<T>` | DELETE 请求 |
| `checkBackendHealth` | `(appId) => Promise<{status, runningCells?, hibernatedCells?}>` | 健康检查 |
| `startBackend` | `(appId) => Promise<boolean>` | 启动后端 |
| `stopBackend` | `(appId) => Promise<boolean>` | 停止后端 |
| `ensureBackendRunning` | `(appId, retries?) => Promise<boolean>` | 确保运行（含重试） |
| `sendToBackend` | `(appId, channel, payload) => void` | 发送 IPC 消息 |
| `onBackendMessage` | `(channel, handler) => () => void` | 监听后端消息 |
| `connectWebSocket` | `(appId) => WebSocket | null` | 连接 WebSocket（自动重连） |
| `disconnectWebSocket` | `() => void` | 断开 WebSocket |

**自动唤醒机制**：

- `cellFetch` 默认 `autoWake: true`，检测到后端非 running 状态时自动调用 `ensureBackendRunning`
- 后端冬眠时返回 503，SDK 自动调用 `/wake` 并重试（默认最多 2 次，间隔 1s）
- 资源配额超限返回 503，SDK 不会重试，console.warn 提示

## 权限声明

在 `manifest.json` 的 `permissions` 字段声明应用所需权限。权限是 capability-based 的细粒度能力。

### 可用权限

| 权限 | 说明 | 参数 |
|------|------|------|
| `fs:read` | 读取文件 | `{ paths: string[] }` |
| `fs:write` | 写入文件 | `{ paths: string[] }` |
| `net:fetch` | 发起网络请求 | `{ origins: string[] }` |
| `net:websocket` | WebSocket 连接 | — |
| `clipboard:read` | 读取剪贴板 | — |
| `clipboard:write` | 写入剪贴板 | — |
| `notification:show` | 显示通知 | — |
| `window:multi` | 多窗口支持 | — |
| `window:fullscreen` | 全屏模式 | — |
| `cell:backend` | 后端 Cell 通信 | — |
| `cell:peer` | 跨用户 Cell 通信 | — |

### 声明示例

```json
{
  "permissions": [
    "fs:read",
    "fs:write",
    "net:fetch",
    "clipboard:write",
    "notification:show",
    "cell:backend"
  ]
}
```

### 权限决策

- **dev 模式**：manifest 声明即自动授权（console.warn 提示），适合开发期
- **生产模式**：默认拒绝，需要用户交互式授权（阶段 2 接入 dialog service 后）
- **持久化**：权限决策可通过 `PersistenceStore` 跨会话保留

### 运行时请求权限

除 manifest 声明外，可在运行时动态请求：

```typescript
import { useDittoApp } from '@ditto/sdk';

const { requestPermission } = useDittoApp();

const granted = await requestPermission('fs:write');
if (!granted) {
  // 提示用户去设置开启权限
}
```

## 后端 Cell 开发

dit 类型应用的后端称为 Cell，通过实现 `AppCellModule` 接口开发。

### AppCellModule 接口

源码：`packages/shared/src/types.ts`

```typescript
export interface AppCellModule {
  onInit?(ctx: CellContext): Promise<void>;       // 初始化（加载时）
  onStart?(ctx: CellContext): Promise<void>;      // 启动（每次 wake）
  onStop?(ctx: CellContext): Promise<void>;       // 停止
  onDestroy?(ctx: CellContext): Promise<void>;    // 销毁
  registerRoutes(router: CellRouter): void;       // 注册 HTTP 路由（必填）
  registerWebSocket?(ws: CellWebSocketHandler): void;  // 注册 WS handler
}
```

### CellContext 注入

后端 Cell 通过 `CellContext` 访问系统能力：

```typescript
export interface CellContext {
  appId: string;
  cellId: string;
  config: Record<string, unknown>;
  env: Record<string, string>;        // 环境变量
  db: CellDatabase;                    // 数据库（内存）
  storage: CellStorage;                // KV 存储
  ipc: CellIPC;                        // IPC 通信
  logger: CellLogger;                  // 日志
  metrics: CellMetrics;                // 指标
}
```

### registerRoutes

通过 `CellRouter` 注册 HTTP 路由：

```typescript
export interface CellRouter {
  get(path: string, handler: CellRouteHandler): void;
  post(path: string, handler: CellRouteHandler): void;
  put(path: string, handler: CellRouteHandler): void;
  delete(path: string, handler: CellRouteHandler): void;
  ws(path: string, handler: CellWSHandler): void;
  middleware(fn: CellMiddleware): void;
}
```

路由会挂载到 `/api/cell/{appId}` 下，例如 `router.get('/health')` 实际访问 `/api/cell/com.ditto.notes/health`。

### 完整后端示例

```typescript
// backend/index.ts
import type { AppCellModule, CellContext, CellRouter, CellRequest, CellResponse } from '@ditto/shared';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

const module: AppCellModule = {
  async onInit(ctx: CellContext): Promise<void> {
    ctx.logger.info('Notes backend initializing', { appId: ctx.appId });
    // 初始化存储
    const existing = await ctx.storage.list('notes/');
    ctx.logger.info(`Loaded ${existing.length} notes`);
  },

  async onStart(ctx: CellContext): Promise<void> {
    ctx.logger.info('Notes backend started');
    ctx.metrics.gauge('notes.startup', 1);
  },

  async onStop(ctx: CellContext): Promise<void> {
    ctx.logger.info('Notes backend stopping');
    // 保存状态到 storage
  },

  async onDestroy(ctx: CellContext): Promise<void> {
    ctx.logger.info('Notes backend destroyed');
  },

  registerRoutes(router: CellRouter): void {
    // 健康检查
    router.get('/health', async (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // 获取所有笔记
    router.get('/notes', async (req, res) => {
      const keys = await req.ctx.storage.list('notes/');
      // ... 返回笔记列表
      res.json({ notes: [] });
    });

    // 创建笔记
    router.post('/notes', async (req, res) => {
      const { title, content } = req.body as { title: string; content: string };
      const note: Note = {
        id: crypto.randomUUID(),
        title,
        content,
        updatedAt: Date.now(),
      };
      res.status(201).json(note);
    });

    // 更新笔记
    router.put('/notes/:id', async (req, res) => {
      const id = req.params.id;
      // ... 更新逻辑
      res.json({ id, updated: true });
    });

    // 删除笔记
    router.delete('/notes/:id', async (req, res) => {
      // ... 删除逻辑
      res.status(204);
    });

    // WebSocket 端点
    router.ws('/realtime', (ws, req) => {
      ws.onMessage((data) => {
        // 广播给所有连接
      });
    });
  },
};

export default module;
```

> **注意**：`req.ctx` 是简化示例，实际通过 CellContext 注入。后端 Cell 应通过闭包捕获 `ctx`。

## 完整示例应用

下面从零创建一个 dit 类型的待办事项应用 `com.ditto.todo`。

### 1. 创建项目结构

```
com.ditto.todo/
├── manifest.json
├── frontend/
│   └── index.html
└── backend/
    └── index.ts
```

### 2. 编写 manifest.json

```json
{
  "id": "com.ditto.todo",
  "name": "Ditto Todo",
  "version": "1.0.0",
  "description": "简单的待办事项应用",
  "icon": "✅",
  "entry": "frontend/index.html",
  "category": "productivity",
  "sandbox": "strict",
  "permissions": ["fs:read", "fs:write", "cell:backend", "notification:show"],
  "type": "app",
  "window": {
    "width": 480,
    "height": 600,
    "minWidth": 360,
    "minHeight": 400,
    "resizable": true
  },
  "backend": {
    "entry": "backend/index.ts",
    "type": "cell",
    "healthCheck": "/health"
  },
  "minDittoVersion": "0.1.0"
}
```

### 3. 编写后端 Cell

```typescript
// backend/index.ts
import type { AppCellModule, CellContext, CellRouter } from '@ditto/shared';

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

const todos = new Map<string, Todo>();

const module: AppCellModule = {
  async onInit(ctx: CellContext): Promise<void> {
    ctx.logger.info('Todo backend initialized');
  },

  registerRoutes(router: CellRouter): void {
    router.get('/health', async (req, res) => {
      res.json({ status: 'ok', count: todos.size });
    });

    router.get('/todos', async (req, res) => {
      res.json({ todos: Array.from(todos.values()) });
    });

    router.post('/todos', async (req, res) => {
      const { text } = req.body as { text: string };
      const todo: Todo = {
        id: crypto.randomUUID(),
        text,
        done: false,
        createdAt: Date.now(),
      };
      todos.set(todo.id, todo);
      res.status(201).json(todo);
    });

    router.put('/todos/:id', async (req, res) => {
      const id = req.params.id;
      const todo = todos.get(id);
      if (!todo) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      todo.done = !todo.done;
      todos.set(id, todo);
      res.json(todo);
    });

    router.delete('/todos/:id', async (req, res) => {
      const id = req.params.id;
      todos.delete(id);
      res.status(204);
    });
  },
};

export default module;
```

### 4. 编写前端

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Ditto Todo</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 16px; }
    .todo-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; }
    .done { text-decoration: line-through; color: #999; }
    button { cursor: pointer; }
  </style>
</head>
<body>
  <div id="app">
    <h1>✅ Ditto Todo</h1>
    <form id="add-form">
      <input id="todo-input" placeholder="添加待办..." />
      <button type="submit">添加</button>
    </form>
    <div id="todo-list"></div>
  </div>

  <script type="module">
    import { createApp, ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
    import { DittoSDK, useDittoCell, useDittoUI, useDittoApp } from 'https://unpkg.com/@ditto/sdk/dist/index.js';

    const App = {
      setup() {
        const { cellGet, cellPost, cellPut, cellDelete } = useDittoCell();
        const { showNotification } = useDittoUI();
        const { registerApp, ready } = useDittoApp();

        const todos = ref([]);
        const newText = ref('');

        registerApp({ id: 'com.ditto.todo', name: 'Ditto Todo', version: '1.0.0' });

        async function loadTodos() {
          const result = await cellGet('com.ditto.todo', '/todos');
          todos.value = result.todos;
        }

        async function addTodo() {
          if (!newText.value.trim()) return;
          await cellPost('com.ditto.todo', '/todos', { text: newText.value });
          newText.value = '';
          await loadTodos();
          showNotification('已添加', '待办事项已创建', 'success');
        }

        async function toggleTodo(id) {
          await cellPut(`com.ditto.todo`, `/todos/${id}`, {});
          await loadTodos();
        }

        async function deleteTodo(id) {
          await cellDelete('com.ditto.todo', `/todos/${id}`);
          await loadTodos();
        }

        onMounted(() => {
          loadTodos();
          ready();
        });

        return { todos, newText, addTodo, toggleTodo, deleteTodo };
      },
      template: `
        <div>
          <h1>✅ Ditto Todo</h1>
          <form @submit.prevent="addTodo">
            <input v-model="newText" placeholder="添加待办..." />
            <button type="submit">添加</button>
          </form>
          <div v-for="todo in todos" :key="todo.id" class="todo-item">
            <input type="checkbox" :checked="todo.done" @change="toggleTodo(todo.id)" />
            <span :class="{ done: todo.done }">{{ todo.text }}</span>
            <button @click="deleteTodo(todo.id)">删除</button>
          </div>
        </div>
      `,
    };

    const app = createApp(App);
    app.use(DittoSDK);
    app.mount('#app');
  </script>
</body>
</html>
```

### 5. 打包

```bash
# 使用 CLI
ditto pack --manifest ./manifest.json --frontend ./frontend --backend ./backend --output ./com.ditto.todo-1.0.0.dit

# 或使用 API
import { Packager } from '@ditto/packager';
const packager = new Packager();
await packager.pack({
  type: 'app',
  manifest: require('./manifest.json'),
  frontendDir: './frontend',
  backendDir: './backend',
  outputPath: './com.ditto.todo-1.0.0.dit',
});
```

### 6. 安装到服务端

```bash
# CLI 安装
ditto install ./com.ditto.todo-1.0.0.dit --server http://localhost:3001

# 或手动放置到 server/data/apps/com.ditto.todo/
```

服务端目录结构：

```
server/data/apps/com_ditto_todo/
├── manifest.json
├── frontend/
│   └── index.html
└── backend/
    └── index.ts
```

## 开发调试技巧

### 1. 开启 dev 模式

在 kernel 配置中开启 `dev: true`，权限自动授权，避免开发期被阻塞：

```typescript
const kernel = createKernel({
  kernel: { id: 'dev-kernel', dev: true },
});
```

### 2. Vite dev server 代理

`apps/shell/vite.config.ts` 已配置 `/api` 代理到 `http://localhost:3001`，开发时直接访问 `http://localhost:3000`，无需处理 CORS。

### 3. 调试后端 Cell

后端 Cell 在 Bun 环境运行，支持热重载：

```bash
cd server
bun run --watch src/index.ts
```

修改 `backend/index.ts` 后，server 自动重启。前端通过 `useDittoCell.checkBackendHealth()` 检测状态。

### 4. 查看 Cell 状态

```bash
# 查看所有 Cell
curl http://localhost:3001/api/health

# 查看特定应用 Cell
curl http://localhost:3001/api/cell/com.ditto.todo/health
```

### 5. 浏览器 DevTools

- **iframe 内调试**：在 DevTools 的 Sources 面板选择对应 iframe context
- **postMessage 监听**：Console 中执行 `window.addEventListener('message', e => console.log(e.data))`
- **WebSocket 检查**：Network 面板筛选 WS

### 6. 本地测试应用

将应用放入 `server/data/apps/{app_id_with_underscores}/`，例如：

```
server/data/apps/com_ditto_todo/
```

服务端会自动扫描并注册。

### 7. 模拟移动端

使用浏览器 DevTools 的设备模拟器，`useDeviceMode` 会自动响应断点变化：

- `< 768px` → mobile
- `768 ~ 1024px` → tablet
- `> 1280px` → desktop

### 8. 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|---------|
| `CELL_ALREADY_RUNNING` | Cell 已在运行 | 先 stopCell 再 startCell |
| `CELL_START_FAILED` | 启动失败 | 检查后端模块 import 路径 |
| `PERMISSION_DENIED` | 权限被拒 | 检查 manifest.permissions 是否声明 |
| `IPC_REQUEST_TIMEOUT` | IPC 超时 | 检查宿主是否注册了对应 handler |
| `SANDBOX_CREATE_FAILED` | 沙盒创建失败 | 检查 origin 是否提供 |
| `SERVICE_NOT_REGISTERED` | 服务未注册 | 检查 `registerKernelServices` 是否调用 |
