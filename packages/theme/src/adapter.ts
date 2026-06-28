import type { ThemeTokens } from '@ditto/shared';

/**
 * 第三方主题 tokens.json 适配器。
 *
 * 第三方主题使用扁平 schema（colors/typography/spacing/radius/shadow/animation），
 * 与 ThemeEngine 内部的 ThemeTokens 结构化 schema 不同。
 * 本适配器将外部格式转换为内部格式，使第三方主题能真正生效。
 */

/** 外部主题 token 格式（第三方 .ditz 包中的 tokens.json） */
export interface ExternalThemeTokens {
  colors?: {
    primary?: string;
    primaryLight?: string;
    primaryDark?: string;
    background?: string;
    surface?: string;
    surfaceRaised?: string;
    textPrimary?: string;
    textSecondary?: string;
    textDisabled?: string;
    border?: string;
    borderSubtle?: string;
    accent?: string;
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };
  typography?: {
    fontFamily?: string;
    monoFontFamily?: string;
    fontSize?: Record<string, string>;
    fontWeight?: Record<string, string>;
  };
  spacing?: Record<string, string>;
  radius?: Record<string, string>;
  shadow?: Record<string, string>;
  animation?: {
    duration?: string;
    easing?: string;
  };
}

/**
 * 将外部 tokens.json 转换为 ThemeTokens 部分覆盖。
 * 缺失的字段不填入，deepMerge 会保留基底值。
 */
export function adaptExternalTokens(external: ExternalThemeTokens): Partial<ThemeTokens> {
  // 使用宽松内部结构，便于增量写入（Partial<ThemeTokens> 的 color 子字段仍要求全量，故用 any）
  const result: Record<string, any> = {};

  // 颜色转换
  if (external.colors) {
    const c = external.colors;
    const color: Record<string, any> = {};
    result.color = color;

    // primary 调色板：从单一颜色生成 10 阶
    if (c.primary) {
      color.primary = generateColorScale(c.primary, c.primaryLight, c.primaryDark);
    }

    // surface 三层
    if (c.background || c.surface || c.surfaceRaised) {
      color.surface = {};
      if (c.background) color.surface.base = c.background;
      if (c.surface) color.surface.raised = c.surface;
      if (c.surfaceRaised) color.surface.overlay = c.surfaceRaised;
    }

    // text 四态
    if (c.textPrimary || c.textSecondary || c.textDisabled) {
      color.text = {};
      if (c.textPrimary) color.text.primary = c.textPrimary;
      if (c.textSecondary) color.text.secondary = c.textSecondary;
      if (c.textDisabled) color.text.disabled = c.textDisabled;
    }

    // border 两级
    if (c.border || c.borderSubtle) {
      color.border = {};
      if (c.borderSubtle) color.border.subtle = c.borderSubtle;
      if (c.border) color.border.strong = c.border;
    }

    // semantic 四色
    if (c.success || c.warning || c.error || c.info) {
      color.semantic = {};
      if (c.success) color.semantic.success = c.success;
      if (c.warning) color.semantic.warning = c.warning;
      if (c.error) color.semantic.error = c.error;
      if (c.info) color.semantic.info = c.info;
    }

    // window 颜色（从 surface 推导）
    if (c.surface || c.border) {
      color.window = {
        frame: c.surface ?? c.background ?? '#1e293b',
        titlebar: c.surface ?? c.background ?? '#1e293b',
        border: c.border ?? c.borderSubtle ?? '#30363d',
        shadow: '0 4px 16px rgba(0,0,0,0.2)',
        shadowFocused: '0 8px 32px rgba(0,0,0,0.3)',
      };
    }
  }

  // 圆角映射
  if (external.radius) {
    const r = external.radius;
    result.radius = {};
    if (r.sm) result.radius.button = r.sm;
    if (r.md) result.radius.card = r.md;
    if (r.lg) result.radius.window = r.lg;
    if (r.full) result.radius.pill = r.full;
  }

  // 阴影映射
  if (external.shadow) {
    const s = external.shadow;
    result.shadow = {};
    if (s.sm) result.shadow.taskbar = s.sm;
    if (s.md) result.shadow.window = s.md;
    if (s.lg) result.shadow.windowFocused = s.lg;
    if (s.md) result.shadow.dropdown = s.md;
  }

  // 动画映射
  if (external.animation) {
    result.motion = { duration: {}, easing: {} };
    if (external.animation.duration) {
      const ms = external.animation.duration.replace(/s$/, '');
      result.motion.duration.fast = `${ms}s`;
      result.motion.duration.normal = `${parseFloat(ms) * 1.5}s`;
      result.motion.duration.slow = `${parseFloat(ms) * 2.5}s`;
    }
    if (external.animation.easing) {
      result.motion.easing.default = external.animation.easing;
      result.motion.easing.decelerate = external.animation.easing;
      result.motion.easing.accelerate = external.animation.easing;
      result.motion.easing.spring = external.animation.easing;
    }
  }

  return result as Partial<ThemeTokens>;
}

/**
 * 从单一主色生成 10 阶调色板（50-900）。
 * 使用 HSL 明度调整，简化版。
 */
function generateColorScale(baseHex: string, lightHex?: string, darkHex?: string): Record<string, string> {
  const scale: Record<string, string> = {};
  const base = hexToHsl(baseHex);

  // 50-400：从极浅到接近 base
  scale['50'] = hslToHex(base.h, base.s * 0.3, 96);
  scale['100'] = hslToHex(base.h, base.s * 0.4, 90);
  scale['200'] = hslToHex(base.h, base.s * 0.5, 82);
  scale['300'] = lightHex ?? hslToHex(base.h, base.s * 0.6, 70);
  scale['400'] = hslToHex(base.h, base.s * 0.8, 60);

  // 500：base 本色
  scale['500'] = baseHex;

  // 600-900：从略深到极深
  scale['600'] = hslToHex(base.h, base.s, Math.max(base.l - 5, 10));
  scale['700'] = darkHex ?? hslToHex(base.h, base.s, Math.max(base.l - 12, 8));
  scale['800'] = hslToHex(base.h, base.s * 0.9, Math.max(base.l - 20, 6));
  scale['900'] = hslToHex(base.h, base.s * 0.8, Math.max(base.l - 28, 4));

  return scale;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 将外部 typography token 写入 CSS 变量（ThemeTokens 无 typography 字段）。
 * 在 applyThemeFromManifest 调用后，可额外调用此函数补充字体设置。
 */
export function applyTypographyTokens(typography: ExternalThemeTokens['typography']): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (typography?.fontFamily) {
    root.style.setProperty('--ditto-font-family', typography.fontFamily);
  }
  if (typography?.monoFontFamily) {
    root.style.setProperty('--ditto-font-family-mono', typography.monoFontFamily);
  }
  if (typography?.fontSize) {
    for (const [key, value] of Object.entries(typography.fontSize)) {
      root.style.setProperty(`--ditto-font-size-${key}`, value);
    }
  }
  if (typography?.fontWeight) {
    for (const [key, value] of Object.entries(typography.fontWeight)) {
      root.style.setProperty(`--ditto-font-weight-${key}`, value);
    }
  }
}
