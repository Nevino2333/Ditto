# Ditto 主题与定制

> Ditto ThemeEngine 基于 CSS 变量驱动，支持运行时切换、组件级 override、4 档动画预设。

## 目录

- [ThemeEngine 概览](#themeengine-概览)
- [ThemeTokens 结构说明](#themetokens-结构说明)
- [.ditz 主题包格式](#ditz-主题包格式)
- [创建自定义主题](#创建自定义主题)
- [运行时切换 API](#运行时切换-api)
- [组件级覆盖](#组件级覆盖)
- [动画预设系统](#动画预设系统)
- [教育场景定制建议](#教育场景定制建议)

## ThemeEngine 概览

源码：`packages/theme/src/engine.ts`

ThemeEngine 是 Ditto 的主题引擎核心，负责管理主题注册、切换、CSS 变量注入、动画配置。

**核心特性**：

- **CSS 变量驱动**：所有 token 自动展平为 `--ditto-*` CSS 变量，注入到 `document.documentElement`
- **运行时切换**：无需重新加载页面，调用 API 立即生效
- **localStorage 持久化**：用户选择的主题自动保存到 `localStorage['ditto:theme']`
- **订阅机制**：通过 `subscribe` 注册回调，主题变化时通知
- **内置两套预设**：`dittoLight`（浅色）与 `dittoDark`（深色）

**获取实例**：

```typescript
import { getThemeEngine } from '@ditto/theme';

const engine = getThemeEngine();
```

`getThemeEngine()` 是单例工厂，首次调用创建实例并应用保存的主题。

## ThemeTokens 结构说明

源码：`packages/shared/src/types.ts` + `packages/theme/src/tokens.ts`

`ThemeTokens` 是 ThemeEngine 内部使用的结构化 token 类型：

```typescript
export interface ThemeTokens {
  color: {
    primary: Record<string, string>;    // 主色调，50-900 渐变
    surface: Record<string, string>;   // 表面色：base / raised / overlay
    text: Record<string, string>;       // 文字色：primary / secondary / disabled / inverse
    border: Record<string, string>;     // 边框色：subtle / strong
    semantic: Record<string, string>;   // 语义色：success / warning / error / info
    window: Record<string, string>;     // 窗口色：frame / titlebar / border / shadow / shadowFocused
  };
  space: Record<string, string>;         // 间距：taskbar-height / window-padding / window-gap / icon-size
  radius: Record<string, string>;        // 圆角：window / button / card / pill
  shadow: Record<string, string>;       // 阴影：window / windowFocused / taskbar / dropdown
  motion: {
    duration: Record<string, string>;   // 时长：fast / normal / slow
    easing: Record<string, string>;     // 缓动：default / decelerate / accelerate / spring
  };
}
```

### 默认浅色主题 token

源码：`packages/theme/src/tokens.ts`

```typescript
export const dittoTokens: ThemeTokens = {
  color: {
    primary: {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
      400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
      800: '#1e40af', 900: '#1e3a5f',
    },
    surface: {
      base: '#ffffff',
      raised: '#f8fafc',
      overlay: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
      disabled: '#94a3b8',
      inverse: '#ffffff',
    },
    border: {
      subtle: '#e2e8f0',
      strong: '#cbd5e1',
    },
    semantic: {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
    window: {
      frame: '#ffffff',
      titlebar: '#f1f5f9',
      border: '#e2e8f0',
      shadow: 'rgba(0, 0, 0, 0.08)',
      shadowFocused: 'rgba(59, 130, 246, 0.15)',
    },
  },
  space: {
    'taskbar-height': '52px',
    'window-padding': '8px',
    'window-gap': '12px',
    'icon-size': '24px',
  },
  radius: {
    window: '10px',
    button: '6px',
    card: '8px',
    pill: '9999px',
  },
  shadow: {
    window: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    windowFocused: '0 8px 32px rgba(59, 130, 246, 0.12), 0 2px 4px rgba(0, 0, 0, 0.04)',
    taskbar: '0 -1px 12px rgba(0, 0, 0, 0.04)',
    dropdown: '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  motion: {
    duration: { fast: '150ms', normal: '250ms', slow: '350ms' },
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
      accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    },
  },
};
```

### CSS 变量映射规则

ThemeEngine 会把嵌套 token 展平为 `--ditto-{category}-{key}-{subkey}` 格式：

| Token 路径 | CSS 变量 |
|-----------|----------|
| `color.primary.500` | `--ditto-color-primary-500` |
| `color.surface.base` | `--ditto-color-surface-base` |
| `color.window.shadowFocused` | `--ditto-color-window-shadow-focused`（驼峰转 kebab） |
| `space.taskbar-height` | `--ditto-space-taskbar-height` |
| `motion.duration.fast` | `--ditto-motion-duration-fast` |

在 CSS 中直接使用：

```css
.my-component {
  background: var(--ditto-color-surface-raised);
  color: var(--ditto-color-text-primary);
  border: 1px solid var(--ditto-color-border-subtle);
  border-radius: var(--ditto-radius-card);
  padding: var(--ditto-space-window-padding);
  box-shadow: var(--ditto-shadow-window);
  transition: all var(--ditto-motion-duration-fast) var(--ditto-motion-easing-default);
}
```

## .ditz 主题包格式

Ditto 主题以 `.ditz` 包形式分发，结构如下：

```
com.ditto.theme.midnight-1.0.0.ditz
├── manifest.json       # 主题 manifest（type: 'theme'）
├── tokens/
│   └── tokens.json     # 主题 token（简化格式）
└── frontend/
    └── index.html       # 主题预览页（可选）
```

### manifest.json

```json
{
  "id": "com.ditto.theme.midnight",
  "name": "Midnight Theme",
  "version": "1.0.0",
  "description": "午夜深蓝主题",
  "icon": "🌙",
  "entry": "frontend/index.html",
  "category": "theme",
  "sandbox": "trusted",
  "permissions": [],
  "type": "theme",
  "window": {
    "width": 480,
    "height": 400,
    "minWidth": 360,
    "minHeight": 300,
    "resizable": true
  }
}
```

### tokens.json（简化格式）

`.ditz` 包内的 `tokens.json` 使用简化的扁平格式（与内部 `ThemeTokens` 不同），便于设计师编辑：

```json
{
  "colors": {
    "primary": "#e94560",
    "primaryLight": "#ff6b81",
    "primaryDark": "#c0392b",
    "background": "#1a1a2e",
    "surface": "#16213e",
    "surfaceRaised": "#0f3460",
    "textPrimary": "#e0e0e0",
    "textSecondary": "#8b949e",
    "textDisabled": "#484f58",
    "border": "#30363d",
    "borderSubtle": "#21262d",
    "accent": "#58a6ff",
    "success": "#3fb950",
    "warning": "#d29922",
    "error": "#f85149",
    "info": "#58a6ff"
  },
  "typography": {
    "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "monoFontFamily": "'Consolas', 'Fira Code', 'JetBrains Mono', monospace",
    "fontSize": { "xs": "11px", "sm": "12px", "base": "14px", "lg": "16px", "xl": "18px", "2xl": "22px" },
    "fontWeight": { "normal": "400", "medium": "500", "semibold": "600", "bold": "700" }
  },
  "spacing": { "xs": "4px", "sm": "8px", "md": "12px", "lg": "16px", "xl": "24px", "2xl": "32px" },
  "radius": { "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "full": "9999px" },
  "shadow": {
    "sm": "0 1px 2px rgba(0,0,0,0.3)",
    "md": "0 2px 8px rgba(0,0,0,0.4)",
    "lg": "0 4px 16px rgba(0,0,0,0.5)"
  },
  "animation": {
    "duration": "0.15s",
    "easing": "cubic-bezier(0.4, 0, 0.2, 1)"
  }
}
```

## 创建自定义主题

### 方式一：通过 API 创建

```typescript
import { getThemeEngine } from '@ditto/theme';

const engine = getThemeEngine();

// 基于浅色主题创建变体
const oceanTheme = engine.createTheme(
  'ocean',
  'Ocean Blue',
  'light',
  {
    color: {
      primary: {
        500: '#0ea5e9',
        600: '#0284c7',
      },
      surface: {
        base: '#f0f9ff',
      },
    },
  }
);

// 应用
engine.setTheme('ocean');
```

`createTheme` 会基于已有的 light/dark token 做深合并，只覆盖传入的部分。

### 方式二：注册完整主题

```typescript
import { getThemeEngine } from '@ditto/theme';
import type { Theme, ThemeTokens } from '@ditto/shared';

const customTokens: ThemeTokens = {
  color: {
    primary: { /* 50-900 */ },
    surface: { base: '#1a1a2e', raised: '#16213e', overlay: '#0f3460' },
    text: { primary: '#e0e0e0', secondary: '#8b949e', disabled: '#484f58', inverse: '#0f172a' },
    border: { subtle: '#30363d', strong: '#484f58' },
    semantic: { success: '#3fb950', warning: '#d29922', error: '#f85149', info: '#58a6ff' },
    window: { frame: '#16213e', titlebar: '#0f3460', border: '#30363d', shadow: 'rgba(0,0,0,0.3)', shadowFocused: 'rgba(88,166,255,0.2)' },
  },
  space: { 'taskbar-height': '52px', 'window-padding': '8px', 'window-gap': '12px', 'icon-size': '24px' },
  radius: { window: '10px', button: '6px', card: '8px', pill: '9999px' },
  shadow: { /* ... */ },
  motion: { /* ... */ },
};

const customTheme: Theme = {
  id: 'com.ditto.theme.midnight',
  name: 'Midnight Theme',
  colorScheme: 'dark',
  tokens: customTokens,
};

engine.registerTheme(customTheme);
engine.setTheme('com.ditto.theme.midnight');
```

### 方式三：打包为 .ditz 分发

1. 创建主题项目目录：

```
com.ditto.theme.midnight/
├── manifest.json
├── tokens/
│   └── tokens.json
└── frontend/
    └── index.html
```

2. 打包：

```bash
ditto pack --type theme --manifest ./manifest.json --frontend ./frontend
# 输出 com.ditto.theme.midnight-1.0.0.ditz
```

3. 安装到服务端：

```bash
ditto install ./com.ditto.theme.midnight-1.0.0.ditz --server http://localhost:3001
```

## 运行时切换 API

```typescript
import { getThemeEngine } from '@ditto/theme';

const engine = getThemeEngine();

// 获取当前主题
const current = engine.getCurrentTheme();
console.log(current.id, current.name, current.colorScheme);

// 切换主题（按 id）
engine.setTheme('ditto-dark');

// 切换 colorScheme（light ↔ dark）
engine.toggleColorScheme();

// 获取所有可用主题
const themes = engine.getAvailableThemes();

// 获取单个 token 值
const primary500 = engine.getTokenValue('color.primary.500');
const taskbarHeight = engine.getTokenValue('space.taskbar-height');

// 临时覆盖单个 token
engine.setTokenOverride('color.primary.500', '#ff0000');

// 订阅主题变化
const unsubscribe = engine.subscribe((theme) => {
  console.log('主题切换为:', theme.id);
});

// 取消订阅
unsubscribe();
```

### API 签名

| 方法 | 签名 | 说明 |
|------|------|------|
| `getCurrentTheme` | `() => Theme` | 获取当前主题 |
| `getColorScheme` | `() => 'light' \| 'dark'` | 获取配色方案 |
| `registerTheme` | `(theme: Theme) => void` | 注册主题 |
| `createTheme` | `(id, name, scheme, overrides) => Theme` | 基于预设创建 |
| `setTheme` | `(themeId: string) => void` | 切换主题 |
| `toggleColorScheme` | `() => void` | 切换 light/dark |
| `getAvailableThemes` | `() => Theme[]` | 获取所有主题 |
| `getTokenValue` | `(path: string) => string \| undefined` | 读取 token |
| `setTokenOverride` | `(path, value) => void` | 覆盖 token |
| `subscribe` | `(handler) => () => void` | 订阅变化 |

## 组件级覆盖

ThemeEngine 支持为特定组件设置独立的 token 覆盖，不影响全局主题。

### 设置组件级 override

```typescript
import { getThemeEngine } from '@ditto/theme';

const engine = getThemeEngine();

// 为 DDialog 组件设置独立 token
engine.setComponentOverride('dialog', {
  color: {
    primary: { 500: '#8b5cf6' },  // 紫色主色
    surface: { base: '#faf5ff' },
  },
  radius: {
    window: '16px',  // 更大圆角
  },
});

// 移除覆盖
engine.removeComponentOverride('dialog');

// 读取当前组件 token
const tokens = engine.getComponentTokens('dialog');
```

### CSS 变量命名规则

组件级 token 会注入为 `--ditto-component-{name}-{key}`：

```css
.d-dialog {
  background: var(--ditto-component-dialog-color-surface-base);
  border-radius: var(--ditto-component-dialog-radius-window);
}
```

### 应用场景

- **特定组件品牌色**：登录对话框使用品牌紫色
- **局部深色**：在浅色主题中让代码编辑器保持深色
- **A/B 测试**：对比不同 token 对用户体验的影响

## 动画预设系统

源码：`packages/theme/src/engine.ts`

ThemeEngine 内置 4 档动画预设，通过 `setAnimationPreset` 切换：

```typescript
export type AnimationPreset = 'none' | 'subtle' | 'normal' | 'expressive';
```

### 预设对照

| 预设 | 窗口打开 | 菜单出现 | 通知进入 | 适用场景 |
|------|---------|---------|---------|---------|
| `none` | 无动画 | 无动画 | 无动画 | 低性能设备、无障碍 |
| `subtle` | 150ms ease-out | 120ms ease-out | 200ms ease-out | 保守、商务 |
| `normal`（默认） | 200ms spring | 200ms spring | 250ms spring | 通用 |
| `expressive` | 300ms spring | 250ms spring | 300ms spring | 演示、消费级 |

### AnimationConfig 结构

```typescript
export interface AnimationConfig {
  windowOpen: string;
  windowClose: string;
  windowMinimize: string;
  windowMaximize: string;
  windowFocus: string;
  menuOpen: string;
  menuClose: string;
  notificationEnter: string;
  notificationExit: string;
}
```

每个属性值为 CSS animation shorthand，注入为 `--ditto-motion-animation-{key}` 变量。

### 使用 API

```typescript
import { getThemeEngine } from '@ditto/theme';

const engine = getThemeEngine();

// 切换预设
engine.setAnimationPreset('subtle');

// 获取当前配置
const config = engine.getAnimationConfig();
console.log(config.windowOpen);  // 'd-window-enter-subtle 150ms ease-out'

// 自定义单个动画（覆盖预设）
engine.setCustomAnimations({
  windowOpen: 'my-custom-animation 250ms ease',
  notificationEnter: 'slide-in 300ms ease-out',
});
```

### 在 CSS 中使用

```css
.d-window {
  animation: var(--ditto-motion-animation-windowOpen);
}

.d-menu {
  animation: var(--ditto-motion-animation-menuOpen);
}

.d-notification {
  animation: var(--ditto-motion-animation-notificationEnter);
}
```

### 关键帧定义

预设引用的关键帧需在全局 CSS 中定义（如 `d-window-enter`、`d-menu-enter-subtle`）。Ditto UI 组件库已内置常用关键帧。

## 教育场景定制建议

Ditto 的主题系统特别适合教育场景，可根据不同年龄段与教学需求定制。

### 1. 低龄儿童（6-9 岁）

**视觉特点**：高对比度、大字号、明亮色彩

```typescript
engine.createTheme('edu-kids', 'Edu Kids', 'light', {
  color: {
    primary: { 500: '#f59e0b' },  // 温暖橙色
    text: {
      primary: '#1f2937',
      secondary: '#4b5563',
    },
  },
  space: {
    'taskbar-height': '64px',     // 更高任务栏
    'icon-size': '32px',           // 更大图标
  },
  radius: {
    button: '12px',                // 圆润按钮
    window: '16px',
  },
});

engine.setAnimationPreset('expressive');  // 夸张动画吸引注意
```

### 2. 青少年（10-15 岁）

**视觉特点**：现代感、适度色彩、流畅动画

```typescript
engine.createTheme('edu-teen', 'Edu Teen', 'light', {
  color: {
    primary: { 500: '#6366f1' },  // 紫色
  },
  motion: {
    duration: { fast: '200ms', normal: '300ms' },
  },
});

engine.setAnimationPreset('normal');
```

### 3. 考试模式

**视觉特点**：极简、低干扰、无动画

```typescript
// 一键切换到考试模式
engine.setAnimationPreset('none');
engine.setComponentOverride('notification', {
  color: {
    semantic: { info: '#6b7280' },  // 中性色
  },
});
```

### 4. 无障碍模式

```typescript
// 高对比度主题
engine.createTheme('high-contrast', 'High Contrast', 'dark', {
  color: {
    text: {
      primary: '#ffffff',
      secondary: '#f3f4f6',
    },
    border: {
      subtle: '#ffffff',
      strong: '#ffffff',
    },
  },
});

// 关闭所有动画
engine.setAnimationPreset('none');
```

### 5. 集中注意力模式

```typescript
// 降低饱和度、减小阴影
engine.createTheme('focus', 'Focus Mode', 'light', {
  color: {
    surface: { base: '#fafafa' },
    semantic: { info: '#6b7280' },
  },
  shadow: {
    window: 'none',
    windowFocused: '0 0 0 2px #3b82f6',
  },
});

engine.setAnimationPreset('subtle');
```

### 6. 课堂主题切换

教师可通过 SDK 在课堂开始时切换主题：

```typescript
import { getThemeEngine } from '@ditto/theme';

function startClass(mode: 'kids' | 'teen' | 'exam') {
  const engine = getThemeEngine();
  switch (mode) {
    case 'kids':
      engine.setTheme('edu-kids');
      engine.setAnimationPreset('expressive');
      break;
    case 'teen':
      engine.setTheme('edu-teen');
      engine.setAnimationPreset('normal');
      break;
    case 'exam':
      engine.setTheme('focus');
      engine.setAnimationPreset('none');
      break;
  }
}
```
