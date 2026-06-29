# Nord Theme

> 北欧极光主题 — Nord 官方 8 色调色板、排版、按钮与卡片示例

## 简介

Nord Theme 是一个 `theme` 类型的主题预览应用，基于 [Nord 官方调色板](https://www.nordtheme.com/) 实现。展示 8 色极光配色、排版层级、按钮样式与卡片示例。采用 `#2e3440` 极夜底色 + `#88c0d0` 霜雪强调色，营造冷峻优雅的北欧氛围。

## 应用 ID

`com.ditto.theme.nord`

## 截图占位

> 单列预览页：标题「❄️ Nord Theme」+ 副标题
> 4 个预览卡片：调色板（8 色块）/ 排版（H1/H2/正文/说明/代码）/ 按钮（Primary/Accent/Success/Ghost）/ 卡片示例（极光/冰川）
> 底部「应用主题」按钮 + 状态提示

## 功能特性

- **8 色 Nord 调色板**：Primary `#88c0d0` / Accent `#81a1c1` / Background `#2e3440` / Surface `#3b4252` / Success `#a3be8c` / Warning `#ebcb8b` / Error `#bf616a` / Info `#5e81ac`
- **排版层级**：H1（22px/700）/ H2（18px/600）/ 正文（14px/400）/ 说明（12px 浅灰）/ 等宽代码（13px 带半透明蓝背景）
- **4 种按钮**：Primary（霜雪青）/ Accent（霜蓝）/ Success（绿）/ Ghost（透明边框）
- **卡片示例**：双卡片网格，含「❄️ 极光」「🏔️ 冰川」示例内容
- **应用按钮反馈**：点击「应用主题」显示 2 秒「✅ 主题已应用」提示后淡出

## 技术实现要点

### Chrome 80 兼容策略
- 纯静态 HTML + 内联样式，仅一个 `applyTheme` 函数
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

### Nord 配色逻辑
```css
body { background: #2e3440; color: #eceff4; }       /* Polar Night 底 + Snow Storm 字 */
.preview-box { background: #3b4252; border: 1px solid #4c566a; }  /* Snow Storm 边 */
h1 span, .preview-box h3 { color: #88c0d0; }         /* Frost 强调 */
.demo-card { background: rgba(136,192,208,0.1); }    /* 半透明 Frost */
```
遵循 Nord 官方的三层结构：Polar Night（深底）→ Snow Storm（浅字）→ Frost（彩色强调）。

### 卡片半透明背景
```css
.demo-card {
  background: rgba(136,192,208,0.1);   /* Frost 10% 透明 */
  border: 1px solid #4c566a;
}
```
半透明强调色营造冰晶质感，是 Nord 主题的标志性视觉。

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
com_ditto_theme_nord/
├── manifest.json       # 应用清单（type: theme）
├── frontend/
│   └── index.html      # 单文件预览页（约 108 行，含 Nord 官方调色板）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **Nord 官方调色板**：8 色分三层（Polar Night / Snow Storm / Frost），是开源社区广泛使用的色板规范
- **半透明强调色**：`rgba(136,192,208,0.1)` 用作卡片背景，比纯色更柔和，是深色主题的常用技巧
- **theme 标准预览结构**：调色板 + 排版 + 按钮 + 卡片四个预览盒，覆盖主题应用的所有视觉要素
- **应用按钮统一模式**：所有主题应用共享相同的 `applyTheme()` 函数，便于批量维护与扩展

## 开发参考

- [Nord 官方调色板](https://www.nordtheme.com/)
- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
