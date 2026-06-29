# Ditto Weather

> 精美的天气预报应用 — 6 城市切换、CSS 动画天气图标、逐时与 7 日预报

## 简介

Ditto Weather 是一个天气展示应用，内置 6 个城市（北京/上海/东京/纽约/伦敦/巴黎）的静态天气数据，提供当前天气、逐时预报（12 小时）与 7 日预报。所有天气图标均为纯 CSS + 关键帧动画实现，无图片依赖。采用毛玻璃风格深色配色。

## 应用 ID

`com.ditto.weather`

## 截图占位

> 单列滚动布局：顶部城市选择器 / 当前天气卡（大图标 + 温度 + 4 项详情）/ 逐时预报横向滚动条 / 7 日预报列表
> 7 种天气图标：晴（旋转太阳）/ 多云（漂浮云）/ 晴间多云 / 雨（下落雨滴）/ 雪（旋转雪花）/ 雷暴（闪烁闪电）/ 雾（漂移雾线）
> 7 日预报含温度区间色条

## 功能特性

- **6 城市切换**：北京/上海/东京/纽约/伦敦/巴黎，下拉选择器带玻璃效果
- **7 种天气图标**：全部用 CSS 实现，含 `pulse-glow`/`cloud-drift`/`rain-fall`/`snow-fall` 等关键帧动画
- **当前天气详情**：温度 / 体感 / 描述 + 4 项指标（湿度、风速、紫外线等级、能见度）
- **逐时预报**：12 小时横向滚动条，当前小时高亮，每项含迷你天气图标
- **7 日预报**：列表式布局，含温度区间色条，颜色按温度梯度变化（蓝→青→绿→黄→红）
- **城市记忆**：选择的城市保存到 `localStorage`（key: `ditto-weather-city`），下次启动恢复
- **入场动画**：四块内容依次 `fade-in`（0s/0.1s/0.2s/0.3s 延迟）

## 技术实现要点

### Chrome 80 兼容策略
- 天气图标完全用 div + CSS 实现，无 SVG/Canvas 依赖
- `backdrop-filter: blur(20px)` 毛玻璃效果，降级为半透明背景
- `linear-gradient` 与 `radial-gradient` 组合构建太阳光晕

### CSS 天气图标架构
每种图标由多个绝对定位的 div 组成，配合 `::before`/`::after` 伪元素与关键帧动画：

```css
.icon-sunny .sun-core { animation: pulse-glow 3s ease infinite; }
.icon-rainy .raindrop { animation: rain-fall 1s linear infinite; }
.icon-snowy .snowflake { animation: snow-fall 2s linear infinite; }
.icon-cloudy .cloud { animation: cloud-drift 4s ease infinite; }
```
迷你图标复用同一套结构，仅通过 `.mini-icon { transform: scale(0.45) }` 缩放。

### 数据驱动渲染
```javascript
const CITIES = {
  beijing: { name: '北京', country: '中国',
    current: { temp: 28, feelsLike: 31, humidity: 65, wind: 12, ..., type: 'partly-cloudy' },
    hourly: [{ time: '现在', temp: 28, type: 'partly-cloudy' }, ...],
    forecast: [{ day: '今天', high: 31, low: 20, type: 'partly-cloudy', desc: '多云' }, ...]
  },
  ...
};
```
`render(cityKey)` 函数根据数据生成完整 HTML，城市切换时整体重渲染。

### 温度色条算法
```javascript
function getTempBarColor(temp) {
  if (temp <= 0) return 'linear-gradient(90deg,#74b9ff,#0984e3)';      // 蓝
  if (temp <= 10) return 'linear-gradient(90deg,#81ecec,#00cec9)';     // 青
  if (temp <= 20) return 'linear-gradient(90deg,#55efc4,#00b894)';     // 绿
  if (temp <= 30) return 'linear-gradient(90deg,#ffeaa7,#fdcb6e)';     // 黄
  return 'linear-gradient(90deg,#fab1a0,#e17055)';                     // 红
}
```
区间宽度按 `(high - low) / (maxTemp - minTemp) * 100` 计算，跨城市温度范围归一化。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `utility` | 实用工具分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `[]` | 无需声明（用 localStorage 但未显式声明 storage） |
| `window.width/height` | `480×640` | 竖向窗口，最小 `360×480` |

## 文件结构

```
com_ditto_weather/
├── manifest.json       # 应用清单（permissions: []）
├── frontend/
│   └── index.html      # 单文件 UI（约 600 行，含 7 种 CSS 天气图标）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **纯 CSS 图标系统**：用 div + 伪元素 + 关键帧动画构建复杂图标，零图片依赖，体积小且可无限缩放
- **静态数据模拟**：内置 CITIES 对象模拟 API 响应，应用可独立运行无需后端，便于演示
- **迷你图标复用**：大图标与小图标共享 DOM 结构，仅 `transform: scale()` 缩放，减少代码重复
- **温度色条**：将温度数值映射到色相梯度，比纯数字更直观，是数据可视化的轻量方案
- **入场动画分层**：`animate-in-delay-1/2/3` 类按顺序触发 `fade-in`，营造内容逐步加载的节奏感

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
