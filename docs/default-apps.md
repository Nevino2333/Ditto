# 默认应用关联

> Ditto 把"文件类型 / URL scheme / 文件扩展名"映射到应用 ID，类似桌面操作系统的"默认打开方式"。

## 设计目标

- **三方应用可声明自己的处理器**：通过 SDK 注册 mimeType/scheme/extension。
- **用户偏好优先**：用户可在「设置 → 默认应用」中覆盖系统默认。
- **持久化**：用户覆盖持久化到 localStorage，跨会话保留。
- **可移植**：纯 Pinia store，无副作用，可在测试中注入。

## 服务 API

源码：`packages/services/src/default-apps/store.ts`

```typescript
import { useDefaultAppsStore } from '@ditto/services';

const store = useDefaultAppsStore();
```

### 注册处理器

应用启动时（通常在 SDK 初始化或 onMount 中）调用：

```typescript
// 注册 mimeType 处理器（isDefault=true 表示声明为系统默认）
store.registerMimeHandler('text/markdown', 'com.ditto.editor', true);
store.registerMimeHandler('text/plain', 'com.ditto.editor', false);

// 注册 URL scheme 处理器
store.registerSchemeHandler('mailto', 'com.ditto.mail', true);
store.registerSchemeHandler('tel', 'com.ditto.dialer', true);

// 注册文件扩展名处理器
store.registerExtensionHandler('.md', 'com.ditto.editor', true);
store.registerExtensionHandler('.json', 'com.ditto.editor', false);
```

> `isDefault=true` 表示该应用**声明**为系统默认；但若多个应用都声明为默认，最后注册的胜出。
> 用户覆盖始终优先于应用声明。

### 查询处理器

文件管理器、邮件客户端等打开外部资源时调用：

```typescript
// 按 mimeType 查询
const handler = store.getHandlerForMime('text/markdown');
// => { appId: 'com.ditto.editor', userOverride: false }

// 按文件扩展名查询
const handler = store.getHandlerForExtension('.md');

// 按 URL scheme 查询
const handler = store.getHandlerForScheme('mailto');

if (handler) {
  // 启动应用并传递文件路径
  await appStore.launchApp(handler.appId, { openFile: '/path/to/file.md' });
} else {
  // 显示"无可用应用"对话框
  dialogStore.alert({ title: '无法打开', message: '没有应用可以处理此文件类型' });
}
```

### 列出所有候选（"打开方式"菜单）

```typescript
const candidates = store.listHandlersForMime('text/markdown');
// => ['com.ditto.editor', 'com.ditto.notes', 'com.ditto.preview']

// 显示"打开方式"菜单让用户选择
contextMenu.value = {
  visible: true,
  x: e.clientX,
  y: e.clientY,
  items: candidates.map(appId => {
    const manifest = appStore.apps.find(a => a.id === appId);
    return {
      label: manifest?.name ?? appId,
      icon: manifest?.icon,
      action: () => appStore.launchApp(appId, { openFile: path }),
    };
  }),
};
```

### 用户覆盖

「设置 → 默认应用」面板调用，让用户改变默认：

```typescript
// 用户把 .md 默认改为 com.ditto.notes
store.setUserOverride('ext', '.md', 'com.ditto.notes');

// 恢复应用声明的默认
store.clearUserOverride('ext', '.md');
```

### 注销应用

应用卸载时清理：

```typescript
// 清理该应用注册的所有处理器
store.unregisterApp('com.ditto.editor');
```

## 优先级解析

当查询某 mimeType 的处理器时，按以下顺序解析：

1. **用户覆盖**（`userOverrides['mime:text/markdown']`）—— 若存在且应用仍注册，使用之
2. **声明为系统默认**的应用（`isDefault=true`）—— 多个时取最后注册的
3. **最新注册**的应用（按 `registeredAt` 降序）

## 与 manifest 的关系

应用可在 `manifest.json` 中**声明**自己支持的文件类型（推荐做法，启动时由 SDK 自动注册）：

```json
{
  "id": "com.ditto.editor",
  "fileHandlers": [
    { "mimeType": "text/markdown", "extensions": [".md", ".markdown"], "isDefault": true },
    { "mimeType": "text/plain", "extensions": [".txt"], "isDefault": false },
    { "mimeType": "application/json", "extensions": [".json"], "isDefault": false }
  ]
}
```

SDK 在应用启动时读取 `fileHandlers` 字段并调用 `registerMimeHandler/registerExtensionHandler`。manifest 中的声明只是元信息，**实际注册发生在运行时**。

> ⚠️ `fileHandlers` 字段当前为推荐规范，SDK 暂未自动注册。第三方应用应在 `onMount` 中显式调用 `registerMimeHandler` 等方法。

## 与浏览器 PWA file_handlers 的区别

浏览器原生 [File Handling API](https://developer.mozilla.org/docs/Web/Manifest/file_handlers) 只能在 PWA 安装后生效，且仅支持文件类型（不支持 URL scheme）。Ditto 的默认应用关联：

- 不依赖 PWA 安装
- 支持 mimeType / scheme / extension 三类
- 支持用户覆盖与"打开方式"菜单
- 可在沙盒内运行（不污染宿主浏览器）

## 内置默认映射

Ditto 内置应用启动时注册的默认处理器（在 Shell `onMounted` 中）：

| 类型 | Key | 默认应用 |
|------|-----|---------|
| extension | `.md` | `com.ditto.editor` |
| extension | `.txt` | `com.ditto.editor` |
| extension | `.json` | `com.ditto.editor` |
| extension | `.js` | `com.ditto.editor` |
| extension | `.ts` | `com.ditto.editor` |
| extension | `.html` | `com.ditto.editor` |
| extension | `.css` | `com.ditto.editor` |
| mimeType | `text/*` | `com.ditto.editor` |
| mimeType | `application/json` | `com.ditto.editor` |

第三方应用可通过 `isDefault=true` 抢占这些默认（最后注册的胜出），或通过 `setUserOverride` 让用户永久改变。
