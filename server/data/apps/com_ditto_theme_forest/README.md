# Forest Theme

> 自然森林绿色主题 — 调色板预览、排版样例、按钮与卡片示例

## 简介

Forest Theme 是一个 `theme` 类型的主题预览应用，展示森林绿色调色板（8 色）、排版层级、按钮样式与卡片示例。点击「应用主题」按钮触发应用状态提示（演示性质）。采用深绿主色 `#1b4332` + 浅绿强调 `#52b788` 配色，营造自然森林氛围。

## 应用 ID

`com.ditto.theme.forest`

## 截图占位

> 单列预览页：标题「🌲 Forest Theme」+ 副标题
> 4 个预览卡片：调色板（8 色块）/ 排版（H1/H2/正文/说明/代码）/ 按钮（Primary/Accent/Success/Ghost）/ 卡片示例（年轮/苔藓）
> 底部「应用主题」按钮 + 状态提示

## 功能特性

- **8 色调色板**：Primary `#2d6a4f` / Accent `#52b788` / Background `#1b4332` / Surface `#081c15` / Success `#06d6a0` / Warning `#ffd166` / Error `#ef476f` / Info `#74c69d`
- **排版层级**：H1（22px/700）/ H2（18px/600）/ 正文（14px/400）/ 说明（12px 浅绿）/ 等宽代码（13px 带背景）
- **4 种按钮**：Primary（深绿）/ Accent（亮绿）/ Success（青绿）/ Ghost（透明边框）
- **卡片示例**：双卡片网格，含「🌲 年轮」「🌿 苔藓」示例内容
- **应用按钮反馈**：点击「应用主题」显示 2 秒「✅ 主题已应用」提示后淡出

## 技术实现要点

### Chrome 80 兼容策略
- 纯静态 HTML + 内联样式，无 JavaScript 逻辑（除应用按钮反馈）
- `grid-template-columns: repeat(auto-fill, minmax(100px, 1fr))` 自适应色块网格
- 字体回退 `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### 应用按钮实现
```javascript
function applyTheme() {
  const el = document.getElementById('status');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}
```
点击后添加 `show` 类显示提示，2 秒后移除。`transition: opacity 0.3s` 提供淡入淡出。

### 配色逻辑
```css
body { background: #1b4332; color: #d8f3dc; }       /* 深绿底 + 浅绿字 */
.preview-box { background: #081c15; border: 1px solid #2d6a4f; }  /* 更深底 + 中绿边 */
h1 span, .preview-box h3 { color: #52b788; }         /* 亮绿强调 */
```
深→浅三层绿色营造森林纵深感。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `theme` | 主题类型 |
| `category` | `theme` | 主题分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `[]` | 主题无需权限 |
| `window.width/height` | `480×400` | 预览窗口，最小 `360×300` |

## 文件结构

```
com_ditto_theme_forest/
├── manifest.json       # 应用清单（type: theme）
├── frontend/
│   └── index.html      # 单文件预览页（约 108 行）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **theme 类型应用**：`type: theme` + `category: theme`，作为可安装的主题包提供调色板预览
- **8 色标准调色板**：Primary/Accent/Background/Surface/Success/Warning/Error/Info 是主题应用的通用色板结构
- **预览卡片分区**：调色板 / 排版 / 按钮 / 卡片四个预览盒，覆盖主题应用的所有视觉要素
- **应用按钮反馈**：`classList.add('show')` + `setTimeout` 移除，是最简单的操作反馈模式
- **内联样式色块**：每个色块用 `style="background:#xxx;color:#yyy"` 直接内联，便于复制色值

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
