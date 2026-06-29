# Ditto Todo

> 待办事项管理 — 分类、优先级、拖拽排序、过滤器与进度条

## 简介

Ditto Todo 是一个 GitHub 风格的待办事项应用，支持自定义分类、三档优先级（高/中/低）、拖拽排序、按状态/分类过滤、按日期/优先级排序与完成进度可视化。所有数据通过 `localStorage` 持久化（key: `ditto-todo-data`），单状态对象保存全部状态。

## 应用 ID

`com.ditto.todo`

## 截图占位

> 双栏布局：左侧分类列表（5 个默认分类 + 自定义）/ 右侧主区（标题 + 进度条 + 添加表单 + 过滤器 + 待办列表）
> 待办项含圆形勾选框、优先级色点、文本、分类标签、删除按钮
> 拖拽时半透明 + 目标项绿色高亮边框

## 功能特性

- **5 个默认分类**：全部 / 工作 / 个人 / 购物 / 健康，自带 emoji 图标，不可删除
- **自定义分类**：底部「+ 添加分类」输入名称，随机分配 emoji 图标，可删除（连带删除该分类下待办）
- **三档优先级**：高（红）/ 中（黄）/ 低（绿），添加时下拉选择，色点带发光阴影
- **拖拽排序**：HTML5 Drag and Drop API，拖拽时源项半透明 + 目标项绿色边框，松开后数组重排
- **状态过滤**：全部 / 进行中 / 已完成 三态切换，空状态文案随过滤变化
- **排序**：按日期（默认倒序）或按优先级（高→中→低）
- **进度条**：顶部进度条按当前分类的完成率填充，渐变色 `accent → success`
- **Toast 提示**：添加/完成/删除操作均触发底部 Toast，1.8s 自动消失

## 技术实现要点

### Chrome 80 兼容策略
- HTML5 Drag and Drop API（`draggable`/`dragstart`/`dragover`/`drop`），原生支持无需 polyfill
- `linear-gradient` 进度条 + `cubic-bezier(.4,0,.2,1)` 缓动，Material Design 标准曲线
- CSS 变量集中管理 14 个色值，`::-webkit-scrollbar` 自定义滚动条样式

### 单状态对象
```javascript
let state = {
  categories: [...defaultCategories, ...自定义],
  todos: [{ id, text, category, priority, done, created }],
  activeCategory: 'all',
  filter: 'all',
  sort: 'date',
  nextId: 1
};
```
所有操作通过修改 `state` 后 `save()` 持久化 + 重新渲染，单向数据流。

### 拖拽实现
```javascript
function dragStart(e) {
  dragId = parseInt(e.currentTarget.dataset.id);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function drop(e) {
  e.preventDefault();
  const targetId = parseInt(e.currentTarget.dataset.id);
  const [item] = state.todos.splice(fromIdx, 1);
  state.todos.splice(toIdx, 0, item);
  save(); renderTodos();
}
```

### 动画细节
- 新增项 `slideIn`（从上方滑入）
- 完成项 `completeAnim`（缩放 1→1.02→1）
- 删除项 `removeAnim`（向右淡出 + 高度收缩）

### 响应式
移动端（`max-width:768px`）侧栏改为左侧抽屉（`left:-220px` → `left:0`），顶部汉堡按钮 `☰` 切换。所有交互元素 `min-height: 44px`。

## manifest 关键字段

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `app` | 普通应用 |
| `category` | `productivity` | 生产力分类 |
| `sandbox` | `trusted` | 受信沙盒 |
| `permissions` | `["storage"]` | LocalStorage 持久化状态 |
| `window.width/height` | `520×640` | 竖向窗口，最小 `380×480` |

## 文件结构

```
com_ditto_todo/
├── manifest.json       # 应用清单（permissions: [storage]）
├── frontend/
│   └── index.html      # 单文件 UI（约 480 行，含拖拽 + 单状态管理）
└── README.md           # 本文件
```

## 开发者可借鉴的模式

- **单状态对象**：`state` 集中管理所有数据，`save()` + `render()` 是单向数据流的最小实现，适合中小型应用
- **默认分类合并策略**：加载时检查本地数据是否包含所有默认分类 ID，缺失则补齐，保证版本升级后默认项不丢失
- **HTML5 Drag and Drop**：原生 API 即可实现列表排序，无需 sortable.js 等库
- **CSS 变量优先级色**：`--high/--medium/--low` 定义色值，UI 与逻辑共享同一套语义令牌
- **动画分区**：`slideIn`（进入）/`completeAnim`（完成）/`removeAnim`（移除）三种关键帧覆盖待办全生命周期

## 开发参考

- [第三方应用开发指南](../../../docs/third-party-app-development.md)
- [应用 manifest 规范](../../../docs/app-manifest.md)
