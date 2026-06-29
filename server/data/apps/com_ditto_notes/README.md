# Ditto Notes

> 轻量级 Markdown 笔记 — 编辑/预览/分屏三模式，自动保存与自实现 Markdown 渲染器

## 简介

Ditto Notes 是一个轻量级 Markdown 笔记应用，提供笔记列表、三模式编辑（纯编辑/纯预览/分屏）、自实现的 Markdown 渲染器与自动保存。笔记以数组形式存储在 `localStorage`（key: `ditto_notes`），首行自动作为标题。manifest 中声明了 `backend.entry`，但实际功能完全在前端完成。

## 应用 ID

`com.ditto.notes`

## 截图占位

> 双栏布局：左侧笔记列表（标题 + 日期）/ 右侧编辑器（编辑/预览/分屏三标签）
> 分屏模式下左侧 Markdown 源码、右侧实时渲染预览
> 红色 `#e94560` 作为主色调，标题与强调元素统一

## 功能特性

- **笔记列表**：左侧侧栏列出所有笔记，显示标题与本地化日期，新建笔记置顶
- **三模式编辑**：编辑（纯文本）、预览（纯渲染）、分屏（左右并排），标签切换无闪烁
- **自实现 Markdown 渲染器**：支持 H1/H2/H3、`**粗体**`、`*斜体*`、`` `行内代码` ``、无序列表、引用块
- **自动标题提取**：笔记首行去除 `#` 前缀后作为列表标题，无需手动填写
- **自动保存**：`oninput` 事件触发 `localStorage.setItem`，每次输入即持久化
- **首次启动示例**：无笔记时自动创建「欢迎使用 Ditto Notes」示例笔记

## 技术实现要点

### Chrome 80 兼容策略
- 使用 `flex` 布局与基础 CSS 选择器，无现代 CSS 特性
- Markdown 渲染基于正则 + 字符串 `replace` 链，无外部库依赖
- 字体回退 `'Consolas','Fira Code'` 等编程字体

### Markdown 渲染管线
```javascript
function renderMarkdown(text) {
  let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');  // 先转义
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');                                 // 再标记
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\n/g, '<br>');
  return html;
}
```
关键顺序：**先 HTML 转义再 Markdown 标记**，避免用户输入的 `<script>` 被执行。

### 数据结构
```javascript
[
  { id: "1", title: "欢迎使用", content: "# 标题\n\n正文...", updatedAt: "2026-06-29T..." }
]
```
`unshift` 新笔记，`filter` 删除，列表顺序即时间倒序。

### 响应式
移动端（`max-width:768px`）侧栏改为顶部 40vh 区域，分屏模式改为上下 50/50。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `productivity` | 生产力分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `["storage"]` | LocalStorage 持久化笔记 |
| `backend.entry` | `backend/index.ts` | 声明后端入口（当前未实际使用） |
| `window.width/height` | `720×540` | 宽屏窗口，最小 `480×360` |

## 文件结构

```
com_ditto_notes/
├── manifest.json       # 应用清单（含 backend.entry 声明）
├── frontend/
│   └── index.html      # 单文件 UI（约 170 行，含 Markdown 渲染器）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **自实现 Markdown 渲染器**：用 10 行正则链即可覆盖 80% 常见 Markdown 语法，无需引入 marked.js 等库
- **HTML 转义优先**：渲染前先转义 `& <>`，是防 XSS 的最小成本方案
- **`oninput` 自动保存**：每次输入即写入 `localStorage`，无需「保存」按钮，是笔记类应用的标准范式
- **首行作为标题**：去除 `#` 前缀后取首行作为列表标题，降低用户认知负担
- **`backend.entry` 占位**：manifest 可声明后端入口但前端独立运行，便于后续扩展为 dit 应用

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
