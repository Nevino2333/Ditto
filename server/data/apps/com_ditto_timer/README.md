# Ditto Timer

> 番茄钟与倒计时器 — SVG 进度环、三档模式、Web Audio 提示音与每日统计

## 简介

Ditto Timer 是一个专注效率类应用，提供番茄专注（25 分钟）/短休息（5 分钟）/长休息（15 分钟）三档模式，配合 SVG 圆环进度可视化、Web Audio API 合成提示音、每日专注统计与连续完成计数。采用毛玻璃（glassmorphism）风格设计。

## 应用 ID

`com.ditto.timer`

## 截图占位

> 单列居中布局：模式切换标签 / SVG 圆环进度（中央显示剩余时间）/ 会话圆点 / 控制按钮 / 自定义时长开关
> 底部统计卡片：专注分钟 / 完成番茄 / 连续完成
> 运行中时间数字带 `pulse` 呼吸动画，完成时 `completePulse` 缩放动画

## 功能特性

- **三档模式**：番茄专注 25min / 短休息 5min / 长休息 15min，标签切换即重置计时
- **SVG 圆环进度**：基于 `stroke-dasharray`/`stroke-dashoffset` 的环形进度条，带渐变填充与发光层
- **自定义时长**：勾选「自定义时长」后可输入 1-120 分钟，覆盖默认值
- **会话圆点**：8 个圆点表示今日完成的番茄数，填充后带发光阴影
- **每日统计**：专注分钟数 / 完成番茄数 / 连续完成数，按日期键持久化
- **Web Audio 提示音**：完成时合成 3 声 880Hz 正弦波提示音，无需音频文件
- **智能模式切换**：每完成 4 个番茄自动切到长休息，否则切短休息，休息结束自动切回番茄
- **控制按钮**：开始/暂停（▶/⏸）、重置（↺）、跳过（⏭）

## 技术实现要点

### Chrome 80 兼容策略
- SVG `<circle>` + `stroke-dasharray` 实现进度环，兼容所有现代浏览器
- `backdrop-filter: blur(20px)` 用于毛玻璃效果，不支持时自动降级为半透明背景
- `requestAnimationFrame` 驱动进度条更新，避免 `setInterval` 卡顿
- 兼容 `window.webkitAudioContext` 旧版前缀

### SVG 进度环原理
```javascript
const CIRCUMFERENCE = 2 * Math.PI * 96;  // r=96 的周长
ringProgress.style.strokeDasharray = CIRCUMFERENCE;       // 总长度
ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);  // 偏移量随进度变化
```
圆环旋转 `-90deg` 使起点位于 12 点钟方向，`linearGradient` 提供红粉渐变填充。

### Web Audio 合成
```javascript
const osc = audioCtx.createOscillator();
const gain = audioCtx.createGain();
osc.connect(gain); gain.connect(audioCtx.destination);
osc.type = 'sine';
osc.frequency.setValueAtTime(880, now + delay);       // 880Hz 正弦波
gain.gain.setValueAtTime(0.3, now + delay);
gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);  // 指数衰减
```
通过 `[0, 0.2, 0.4]` 三个延迟重复播放，形成三声提示音。

### 按日期持久化
```javascript
function getTodayKey() {
  const d = new Date();
  return `ditto_timer_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
}
```
按日期分键存储，跨天自动归零统计。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `productivity` | 生产力分类 |
| `sandbox` | `trusted` | 受信沙盒，可使用 AudioContext |
| `permissions` | `[]` | 无需声明 storage（用 localStorage 但未显式声明） |
| `window.width/height` | `400×520` | 紧凑窗口，最小 `320×420` |

## 文件结构

```
com_ditto_timer/
├── manifest.json       # 应用清单（permissions: []）
├── frontend/
│   └── index.html      # 单文件 UI（约 450 行，含 SVG 进度环 + Web Audio）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **SVG `stroke-dashoffset` 进度环**：比 Canvas 更轻量、可缩放、可动画，是环形进度的首选方案
- **Web Audio API 合成音效**：无需音频文件即可生成提示音，体积为零，适合轻量应用
- **`requestAnimationFrame` 计时**：比 `setInterval` 更精确，可结合 `getMilliseconds()` 实现毫秒级平滑进度
- **按日期分键存储**：用 `ditto_timer_YYYY_M_D` 作为 localStorage 键，实现自然的数据分桶与自动归零
- **模式状态机**：`MODES` 对象集中定义三档模式的 label/time，切换时复用同一套 UI

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
