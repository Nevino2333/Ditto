# Ditto 深度定制指南

本指南介绍如何对 Ditto WebOS 进行深度定制，涵盖内核配置、主题系统、动画、组件级覆盖、SDK 主题 API 与教育/企业场景的定制实践。

## 目录

1. [定制层级概览](#1-定制层级概览)
2. [内核配置定制](#2-内核配置定制)
3. [主题深度定制](#3-主题深度定制)
4. [动画与性能档位](#4-动画与性能档位)
5. [组件级 Token 覆盖](#5-组件级-token-覆盖)
6. [第三方应用主题 API（SDK）](#6-第三方应用主题-apisdk)
7. [配置文件完整示例](#7-配置文件完整示例)
8. [教育场景定制案例](#8-教育场景定制案例)

---

## 1. 定制层级概览

Ditto 的定制能力分四个层级，从浅到深：

| 层级 | 定制点 | 持久化 | 影响范围 |
|------|--------|--------|----------|
| L1 运行时切换 | 主题、配色、动画预设 | localStorage | 全局 UI |
| L2 配置覆盖 | `DittoConfig` 字段 | 启动配置 | 全局行为 |
| L3 Token 覆盖 | `customTokens` | 启动配置 | 全局视觉 |
| L4 组件覆盖 | `setComponentOverride` | 运行时 | 单组件 |

---

## 2. 内核配置定制

通过 `createKernel(config)` 传入配置。完整字段见 [`packages/shared/src/config.ts`](../packages/shared/src/config.ts)。

```typescript
import { createKernel } from '@ditto/core';

const kernel = createKernel({
  kernel: { id: 'edu-school-a', dev: false },
  window: {
    defaultWidth: 1024,
    defaultHeight: 768,
    minWidth: 320,        // 兼容老旧小屏设备
    minHeight: 240,
    titlebarHeight: 36,
    borderRadius: 8,
    animations: true,
    snapEnabled: true,
    snapThreshold: 20,
  },
  taskbar: {
    height: 52,
    position: 'bottom',   // 'top' | 'bottom' | 'left' | 'right'
    autoHide: false,
    blur: true,
  },
  desktop: {
    iconSize: 80,
    iconGap: 8,
    columns: 0,           // 0 = 自适应
    wallpaper: '/wallpapers/classroom.jpg',
  },
  theme: {
    defaultScheme: 'light',
    followSystem: true,
    customTokens: { /* 见下文 */ },
  },
  permissions: {
    autoGrantSystemApps: true,
    persistDecisions: true,
  },
  ipc: {
    requestTimeout: 10000,
    maxRetries: 0,
  },
});
```

### 2.1 关键字段说明

- **`kernel.dev`**：开发模式自动授权所有权限；生产模式严格按 manifest 授权。
- **`window.minWidth/minHeight`**：最小窗口尺寸，兼容老旧小屏设备（如 1024×600 上网本）。
- **`theme.followSystem`**：监听 `prefers-color-scheme` 实时跟随系统配色。
- **`theme.customTokens`**：启动时应用到基底主题的自定义 token（见下文）。

---

## 3. 主题深度定制

### 3.1 ThemeTokens 结构

完整 token 结构见 [`packages/shared/src/types.ts`](../packages/shared/src/types.ts) 的 `ThemeTokens` 接口：

```typescript
interface ThemeTokens {
  color: {
    primary: Record<string, string>;   // 50-900 十阶调色板
    surface: Record<string, string>;   // base / raised / overlay
    text: Record<string, string>;      // primary / secondary / disabled
    border: Record<string, string>;    // subtle / strong
    semantic: Record<string, string>; // success / warning / error / info
    window: Record<string, string>;   // frame / titlebar / border / shadow / shadowFocused
  };
  space: Record<string, string>;
  radius: Record<string, string>;     // button / card / window / pill
  shadow: Record<string, string>;     // taskbar / window / windowFocused / dropdown
  motion: {
    duration: Record<string, string>; // fast / normal / slow
    easing: Record<string, string>;   // default / decelerate / accelerate / spring
  };
}
```

### 3.2 customTokens 配置

通过 `DittoConfig.theme.customTokens` 在启动时应用自定义 token：

```typescript
const kernel = createKernel({
  theme: {
    defaultScheme: 'light',
    followSystem: false,
    customTokens: {
      color: {
        primary: { '500': '#0066cc' },   // 学校品牌色
        surface: { base: '#fafafa' },
      },
      radius: { window: 12 },
    },
  },
});
```

`customTokens` 会创建一个名为 `ditto-custom` 的派生主题，启动时自动应用（见 [`apps/shell/src/main.ts`](../apps/shell/src/main.ts) 的 `applyKernelThemeConfig`）。

### 3.3 第三方主题包（.ditz）

第三方主题使用扁平 schema，与内部 ThemeTokens 不同。Ditto 提供 `adaptExternalTokens()` 适配器自动转换（见 [`packages/theme/src/adapter.ts`](../packages/theme/src/adapter.ts)）：

第三方 `tokens.json` 示例：

```json
{
  "colors": {
    "primary": "#e94560",
    "background": "#1a1a2e",
    "surface": "#16213e",
    "textPrimary": "#e0e0e0",
    "border": "#30363d"
  },
  "typography": { "fontFamily": "..." },
  "radius": { "sm": "4px", "md": "8px" },
  "shadow": { "sm": "...", "md": "..." },
  "animation": { "duration": "0.15s", "easing": "..." }
}
```

适配器会：
- 从单一 `primary` 色**自动生成 50-900 十阶调色板**（HSL 明度调整）
- 映射 `background`→`surface.base`、`textPrimary`→`text.primary` 等
- 补充 `typography` 到 CSS 变量（ThemeTokens 无 typography 字段）

---

## 4. 动画与性能档位

### 4.1 四档动画预设

```typescript
themeEngine.setAnimationPreset('none');      // 完全关闭动画（树莓派/老旧设备）
themeEngine.setAnimationPreset('subtle');     // 微妙（低端设备推荐）
themeEngine.setAnimationPreset('normal');    // 默认
themeEngine.setAnimationPreset('expressive'); // 丰富（高性能设备）
```

### 4.2 自定义单条动画

```typescript
themeEngine.setCustomAnimations({
  windowOpen: 'my-open 250ms ease-out',
  notificationEnter: 'my-notif 200ms',
});
```

### 4.3 无障碍自动降级

Ditto 自动响应以下媒体查询：

- **`prefers-reduced-motion: reduce`**：全局动画降级（已在 shell CSS 中实现）
- **`prefers-contrast: high`**：高对比度模式支持
- **`prefers-color-scheme: dark/light`**：`followSystem: true` 时实时跟随

---

## 5. 组件级 Token 覆盖

为单个组件覆盖 token，不影响全局：

```typescript
themeEngine.setComponentOverride('DWindow', {
  color: {
    window: {
      frame: '#1e293b',
      shadow: '0 8px 32px rgba(0,0,0,0.4)',
    },
  },
  radius: { window: 16 },
});

// 移除覆盖
themeEngine.removeComponentOverride('DWindow');
```

覆盖写入的 CSS 变量前缀为 `--ditto-component-<组件名>-*`。

---

## 6. 第三方应用主题 API（SDK）

第三方应用运行在 iframe 沙盒中，通过 IPC 与宿主 ThemeEngine 通信。使用 `useDittoTheme()` composable：

```typescript
import { useDittoTheme } from '@ditto/sdk';

const theme = useDittoTheme();

// 查询当前主题
const current = await theme.getCurrentTheme();
// { id: 'ditto-dark', name: 'Ditto Dark', colorScheme: 'dark' }

// 订阅主题变更
const stop = theme.subscribe((t) => {
  console.log('主题已切换:', t.name);
});

// 切换主题
theme.setTheme('ditto-light');
theme.toggleScheme();

// 覆盖单个 token（运行时生效）
theme.setTokenOverride('color.primary.500', '#ff0000');

// 组件级覆盖
theme.setComponentOverride('MyWidget', { color: { primary: { '500': '#00ff00' } } });

// 动画档位（性能优化）
theme.setAnimationPreset('subtle');
```

### 6.1 IPC 通道列表

| 通道 | 类型 | 说明 |
|------|------|------|
| `theme:getCurrent` | request | 获取当前主题信息 |
| `theme:list` | request | 获取所有可用主题 |
| `theme:getToken` | request | 获取指定 token 值 |
| `theme:setTheme` | send | 切换主题 |
| `theme:toggleScheme` | send | 切换浅/深色 |
| `theme:setOverride` | send | 覆盖单个 token |
| `theme:setComponentOverride` | send | 组件级覆盖 |
| `theme:removeComponentOverride` | send | 移除组件覆盖 |
| `theme:setAnimationPreset` | send | 设置动画档位 |
| `theme:changed` | event | 主题变更广播（宿主→所有 iframe） |

---

## 7. 配置文件完整示例

`ditto.config.ts`（教育场景示例）：

```typescript
import type { DittoConfig } from '@ditto/shared';

export const config: DittoConfig = {
  kernel: { id: 'edu-classroom', strictMode: false, dev: false },
  window: {
    defaultWidth: 1024, defaultHeight: 768,
    minWidth: 320, minHeight: 240,
    titlebarHeight: 36, borderRadius: 8,
    animations: true, snapEnabled: true, snapThreshold: 20,
  },
  taskbar: { height: 52, position: 'bottom', autoHide: false, blur: true },
  desktop: { iconSize: 72, iconGap: 8, columns: 0 },
  theme: {
    defaultScheme: 'light',
    followSystem: false,
    customTokens: {
      color: {
        primary: { '500': '#0066cc' },
        surface: { base: '#fafafa' },
      },
    },
  },
  permissions: { autoGrantSystemApps: true, persistDecisions: true },
  ipc: { requestTimeout: 10000, maxRetries: 0 },
};
```

---

## 8. 教育场景定制案例

### 8.1 低端设备（树莓派）优化

```typescript
const kernel = createKernel({
  theme: { defaultScheme: 'light', followSystem: false },
  window: { animations: false },  // 关闭窗口动画
});

// 运行时切换到最低动画档
getThemeEngine().setAnimationPreset('none');
```

配合 PWA 离线缓存，树莓派 3B+ 即可流畅运行基础交互。

### 8.2 学校品牌定制

通过 `customTokens` 应用学校品牌色与校徽壁纸：

```typescript
const kernel = createKernel({
  desktop: { wallpaper: '/assets/school-logo-bg.jpg' },
  theme: {
    customTokens: {
      color: { primary: { '500': '#8B0000' } },  // 校徽红
    },
  },
});
```

### 8.3 课堂管控

通过 `permissions.persistDecisions: true` 持久化权限决策，教师可预设允许的应用白名单，防止学生安装未授权应用。

更多教育部署细节见 [教育部署指南](./education-deployment.md)。
