# Ditto Draw

> 轻量级画板应用 — 6 种工具、12 色调色板、撤销重做与 PNG 导出

## 简介

Ditto Draw 是一个基于双 Canvas 架构的画板应用，提供画笔/橡皮/直线/矩形/圆形/填充 6 种工具，支持 12 色预设调色板 + 自定义取色器、笔刷粗细（1-50px）、透明度（5%-100%）、最多 40 步撤销重做历史，以及 PNG 一键导出。采用 Catppuccin Mocha 风格暗色配色。

## 应用 ID

`com.ditto.draw`

## 截图占位

> 顶部工具栏分组：工具按钮 / 12 色调色板 + 取色器 / 粗细滑块 / 透明度滑块 / 撤销重做 / 清空保存
> 中间画布区（双 Canvas 叠加：主画布 + 预览画布）
> 底部状态栏：坐标 / 画布尺寸 / 当前工具

## 功能特性

- **6 种绘图工具**：画笔（平滑曲线）、橡皮（destination-out 合成）、直线、矩形、圆形、油漆桶填充
- **12 色预设 + 自定义取色器**：覆盖 Catppuccin 主色，最后一格为 `<input type="color">` 取色器
- **笔刷参数**：粗细 1-50px 滑块、透明度 5%-100% 滑块，实时数值显示
- **撤销/重做**：最多 40 步历史栈，每次操作前 `saveState()` 入栈，`Ctrl+Z`/`Ctrl+Y` 快捷键
- **油漆桶填充**：基于 `getImageData` 的洪水填充算法，支持容差 30 的颜色匹配
- **PNG 导出**：`canvas.toDataURL('image/png')` + `<a download>` 触发下载
- **快捷键**：`B/E/L/R/C/G` 切换工具、`Ctrl+Z/Y` 撤销重做

## 技术实现要点

### Chrome 80 兼容策略
- 使用 Canvas 2D API（`getContext('2d')`），所有绘图操作基于 `lineTo`/`stroke`/`fill`
- 触摸事件 `touchstart/touchmove/touchend` 配合 `passive:false` 阻止滚动
- `globalCompositeOperation: 'destination-out'` 实现橡皮擦，兼容性良好

### 双 Canvas 架构
```html
<canvas id="mainCanvas"></canvas>     <!-- 主画布，承载最终图像 -->
<canvas id="previewCanvas"></canvas> <!-- 预览画布，pointer-events:none，绘制临时形状 -->
```
绘制直线/矩形/圆形时，鼠标移动期间在 previewCanvas 上实时重绘，鼠标抬起时才提交到 mainCanvas，避免重绘整个主画布。

### 平滑曲线
画笔模式使用 `quadraticCurveTo` 在相邻两点的中点处插值，生成平滑贝塞尔曲线，避免锯齿：
```javascript
const mx = (lastX + pos.x) / 2;
const my = (lastY + pos.y) / 2;
ctx.quadraticCurveTo(lastX, lastY, mx, my);
```

### 洪水填充算法
基于栈的迭代式 flood fill，使用 `Uint8Array` 标记已访问像素避免递归栈溢出，颜色匹配带容差 30。

### 撤销重做
每次操作前将 `mainCanvas.toDataURL()` 推入 `undoStack`，撤销时弹出并加载到 `Image` 后 `drawImage` 回画布。`MAX_HISTORY = 40` 防止内存溢出。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `entertainment` | 娱乐分类 |
| `sandbox` | `trusted` | 受信沙盒，可访问 Canvas API |
| `permissions` | `[]` | 无需持久化权限（画布仅在内存） |
| `window.width/height` | `800×600` | 较大窗口，最小 `600×450` |

## 文件结构

```
com_ditto_draw/
├── manifest.json       # 应用清单（permissions: []）
├── frontend/
│   └── index.html      # 单文件 UI（约 500 行，含双 Canvas + flood fill）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **双 Canvas 叠加**：主画布存最终图像 + 预览画布存临时形状，是绘图应用的经典架构，避免重复重绘
- **`toDataURL` 历史栈**：用图片快照实现撤销重做，比命令模式简单且支持任意操作类型
- **`globalCompositeOperation: 'destination-out'`**：纯 Canvas 实现橡皮擦，无需额外图层
- **触摸事件统一处理**：`getPos(e)` 同时处理 `e.touches[0]` 与 `e`，鼠标与触摸共用一套绘制逻辑
- **SVG 工具图标**：按钮内嵌 `<svg>` 矢量图标，无需图标字体或图片资源

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
