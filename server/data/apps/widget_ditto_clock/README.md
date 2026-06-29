# Ditto Clock

> 精美的模拟/数字时钟小组件 — SVG 表盘、毫秒级平滑指针、点击切换模式

## 简介

Ditto Clock 是一个 `widget` 类型的小组件，提供模拟时钟与数字时钟双模式，点击切换。模拟时钟使用 SVG 绘制表盘、60 个刻度、12 个数字与三根指针，通过 `requestAnimationFrame` 实现毫秒级平滑转动。数字模式显示 `HH:MM:SS` 与中文日期。

## 应用 ID

`widget.ditto.clock`

## 截图占位

> 居中圆形表盘：深色面盘 + 60 刻度（每 5 个为长刻度）+ 12 个数字 + 三根指针（时/分/秒）
> 秒针红色，中心圆点带 `pulse-dot` 呼吸动画
> 底部显示中文日期「2026年6月29日 周一」
> 悬停显示「点击切换模式」提示

## 功能特性

- **模拟时钟模式**：SVG 绘制的圆形表盘，含 60 刻度（12 长 + 48 短）与 12 个数字
- **数字时钟模式**：`HH:MM:SS` 大字号显示，秒数用红色小字辅助
- **点击切换**：点击容器即切换模拟/数字模式，模式状态不持久化
- **毫秒级平滑**：`requestAnimationFrame` + `getMilliseconds()` 让秒针带亚秒级平滑转动
- **三指针联动**：时针考虑分钟偏移，分针考虑秒数偏移，符合真实钟表逻辑
- **响应式**：移动端表盘缩放至 120px，字号等比缩小

## 技术实现要点

### Chrome 80 兼容策略
- 使用 SVG `<line>`/`<circle>`/`<text>` 基础元素，兼容所有现代浏览器
- `createElementNS('http://www.w3.org/2000/svg', ...)` 动态创建 SVG 节点
- `transform: rotate(angle, 100, 100)` SVG 旋转语法，无需 CSS transform
- `requestAnimationFrame` 替代 `setInterval`，避免卡顿与抖动

### SVG 表盘构建
```javascript
// 60 个刻度
for (var i = 0; i < 60; i++) {
  var angle = (i * 6) * Math.PI / 180;        // 每刻度 6 度
  var isMajor = i % 5 === 0;                   // 每 5 个为长刻度
  var outerR = 90, innerR = isMajor ? 78 : 84;
  // 用三角函数计算刻度两端坐标
  line.setAttribute('x1', 100 + innerR * Math.sin(angle));
  line.setAttribute('y1', 100 - innerR * Math.cos(angle));
  // ...
}

// 12 个数字
var numLabels = [12,1,2,3,4,5,6,7,8,9,10,11];
for (var i = 0; i < 12; i++) {
  var angle = (i * 30) * Math.PI / 180;       // 每数字 30 度
  text.setAttribute('x', 100 + 68 * Math.sin(angle));
  text.setAttribute('y', 100 - 68 * Math.cos(angle));
}
```

### 指针角度计算
```javascript
var sAngle = (s + ms / 1000) * 6;              // 秒针：每秒 6 度 + 毫秒平滑
var mAngle = (m + s / 60) * 6;                 // 分针：每分 6 度 + 秒数偏移
var hAngle = ((h % 12) + m / 60) * 30;         // 时针：每小时 30 度 + 分钟偏移
```
毫秒参与秒针计算，实现亚秒级平滑流动而非跳秒。

### 模式切换
```javascript
clockContainer.addEventListener('click', function() {
  isAnalog = !isAnalog;
  analogWrap.classList.toggle('hidden', !isAnalog);
  digitalWrap.classList.toggle('active', !isAnalog);
});
```
通过 CSS `display: none/flex` 切换，无动画过渡。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `widget` | 小组件类型，桌面常驻 |
| `category` | `utility` | 实用工具分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `[]` | 无需任何权限 |
| `window.width/height` | `320×240` | 紧凑尺寸，最小 `200×150` |
| `window.maximizable` | `false` | widget 不可最大化 |

## 文件结构

```
widget_ditto_clock/
├── manifest.json       # 应用清单（type: widget）
├── frontend/
│   └── index.html      # 单文件 UI（约 180 行，含 SVG 表盘 + rAF 驱动）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **SVG 动态构建**：用 `createElementNS` 循环生成刻度与数字，避免手写 60 个 `<line>`，是 SVG 重复元素的通用范式
- **`requestAnimationFrame` 时钟**：比 `setInterval(1000)` 更平滑，可结合 `getMilliseconds()` 实现亚秒级动画
- **widget 类型应用**：`type: widget` + `maximizable: false` + 紧凑尺寸，适合桌面常驻小组件
- **三角函数定位**：`x = cx + r * sin(θ)`、`y = cy - r * cos(θ)` 是圆形布局的标准公式，起点为 12 点钟方向
- **点击切换模式**：单一容器监听 click，通过 `classList.toggle` 切换显示，最小化交互实现

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
