# Ditto Quote

> 每日名言小组件 — 24 条精选名言、每日种子索引、30 秒轮播与进度条

## 简介

Ditto Quote 是一个 `widget` 类型的小组件，展示精选名言。内置 24 条中外名言（孔子、老子、李白、苏轼、林则徐、毛泽东等），每日根据日期种子确定起始索引，30 秒自动轮播下一条，点击手动切换。配有淡入淡出过渡、圆点指示器与进度条。

## 应用 ID

`widget.ditto.quote`

## 截图占位

> 居中名言卡片：红色引号 / 名言正文（衬线字体）/ 渐变分隔线 / 作者（斜体）/ 日期 + 圆点指示器 / 进度条
> 切换时正文与作者同步淡出（0.4s）后淡入
> 进度条 30 秒线性填充，填满自动切下一条

## 功能特性

- **24 条精选名言**：覆盖孔子、老子、屈原、荀子、韩愈、陆游、李白、杜甫、苏轼、林则徐、周恩来、毛泽东等
- **每日种子索引**：根据 `年*10000 + 月*100 + 日` 计算种子，对名言数取模，保证同一天打开看到同一条
- **30 秒自动轮播**：`requestAnimationFrame` 驱动进度条，填满触发 `nextQuote()`
- **点击手动切换**：点击容器立即切换下一条，重置进度计时
- **淡入淡出过渡**：切换时正文与作者同步添加 `fading` 类，0.4s 后更新内容再移除
- **圆点指示器**：最多 12 个圆点，当前名言对应圆点高亮红色
- **衬线字体**：`'Georgia','Noto Serif SC',serif` 营造文学氛围

## 技术实现要点

### Chrome 80 兼容策略
- 纯 CSS + 原生 JS，无外部依赖
- `requestAnimationFrame` 驱动进度条更新，比 `setInterval` 更平滑
- `transition: opacity 0.6s ease` 实现淡入淡出

### 每日种子算法
```javascript
function getDailyIndex() {
  var now = new Date();
  var seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return seed % quotes.length;
}
```
保证同一天所有用户看到同一条名言，跨天自然轮换。

### 轮播与进度条
```javascript
function updateProgress() {
  var elapsed = Date.now() - progressStart;
  var pct = Math.min((elapsed / rotateInterval) * 100, 100);   // rotateInterval = 30000
  progressFill.style.width = pct + '%';
  if (elapsed >= rotateInterval) {
    nextQuote();                                               // 自动切换
  }
  requestAnimationFrame(updateProgress);                       // 递归驱动
}
```
`progressStart` 在每次切换时重置，进度条线性填充。

### 淡入淡出实现
```javascript
function showQuote(index, animate) {
  if (animate) {
    quoteText.classList.add('fading');
    quoteAuthor.classList.add('fading');
    setTimeout(function() {
      // 400ms 后更新内容
      quoteText.textContent = quotes[index].text;
      quoteAuthor.textContent = '— ' + quotes[index].author;
      quoteText.classList.remove('fading');
      quoteAuthor.classList.remove('fading');
    }, 400);
  }
}
```
利用 `transition: opacity 0.6s` + `setTimeout` 在淡出中点更新内容，避免内容跳变。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `widget` | 小组件类型 |
| `category` | `entertainment` | 娱乐分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `[]` | 无需持久化（每日种子确定起始名言） |
| `window.width/height` | `360×200` | 横向紧凑，最小 `280×160` |
| `window.maximizable` | `false` | widget 不可最大化 |

## 文件结构

```
widget_ditto_quote/
├── manifest.json       # 应用清单（type: widget）
├── frontend/
│   └── index.html      # 单文件 UI（约 230 行，含 24 条名言 + 轮播）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **每日种子算法**：用日期数值对内容数取模，实现「每日一图/每日一言」效果，无需后端存储
- **`requestAnimationFrame` 进度条**：替代 `setInterval`，进度更新与浏览器渲染同步，无抖动
- **淡入淡出过渡**：`transition: opacity` + `setTimeout` 在中点切换内容，是最简单的内容过渡方案
- **圆点指示器**：动态生成圆点 + `classList.toggle('active', i === currentIndex)`，是分页/轮播的标准 UI 模式
- **widget 不可最大化**：`maximizable: false` 保证小组件始终保持紧凑尺寸，符合 widget 定位

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
