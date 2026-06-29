# Ditto Calculator

> 简洁美观的科学计算器 — 单文件应用示例，演示键盘交互与历史记录

## 简介

Ditto Calculator 是一个纯前端计算器应用，采用 GitHub 暗色配色，支持四则运算、括号嵌套与小数运算。作为 `app` 类型应用的最小示例，它仅依赖 `frontend/index.html` 一个文件即可运行，无需后端 Cell、无需持久化权限。

## 应用 ID

`com.ditto.calc`

## 截图占位

> 显示区 + 4×5 按键网格 + 历史记录条
> 表达式行（灰色小字）显示当前输入，结果行（蓝色大字）显示计算结果
> 底部历史记录区列出最近 10 次计算式

## 功能特性

- **四则运算**：支持 `+ - × ÷` 与括号嵌套表达式
- **实时表达式回显**：输入框上方实时显示当前表达式，`*`/`/`/`-` 自动转为 `×`/`÷`/`−`
- **运算符去重**：连续按运算符不会重复插入，避免语法错误
- **历史记录**：保留最近 10 条计算式，新结果置顶
- **键盘全支持**：数字键、运算符、`Enter`(=)、`Backspace`(⌫)、`Escape`(C) 均可触发
- **错误隔离**：用 `Function` 构造器在严格模式下求值，输入经白名单字符过滤，异常返回 `Error`

## 技术实现要点

### Chrome 80 兼容策略
- 仅使用 ES5+ 通用特性，无 `??`/`?.`/可选链等新语法
- CSS 使用基础 Grid 布局（`grid-template-columns: repeat(4, 1fr)`），不依赖 `gap` 之外的现代属性
- 无外部依赖，单 HTML 文件即可运行

### 安全求值
表达式经过 `replace(/[^0-9+\-*/.()]/g, '')` 白名单过滤后，通过 `Function('"use strict"; return (' + sanitized + ')')()` 求值。这比 `eval` 更可控，但仍受限于白名单字符集，杜绝注入风险。

### 精度处理
计算结果通过 `parseFloat(result.toPrecision(12))` 截断浮点误差，避免 `0.1 + 0.2 = 0.30000000000000004` 之类的显示问题。

### 响应式
`@media(max-width:768px)` 媒体查询缩放字号、间距与按钮高度，移动端按钮 `min-height: 44px` 满足触控规范。

### 配色分层
GitHub Dark 风格的按钮分类：
- 数字键：`#21262d` 中性灰底
- 运算符：`#1f3a5f` 深蓝底 + `#58a6ff` 蓝字
- 功能键：`#2d1b3d` 深紫底 + `#bc8cff` 紫字
- 等号：`#1f6feb` 亮蓝底
- 清除：`#3d1f1f` 深红底 + `#f85149` 红字

按钮带 `:active { transform: scale(0.95) }` 点击反馈，过渡 0.1s。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用，非 widget/plugin/theme/dit |
| `category` | `utility` | 实用工具分类 |
| `sandbox` | `trusted` | 受信沙盒，可访问 DOM API |
| `permissions` | `[]` | 无需任何权限，纯计算 |
| `window.width/height` | `360×520` | 紧凑窗口尺寸，最小 `280×400` |
| `window.maximizable` | `true` | 允许最大化 |

## 文件结构

```
com_ditto_calc/
├── manifest.json       # 应用清单（type: app, permissions: []）
├── frontend/
│   └── index.html      # 单文件 UI（HTML + CSS + JS）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **单文件应用**：`permissions: []` + 纯 `frontend/index.html`，是无需后端的轻量应用最简结构
- **键盘绑定**：通过 `document.addEventListener('keydown', ...)` 监听全局按键，无需第三方库即可实现完整键盘流
- **白名单求值**：用正则白名单 + `Function` 构造器替代 `eval`，兼顾灵活与安全
- **运算符映射**：UI 显示符号（`×÷−`）与内部运算符（`*/-`）通过 `replace` 转换，保持输入流简洁

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
