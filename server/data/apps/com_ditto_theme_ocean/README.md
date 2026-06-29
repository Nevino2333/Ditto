# Ocean Theme

> 深邃海洋蓝色主题 — 8 色调色板、排版、按钮与卡片示例

## 简介

Ocean Theme 是一个 `theme` 类型的主题预览应用，展示深海蓝色调色板（8 色）、排版层级、按钮样式与卡片示例。采用 `#023e8a` 深海蓝底 + `#00b4d8` 亮青强调色，营造宁静致远的海洋氛围。

## 应用 ID

`com.ditto.theme.ocean`

## 截图占位

> 单列预览页：标题「🌊 Ocean Theme」+ 副标题
> 4 个预览卡片：调色板（8 色块）/ 排版（H1/H2/正文/说明/代码）/ 按钮（Primary/Accent/Success/Ghost）/ 卡片示例（潮汐/深海）
> 底部「应用主题」按钮 + 状态提示

## 功能特性

- **8 色海洋调色板**：Primary `#0077b6` / Accent `#00b4d8` / Background `#023e8a` / Surface `#03045e` / Success `#06d6a0` / Warning `#ffd166` / Error `#ef476f` / Info `#48bfe3`
- **排版层级**：H1（22px/700）/ H2（18px/600）/ 正文（14px/400）/ 说明（12px 浅青）/ 等宽代码（13px 带半透明蓝背景）
- **4 种按钮**：Primary（海蓝）/ Accent（亮青）/ Success（绿）/ Ghost（透明边框）
- **卡片示例**：双卡片网格，含「🌊 潮汐」「🐋 深海」示例内容
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

### 海洋配色逻辑
```css
body { background: #023e8a; color: #caf0f8; }       /* 深海蓝底 + 浅水青字 */
.preview-box { background: #03045e; border: 1px solid #0077b6; }  /* 更深底 + 中蓝边 */
h1 span, .preview-box h3 { color: #00b4d8; }        /* 亮青强调 */
.apply-btn { background: #0077b6; }                  /* 海蓝主按钮 */
.demo-card { background: rgba(0,119,182,0.2); }     /* 半透明海蓝卡片 */
```
深→浅三层蓝色营造海水深度感，从 `#03045e`（深渊）到 `#caf0f8`（浪花）。

### 色彩梯度设计
调色板按海水深度排列：
- `#03045e` 深渊（Surface）
- `#023e8a` 深海（Background）
- `#0077b6` 中海（Primary）
- `#00b4d8` 浅海（Accent）
- `#48bfe3` 浪花（Info）
- `#caf0f8` 泡沫（文字色）

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
com_ditto_theme_ocean/
├── manifest.json       # 应用清单（type: theme）
├── frontend/
│   └── index.html      # 单文件预览页（约 108 行，含海洋色梯度）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **色彩梯度设计**：按主题意象（海水深度）排列色板，从深到浅形成自然梯度，便于设计连贯的 UI 层级
- **半透明强调色**：`rgba(0,119,182,0.2)` 用作卡片背景，比纯色更有层次感，是深色主题的常用技巧
- **theme 标准预览结构**：调色板 + 排版 + 按钮 + 卡片四个预览盒，覆盖主题应用的所有视觉要素
- **应用按钮统一模式**：所有主题应用共享相同的 `applyTheme()` 函数，便于批量维护与扩展
- **意象化命名**：调色板按「深渊/深海/中海/浅海/浪花/泡沫」命名，比抽象的 Primary/Accent 更易记忆

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
