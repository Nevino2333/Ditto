import type { Theme, ThemeTokens } from '@ditto/shared';
import { deepMerge } from '@ditto/shared';
import { dittoLight, dittoDark } from './presets';
import { dittoTokens } from './tokens';

export type AnimationPreset = 'none' | 'subtle' | 'normal' | 'expressive';

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

export type ThemeChangeHandler = (theme: Theme) => void;

const ANIMATION_PRESETS: Record<AnimationPreset, AnimationConfig> = {
  none: {
    windowOpen: 'none',
    windowClose: 'none',
    windowMinimize: 'none',
    windowMaximize: 'none',
    windowFocus: 'none',
    menuOpen: 'none',
    menuClose: 'none',
    notificationEnter: 'none',
    notificationExit: 'none',
  },
  subtle: {
    windowOpen: 'd-window-enter-subtle 150ms ease-out',
    windowClose: 'd-window-exit-subtle 100ms ease-in',
    windowMinimize: 'd-window-minimize-subtle 150ms ease-in',
    windowMaximize: 'd-window-maximize 200ms ease',
    windowFocus: 'none',
    menuOpen: 'd-menu-enter-subtle 120ms ease-out',
    menuClose: 'd-menu-exit-subtle 80ms ease-in',
    notificationEnter: 'd-notif-enter-subtle 200ms ease-out',
    notificationExit: 'd-notif-exit-subtle 150ms ease-in',
  },
  normal: {
    windowOpen: 'd-window-enter 200ms cubic-bezier(0.175, 0.885, 0.32, 1.1)',
    windowClose: 'd-window-exit 150ms ease-in',
    windowMinimize: 'd-window-minimize 200ms ease-in',
    windowMaximize: 'd-window-maximize 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    windowFocus: 'd-window-focus 150ms ease',
    menuOpen: 'd-menu-enter 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    menuClose: 'd-menu-exit 150ms ease-in',
    notificationEnter: 'd-notif-enter 250ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    notificationExit: 'd-notif-exit 200ms ease-in',
  },
  expressive: {
    windowOpen: 'd-window-enter-expressive 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    windowClose: 'd-window-exit-expressive 200ms cubic-bezier(0.4, 0, 1, 1)',
    windowMinimize: 'd-window-minimize-expressive 250ms cubic-bezier(0.4, 0, 1, 1)',
    windowMaximize: 'd-window-maximize-expressive 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    windowFocus: 'd-window-focus-expressive 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    menuOpen: 'd-menu-enter-expressive 250ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    menuClose: 'd-menu-exit-expressive 200ms cubic-bezier(0.4, 0, 1, 1)',
    notificationEnter: 'd-notif-enter-expressive 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    notificationExit: 'd-notif-exit-expressive 200ms cubic-bezier(0.4, 0, 1, 1)',
  },
};

export class ThemeEngine {
  private currentTheme: Theme;
  private subscribers = new Set<ThemeChangeHandler>();
  private themes = new Map<string, Theme>();
  private componentOverrides = new Map<string, Partial<ThemeTokens>>();
  private _animationPreset: AnimationPreset = 'normal';
  private _customAnimations: Partial<AnimationConfig> = {};

  constructor() {
    this.themes.set(dittoLight.id, dittoLight);
    this.themes.set(dittoDark.id, dittoDark);
    const saved = this.loadSavedTheme();
    this.currentTheme = saved ?? dittoLight;
    this.applyTheme(this.currentTheme);
  }

  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  getColorScheme(): 'light' | 'dark' {
    return this.currentTheme.colorScheme;
  }

  registerTheme(theme: Theme): void {
    this.themes.set(theme.id, theme);
  }

  createTheme(id: string, name: string, colorScheme: 'light' | 'dark', tokenOverrides: Partial<ThemeTokens>): Theme {
    const baseTokens = colorScheme === 'dark'
      ? this.themes.get('ditto-dark')?.tokens ?? dittoDark.tokens
      : this.themes.get('ditto-light')?.tokens ?? dittoLight.tokens;
    const mergedTokens = deepMerge(baseTokens as unknown as Record<string, unknown>, tokenOverrides as unknown as Record<string, unknown>) as unknown as ThemeTokens;
    const theme: Theme = { id, name, colorScheme, tokens: mergedTokens };
    this.themes.set(id, theme);
    return theme;
  }

  setComponentOverride(componentName: string, tokens: Partial<ThemeTokens>): void {
    this.componentOverrides.set(componentName, tokens);
    this.applyComponentOverrides(componentName, tokens);
  }

