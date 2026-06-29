# Midnight Theme

> 优雅的午夜深色主题 — 8 色调色板与按钮样式预览

## 简介

Midnight Theme 是一个 `theme` 类型的主题预览应用，展示午夜深色调色板（8 色）与按钮样式。采用 `#1a1a2e` 深紫底 + `#e94560` 红粉强调色，营造午夜护眼氛围。相比其他主题，本主题预览页较精简，仅含调色板与按钮两个预览区。

## 应用 ID

`com.ditto.theme.midnight`

## 截图占位

> 单列预览页：标题「🌙 Midnight Theme」+ 副标题
> 2 个预览卡片：调色板（8 色块）/ 按钮样式（Primary/Accent/Success/Ghost）
> 底部「应用主题」按钮 + 状态提示

## 功能特性

- **8 色调色板**：Primary `#e94560` / Accent `#58a6ff` / Background `#1a1a2e` / Surface `#16213e` / Success `#3fb950` / Warning `#d29922` / Error `#f85149` / Purple `#bc8cff`
- **4 种按钮**：Primary（红粉）/ Accent（蓝）/ Success（绿）/ Ghost（深灰边框）
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

### 配色逻辑
```css
body { background: #1a1a2e; color: #e0e0e0; }       /* 深紫底 + 浅灰字 */
.preview-box { background: #16213e; border: 1px solid #30363d; }  /* 更深蓝底 + 灰边 */
h1 span, .preview-box h3 { color: #58a6ff; }        /* GitHub 蓝强调 */
.apply-btn { background: #e94560; }                  /* 红粉主按钮 */
```
深紫 + 红粉的对比是午夜主题的标志性搭配。

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
com_ditto_theme_midnight/
├── manifest.json       # 应用清单（type: theme）
├── frontend/
│   └── index.html      # 单文件预览页（约 73 行，最精简的主题预览）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **最简主题预览**：仅调色板 + 按钮两个预览盒，是 theme 类型应用的最小可用结构
- **GitHub 暗色配色**：`#1a1a2e` + `#58a6ff` + `#e94560` 借鉴 GitHub Dark Dimmed，护眼且对比度适中
- **`type: theme` 标准结构**：manifest 声明 theme 类型 + 预览页提供色板，是开发新主题的通用范式
- **应用按钮统一模式**：所有主题应用共享相同的 `applyTheme()` 函数，仅状态色不同，便于批量维护

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
