# Ditto Calendar

> 优雅的日历应用 — 支持 7 色事件标签、迷你月份导航与 LocalStorage 持久化

## 简介

Ditto Calendar 是一个生产力类应用，提供月历视图、迷你月份选择器、事件管理与多色标签。所有事件通过 `localStorage` 持久化（key: `ditto_cal_events`），按日期键值存储，支持新增、删除、按颜色过滤。采用 Tokyo Night 风格暗色配色。

## 应用 ID

`com.ditto.calendar`

## 截图占位

> 三栏布局：左侧迷你月份 + 颜色标签 / 中间月历网格 / 右侧事件面板
> 月历单元格内显示事件圆点（最多 3 个），今日单元格带脉冲动画
> 模态框含标题输入、时间选择、7 色标签选择器

## 功能特性

- **月历视图**：6×7 网格展示当月日期，自动补齐上下月填充（半透明显示）
- **迷你月份导航**：侧栏独立小月历，支持单独翻月并点击跳转
- **事件管理**：每个日期可添加多个事件，支持标题、时间、颜色标签
- **7 色标签**：蓝/红/绿/黄/紫/青/橙，事件圆点与卡片左边框联动显示
- **今日高亮**：今日单元格蓝色填充 + `pulse` 关键帧动画
- **月份切换动画**：翻月时网格触发 `slideLeft`/`slideRight` 入场动画，方向感知

## 技术实现要点

### Chrome 80 兼容策略
- 使用 `:root` CSS 变量集中管理 16 个色值，所有动画基于 `transform`/`opacity`
- `backdrop-filter: blur(4px)` 用于模态遮罩，对不支持的环境自动降级为半透明黑底
- 字体回退链覆盖 `'PingFang SC','Microsoft YaHei'` 等中文系统字体

### 数据结构
事件按日期键存储为对象：

```javascript
{
  "2026-06-29": [
    { title: "产品评审", time: "14:00", color: "#7aa2f7" },
    { title: "团队站会", time: "09:30", color: "#9ece6a" }
  ]
}
```

### 响应式
移动端（`max-width:768px`）隐藏侧栏，事件面板改为底部抽屉（`transform: translateY(100%)` → `translateY(0)`），所有交互元素 `min-height: 44px`。

### XSS 防护
事件标题通过 `escHtml()` 转义 `& < > "` 后再插入 DOM，避免用户输入注入。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `productivity` | 生产力分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `["storage"]` | 声明使用 LocalStorage |
| `window.width/height` | `640×560` | 中等窗口，最小 `480×400` |

## 文件结构

```
com_ditto_calendar/
├── manifest.json       # 应用清单（permissions: [storage]）
├── frontend/
│   └── index.html      # 单文件 UI（约 470 行，含 CSS 变量主题）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **LocalStorage 持久化**：声明 `permissions: ["storage"]` 后即可使用 `localStorage` 保存用户数据，无需后端
- **CSS 变量主题化**：在 `:root` 定义 `--bg/--accent/--text` 等令牌，方便后续主题切换或全局换肤
- **键盘可达性**：`Escape` 关闭模态、`Enter` 提交表单，覆盖键盘用户的常见操作流
- **日期键命名**：使用 `YYYY-MM-DD` 字符串作为对象的键，便于排序与跨时区稳定
- **入场动画方向感知**：通过比较目标日期与当前日期，决定使用 `slideLeft` 还是 `slideRight`，增强空间感

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
