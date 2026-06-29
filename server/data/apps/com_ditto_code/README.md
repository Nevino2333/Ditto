# Ditto Code

> 轻量级代码编辑器 — 多标签文件、4 语言语法高亮、内嵌控制台与 LocalStorage 持久化

## 简介

Ditto Code 是一个 VSCode 风格的轻量代码编辑器，支持 JavaScript/HTML/CSS/Python 四种语言的语法高亮、多文件标签管理、行号、Tab 缩进、括号匹配、JavaScript 即时运行与 REPL 控制台。所有文件状态通过 `localStorage` 持久化（key: `ditto-code-files`），刷新后恢复工作区。

## 应用 ID

`com.ditto.code`

## 截图占位

> VSCode 风格四栏布局：标题栏 / 侧栏文件列表 / 标签栏 + 工具栏 + 编辑器（行号+高亮）/ 控制台 / 状态栏
> 编辑器使用透明 textarea 叠加在 `<pre>` 高亮层上的双图层技术
> 控制台支持 `›` 提示符输入 JavaScript 表达式

## 功能特性

- **多文件管理**：侧栏文件列表 + 顶部标签栏，支持新建/切换/关闭，文件名按语言自动加扩展名
- **4 语言语法高亮**：JS/HTML/CSS/Python 各自的正则分词器，识别关键字/字符串/数字/注释/函数/类型等 14 类 token
- **行号与光标定位**：左侧动态行号，当前行高亮，状态栏实时显示「行 X, 列 Y」
- **智能缩进**：`Tab` 插入 2 空格、`Shift+Tab` 反缩进、`Enter` 自动继承缩进并在 `{([` 后追加缩进
- **JavaScript 运行**：`Ctrl+Enter` 运行当前文件，劫持 `console.log/error/warn` 输出到内嵌控制台
- **REPL 控制台**：底部输入框支持 `eval` 任意 JS 表达式，结果以 `←` 前缀回显
- **快捷键**：`Ctrl+S` 保存、`Ctrl+Enter` 运行、`Tab/Shift+Tab` 缩进

## 技术实现要点

### Chrome 80 兼容策略
- 使用经典 textarea + `<pre>` 双层叠加技术实现高亮（兼容性最佳，无需 ContentEditable 或 Monaco）
- `scroll` 事件同步三层（textarea / highlight / lineNumbers）的滚动位置
- 无外部依赖，所有正则分词器为原生实现

### 双层编辑器架构
```html
<pre class="code-highlight" id="codeHighlight"></pre>  <!-- 高亮层 z-index:1 pointer-events:none -->
<textarea class="code-textarea" id="codeTextarea"></textarea>  <!-- 输入层 z-index:2 透明文字 -->
```
两层的字号、行高、padding 完全一致，textarea 文字设为 `color:transparent` 仅显示 caret，高亮层负责视觉。

### 分词器设计
每种语言独立的 `highlightXxx()` 函数，输出 token 数组 `{i, l, cls}`（位置/长度/CSS 类），通过 `applyTokens()` 排序去重后包裹 `<span>` 插入。函数调用与内建对象用单独的正则补充识别，并与已有 token 做重叠检测。

### 持久化
```javascript
localStorage.setItem('ditto-code-files', JSON.stringify(files));          // 文件列表
localStorage.setItem('ditto-code-state', JSON.stringify({activeFileId, fileCounter}));  // 活动文件
```
`beforeunload` 事件保证最后编辑内容写入。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `development` | 开发工具分类 |
| `sandbox` | `trusted` | 受信沙盒，可执行 `eval`/`Function` |
| `permissions` | `["storage"]` | LocalStorage 持久化文件 |
| `window.width/height` | `800×600` | 较大窗口，最小 `600×400` |

## 文件结构

```
com_ditto_code/
├── manifest.json       # 应用清单（category: development）
├── frontend/
│   └── index.html      # 单文件 UI（约 800 行，含 4 语言分词器）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **textarea + pre 叠加**：实现代码高亮编辑器的经典方案，无需引入 Monaco/CodeMirror，体积仅几十 KB
- **正则分词器**：每种语言一套正则 + token 数组，灵活可扩展，是轻量语法高亮的通用范式
- **`Ctrl+Enter` 运行**：劫持 `console.*` 重定向到自定义 DOM 输出，实现纯前端代码执行环境
- **多文件状态机**：`activeFileId` + `fileCounter` 双状态持久化，切换文件时先保存前一个文件内容
- **滚动同步**：`textarea.addEventListener('scroll', syncScroll)` 同步高亮层与行号，三层保持像素对齐

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
