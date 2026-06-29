# Ditto System

> 系统状态监控小组件 — CPU/内存/磁盘进度条、网络 sparkline 折线图、运行时长

## 简介

Ditto System 是一个 `widget` 类型的系统监控小组件，展示 CPU/内存/磁盘使用率进度条、网络上下行速率 sparkline 折线图、运行时长、活动应用数、进程数与 CPU 温度。数据通过模拟算法在客户端生成，每 2 秒更新一次，配合 `lerp` 线性插值实现平滑过渡。

## 应用 ID

`widget.ditto.system`

## 截图占位

> 紧凑竖向布局：标题 + 运行时长 / CPU 进度条 / 内存进度条 / 磁盘进度条 / 网络 sparkline + 上下行 / 3 个统计卡片（应用数/进程数/温度）
> 进度条带渐变色，sparkline 双线（绿色下行 + 蓝色上行）+ 渐变填充区域
> GitHub 暗色配色

## 功能特性

- **CPU/内存/磁盘三进度条**：带渐变色填充（绿/蓝/黄），`transition: width 1s ease` 平滑过渡
- **网络 sparkline 折线图**：Canvas 绘制双线（下行绿/上行蓝）+ 渐变填充区域，保留 60 个历史点
- **运行时长**：`UP H:MM:SS` 格式，每秒更新
- **3 个统计卡片**：活动应用数（6-16）/ 进程数（100-180）/ CPU 温度（35-85°C，随 CPU 负载联动）
- **模拟数据算法**：基于 `lerp` 线性插值 + 随机扰动，CPU 在 8-95% 区间波动，内存在 30-88% 区间
- **2 秒刷新**：`setInterval(simulate, 2000)` 更新所有指标，`setInterval(updateUptime, 1000)` 更新时长

## 技术实现要点

### Chrome 80 兼容策略
- Canvas 2D API 绘制 sparkline，`devicePixelRatio` 适配高分屏
- `requestAnimationFrame` 未使用，改用 `setInterval` 节省资源（widget 长驻）
- 所有数值通过 `Math.round` + `String.padStart` 格式化

### 数据模拟算法
```javascript
function simulate() {
  var cpuTarget = clamp(cpu + (Math.random() - 0.45) * 18, 8, 95);   // 略偏上升
  cpu = lerp(cpu, cpuTarget, 0.3);                                     // 30% 插值
  var memTarget = clamp(mem + (Math.random() - 0.48) * 6, 30, 88);    // 接近平衡
  mem = lerp(mem, memTarget, 0.2);                                     // 20% 插值
  var downSpeed = clamp(Math.random() * 800 + 50, 0, 1200);           // 50-850 KB/s
  var upSpeed = clamp(Math.random() * 300 + 20, 0, 500);              // 20-320 KB/s
  // CPU 温度随负载联动
  tempVal = clamp(42 + cpu * 0.4 + (Math.random() - 0.5) * 4, 35, 85);
}
```
`lerp(current, target, factor)` 让数值平滑趋近目标，避免跳变；`(Math.random() - 0.45)` 偏置让 CPU 略偏向上升。

### Canvas sparkline 绘制
```javascript
function drawSparkline() {
  var maxVal = Math.max(...netData.map(d => d.total), 100);     // 自适应最大值
  var stepX = w / (maxNetPoints - 1);
  // 下行线（绿色）
  ctx.beginPath();
  for (var i = 0; i < netData.length; i++) {
    var x = (startIdx + i) * stepX;
    var y = h - (netData[i].down / maxVal) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(63, 185, 80, 0.7)';
  ctx.stroke();
  // 总量填充区域（渐变）
  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(63, 185, 80, 0.15)');
  grad.addColorStop(1, 'rgba(63, 185, 80, 0.01)');
  ctx.fillStyle = grad;
  ctx.fill();
}
```
双线 + 渐变填充营造面积图效果，比纯折线更直观。

### 高分屏适配
```javascript
var dpr = window.devicePixelRatio || 1;
function resizeCanvas() {
  var rect = netCanvas.parentElement.getBoundingClientRect();
  netCanvas.width = rect.width * dpr;       // 物理像素
  netCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);                       // 缩放上下文
}
```

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `widget` | 小组件类型，桌面常驻 |
| `category` | `utility` | 实用工具分类 |
| `sandbox` | `trusted` | 受信沙盒，可访问 Canvas API |
| `permissions` | `[]` | 无需持久化（数据为模拟） |
| `window.width/height` | `320×280` | 紧凑尺寸，最小 `260×220` |
| `window.maximizable` | `false` | widget 不可最大化 |

## 文件结构

```
widget_ditto_system/
├── manifest.json       # 应用清单（type: widget）
├── frontend/
│   └── index.html      # 单文件 UI（约 340 行，含 Canvas sparkline + 模拟数据）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **`lerp` 平滑插值**：`current + (target - current) * factor` 是数据可视化的通用平滑算法，避免数值跳变
- **Canvas sparkline**：用 60 个历史点绘制小型折线图，是 widget 级数据可视化的标准方案
- **`devicePixelRatio` 适配**：Canvas 在高分屏上需 `width * dpr` + `ctx.scale(dpr, dpr)` 才能清晰
- **widget 资源节约**：`setInterval(2000)` 而非 `requestAnimationFrame`，widget 长驻时降低 CPU 占用
- **模拟数据算法**：通过 `clamp` + `lerp` + `Math.random` 生成符合直觉的波动数据，便于演示与测试

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
