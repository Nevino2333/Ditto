# Clipboard Manager

> 剪贴板历史管理插件 — 自动分类、搜索、固定、清空与 paste 事件监听

## 简介

Clipboard Manager 是一个 `plugin` 类型的剪贴板历史管理应用，自动捕获页面内的 `paste` 事件，将复制内容分类为文本/链接/代码三类，支持搜索、固定、展开、清空等操作。首次启动注入 8 条示例数据演示功能。采用 Catppuccin Mocha 风格暗色配色。

## 应用 ID

`com.ditto.plugin.clipboard`

## 截图占位

> 竖向布局：标题 + 搜索框 / 5 个过滤标签（全部/文本/链接/代码/已固定）/ 记录数 + 清空按钮 / 剪贴板列表
> 每条记录含内容预览（长内容折叠）、时间、分类标签、固定/复制/删除按钮
> 固定项带 📌 角标与黄色边框

## 功能特性

- **自动捕获 paste**：监听 `document` 的 `paste` 事件，自动将复制内容存入历史
- **智能分类**：根据内容正则识别为 link（`http(s)://`）/ code（含 `function|const|=>` 等关键字 + 括号）/ text（默认）
- **5 类过滤**：全部 / 文本 / 链接 / 代码 / 已固定，标签切换即时刷新
- **搜索**：实时模糊匹配内容（不区分大小写）
- **固定置顶**：固定的记录始终排在最前，带黄色边框与 📌 角标
- **复制回剪贴板**：通过 `navigator.clipboard.writeText` 写回系统剪贴板
- **展开/折叠**：超过 80 字符的记录默认折叠，点击展开
- **清空确认**：清空前弹出模态确认对话框，避免误操作

## 技术实现要点

### Chrome 80 兼容策略
- `navigator.clipboard.writeText` 异步 API，配合 `.then()/.catch()` 处理成功/失败
- `document.addEventListener('paste', ...)` 监听全局粘贴事件
- `try/catch` 包裹 `JSON.parse(localStorage)`，避免损坏数据导致崩溃

### 智能分类算法
```javascript
function detectCategory(text) {
  if (/^https?:\/\//i.test(text.trim())) return 'link';              // URL
  if (/[{}\[\]();]/.test(text) && /function|const|let|var|import|class|return|=>/.test(text)) return 'code';
  return 'text';                                                       // 默认
}
```
通过双正则（结构符号 + 关键字）识别代码，比单一正则更准确。

### 数据结构
```javascript
{
  id: "lw1x2k3...",        // Date.now().toString(36) + 随机后缀
  text: "复制的内容",
  category: "link" | "code" | "text",
  pinned: false,
  timestamp: 1690000000000
}
```
数组存储在 `localStorage`（key: `ditto_clipboard_history`），新记录 `unshift` 置顶。

### 排序逻辑
```javascript
const pinned = clips.filter(c => c.pinned);
const unpinned = clips.filter(c => !c.pinned);
const sorted = [...pinned, ...unpinned];   // 固定项始终在前
```
固定与未固定分组后合并，保证固定项始终置顶。

### XSS 防护
```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;       // 浏览器自动转义
  return div.innerHTML;
}
```
利用 `textContent → innerHTML` 的浏览器原生转义，比手写正则更可靠。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `plugin` | 插件类型，提供系统能力扩展 |
| `category` | `utility` | 实用工具分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `["clipboard.read", "clipboard.write"]` | 声明读写系统剪贴板 |
| `window.width/height` | `400×500` | 紧凑窗口，最小 `300×400` |

## 文件结构

```
com_ditto_plugin_clipboard/
├── manifest.json       # 应用清单（type: plugin, permissions: [clipboard.*]）
├── frontend/
│   └── index.html      # 单文件 UI（约 300 行，含 paste 监听 + 智能分类）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **plugin 类型应用**：`type: plugin` + 声明 `clipboard.read/write` 权限，是扩展系统能力的标准范式
- **paste 事件监听**：`document.addEventListener('paste', e => addClip(e.clipboardData.getData('text')))` 自动捕获复制内容
- **`navigator.clipboard.writeText`**：异步写回系统剪贴板，是现代浏览器替代 `document.execCommand('copy')` 的标准方案
- **`textContent → innerHTML` 转义**：利用浏览器原生转义能力，避免手写正则遗漏边界情况
- **双正则分类**：结构符号 + 语义关键字双重判断，比单一特征识别更鲁棒
- **示例数据注入**：首次启动 `initDemoData()` 注入 8 条数据，便于用户理解功能

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