  removeComponentOverride(componentName: string): void {
    this.componentOverrides.delete(componentName);
    const root = document.documentElement;
    const prefix = `ditto-component-${componentName}`;
    const styles = root.style;
    const keysToRemove: string[] = [];
    for (let i = 0; i < styles.length; i++) {
      if (styles[i].startsWith(`--${prefix}`)) {
        keysToRemove.push(styles[i]);
      }
    }
    for (const key of keysToRemove) {
      root.style.removeProperty(key);
    }
  }

  getComponentTokens(componentName: string): Record<string, string> {
    const result: Record<string, string> = {};
    const prefix = `ditto-component-${componentName}`;
    const root = document.documentElement;
    const styles = root.style;
    for (let i = 0; i < styles.length; i++) {
      if (styles[i].startsWith(`--${prefix}`)) {
        result[styles[i]] = root.style.getPropertyValue(styles[i]);
      }
    }
    return result;
  }

  setAnimationPreset(preset: AnimationPreset): void {
    this._animationPreset = preset;
    this.applyAnimations();
  }

  setCustomAnimations(animations: Partial<AnimationConfig>): void {
    this._customAnimations = { ...this._customAnimations, ...animations };
    this.applyAnimations();
  }

  getAnimationConfig(): AnimationConfig {
    return { ...ANIMATION_PRESETS[this._animationPreset], ...this._customAnimations };
  }

  applyTheme(theme: Theme): void {
    this.currentTheme = theme;
    const root = document.documentElement;
    const vars = this.flattenTokens(theme.tokens);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(`--ditto-${key}`, value);
    }
    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-color-scheme', theme.colorScheme);
    this.saveTheme(theme.id);
    this.applyAnimations();
    for (const [component, tokens] of this.componentOverrides) {
      this.applyComponentOverrides(component, tokens);
    }
    this.notify();
  }

  toggleColorScheme(): void {
    const next = this.currentTheme.colorScheme === 'light' ? 'dark' : 'light';
    const theme = this.getThemeByScheme(next);
    if (theme) {
      this.applyTheme(theme);
    }
  }

  setTheme(themeId: string): void {
    const theme = this.themes.get(themeId);
    if (theme) {
      this.applyTheme(theme);
    }
  }

  getAvailableThemes(): Theme[] {
    return [...this.themes.values()];
  }

  getTokenValue(path: string): string | undefined {
    const parts = path.split('.');
    let current: any = this.currentTheme.tokens;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return typeof current === 'string' ? current : undefined;
  }

  setTokenOverride(path: string, value: string): void {
    const root = document.documentElement;
    root.style.setProperty(`--ditto-${path.replace(/\./g, '-')}`, value);
  }

  subscribe(handler: ThemeChangeHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  private getThemeByScheme(scheme: 'light' | 'dark'): Theme | undefined {
    for (const theme of this.themes.values()) {
      if (theme.colorScheme === scheme) return theme;
    }
    return undefined;
  }

  private flattenTokens(tokens: ThemeTokens, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(tokens)) {
      const varName = prefix ? `${prefix}-${key}` : key;
      if (typeof value === 'object' && value !== null) {
        Object.assign(result, this.flattenTokens(value as ThemeTokens, varName));
      } else {
        result[varName] = String(value);
      }
    }
    return result;
  }

  private applyComponentOverrides(componentName: string, tokens: Partial<ThemeTokens>): void {
    const root = document.documentElement;
    const vars = this.flattenTokens(tokens as ThemeTokens);
    const prefix = `ditto-component-${componentName}`;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(`--${prefix}-${key}`, value);
    }
  }

  private applyAnimations(): void {
    const root = document.documentElement;
    const config = this.getAnimationConfig();
    for (const [key, value] of Object.entries(config)) {
      root.style.setProperty(`--ditto-motion-animation-${key}`, value);
    }
  }

  private notify(): void {
    for (const handler of this.subscribers) {
      try {
        handler(this.currentTheme);
      } catch (e) {
        console.error('[Ditto Theme] Subscriber error:', e);
      }
    }
  }

  private saveTheme(themeId: string): void {
    try {
      localStorage.setItem('ditto:theme', themeId);
    } catch { /* ignore */ }
  }

  private loadSavedTheme(): Theme | null {
    try {
      const id = localStorage.getItem('ditto:theme');
      if (id) return this.themes.get(id) ?? null;
    } catch { /* ignore */ }
    return null;
  }
}

let engineInstance: ThemeEngine | null = null;

export function getThemeEngine(): ThemeEngine {
  if (!engineInstance) {
    engineInstance = new ThemeEngine();
  }
  return engineInstance;
}
