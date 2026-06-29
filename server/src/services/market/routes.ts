import { Hono } from 'hono';
import type { AppCellManager } from '../app-cell/manager';
import type {
  AppStoreEntry,
  AppManifest,
  MarketMeta,
  MarketCategory,
  MarketFeatured,
  MarketReview,
  InstalledAppInfo,
  UpdateInfo,
} from '@ditto/shared';
import { Packager } from '@ditto/packager';
import * as fs from 'node:fs';
import * as path from 'node:path';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';
const DEFAULT_OWNER = 'Nevino2233';
const DEFAULT_REPO = 'Ditto_Market';
const DEFAULT_BRANCH = 'main';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface MarketRouteDeps {
  cellManager: AppCellManager;
  appsDir: string;
  testAppsDir?: string;
  githubToken?: string;
  owner?: string;
  repo?: string;
  localDataDir?: string;
}

/** Maximum number of reviews persisted per app; oldest entries are dropped beyond this cap. */
const MAX_REVIEWS_PER_APP = 200;

/** A review entry persisted to disk; extends MarketReview with an optional display name. */
interface PersistedReview extends MarketReview {
  userName?: string;
}

/** On-disk structure for persisted reviews (server/data/reviews/<appId>.json). */
interface ReviewFile {
  appId: string;
  reviews: PersistedReview[];
}

/** App store entry augmented with an install-state hint surfaced to the Market list. */
interface MarketAppEntry extends AppStoreEntry {
  installed: boolean;
}

const DEFAULT_CATEGORIES: MarketCategory[] = [
  { id: 'productivity', name: '效率工具', icon: '📊', description: '提升工作效率的工具应用' },
  { id: 'social', name: '社交', icon: '💬', description: '社交和通讯应用' },
  { id: 'entertainment', name: '娱乐', icon: '🎮', description: '游戏和娱乐应用' },
  { id: 'development', name: '开发工具', icon: '🛠️', description: '开发者工具和IDE' },
  { id: 'theme', name: '主题', icon: '🎨', description: '桌面主题和外观定制' },
  { id: 'widget', name: '小组件', icon: '📱', description: '桌面小组件和快捷工具' },
  { id: 'plugin', name: '插件', icon: '🔌', description: '系统增强和功能扩展插件' },
  { id: 'education', name: '教育', icon: '📚', description: '学习和教育应用' },
  { id: 'utility', name: '系统工具', icon: '⚙️', description: '系统管理和实用工具' },
];

const DEMO_APPS: AppStoreEntry[] = [
  {
    id: 'com.ditto.notes',
    manifest: {
      id: 'com.ditto.notes',
      name: 'Ditto Notes',
      version: '0.1.0',
      description: '轻量级 Markdown 笔记应用',
      icon: '📝',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'productivity',
      sandbox: 'trusted',
      permissions: ['storage'],
      window: { width: 640, height: 480, minWidth: 400, minHeight: 300, resizable: true, maximizable: true },
    },
    market: {
      summary: '简洁高效的 Markdown 笔记应用',
      description: '# Ditto Notes\n\n一款为 Ditto WebOS 设计的轻量级笔记应用。\n\n## 特性\n\n- **Markdown 编辑** — 实时预览，所见即所得\n- **快速搜索** — 全文搜索，瞬间找到笔记\n- **标签管理** — 灵活的标签分类系统\n- **自动保存** — 编辑即保存，永不丢失\n\n> 数据存储在本地，保护你的隐私。',
      category: 'productivity',
      tags: ['笔记', 'Markdown', '效率', '编辑器'],
      screenshots: [],
      changelog: '',
      downloadUrl: 'https://github.com/Nevino2233/Ditto_Market/releases/download/v0.1.0/com.ditto.notes-0.1.0.dit',
      publisher: 'Ditto Team',
      homepage: 'https://github.com/Nevino2233/Ditto',
      sourceUrl: 'https://github.com/Nevino2233/Ditto',
    },
    rating: 4.7,
    ratingCount: 3,
    downloads: 128,
    verified: true,
    publishedAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'com.ditto.calc',
    manifest: {
      id: 'com.ditto.calc',
      name: 'Ditto Calculator',
      version: '1.0.0',
      description: '简洁美观的科学计算器',
      icon: '🧮',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 400, height: 560, minWidth: 320, minHeight: 400, resizable: true, maximizable: true },
    },
    market: {
      summary: '简洁美观的科学计算器，支持键盘操作',
      description: '# Ditto Calculator\n\n简洁美观的科学计算器应用。\n\n## 特性\n\n- **基础运算** — 加减乘除\n- **括号支持** — 复杂表达式计算\n- **键盘操作** — 支持键盘快捷输入\n- **历史记录** — 自动保存计算历史\n- **暗色主题** — 护眼深色界面',
      category: 'utility',
      tags: ['计算器', '工具', '数学', '效率'],
      screenshots: [],
      changelog: '',
      downloadUrl: 'https://github.com/Nevino2233/Ditto_Market/releases/download/v1.0.0/com.ditto.calc-1.0.0.dit',
      publisher: 'Ditto Team',
    },
    rating: 4.5,
    ratingCount: 2,
    downloads: 96,
    verified: true,
    publishedAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'com.ditto.theme.midnight',
    manifest: {
      id: 'com.ditto.theme.midnight',
      name: 'Midnight Theme',
      version: '1.0.0',
      description: '优雅的午夜深色主题',
      icon: '🌙',
      type: 'theme',
      entry: 'frontend/index.html',
      category: 'theme',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 480, height: 400, minWidth: 360, minHeight: 300, resizable: true, maximizable: true },
    },
    market: {
      summary: '优雅的午夜深色主题，护眼配色',
      description: '# Midnight Theme\n\n为 Ditto WebOS 设计的优雅深色主题。\n\n## 特性\n\n- 护眼深色配色\n- 平滑过渡动画\n- 自定义强调色\n- 兼容所有内置应用\n\n包含完整的 design tokens 定义。',
      category: 'theme',
      tags: ['主题', '深色', '外观', '定制'],
      screenshots: [],
      changelog: '',
      downloadUrl: 'https://github.com/Nevino2233/Ditto_Market/releases/download/v1.0.0/com.ditto.theme.midnight-1.0.0.ditz',
      publisher: 'Ditto Team',
    },
    rating: 4.6,
    ratingCount: 5,
    downloads: 312,
    verified: true,
    publishedAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'com.ditto.weather',
    manifest: {
      id: 'com.ditto.weather',
      name: 'Ditto Weather',
      version: '1.0.0',
      description: '精美的天气预报应用，支持多城市切换',
      icon: '🌤️',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: ['network'],
      window: { width: 480, height: 640, minWidth: 360, minHeight: 480, resizable: true, maximizable: true },
    },
    market: {
      summary: '精美的天气预报应用，支持多城市切换',
      description: '# Ditto Weather\n\n精美的天气预报应用，支持多城市切换。\n\n## 特性\n\n- **实时天气** — 精准实时天气数据\n- **多城市** — 支持多城市切换管理\n- **7日预报** — 未来7天天气预报\n- **空气质量** — 空气质量指数监测\n- **精美动画** — 天气状态动态展示',
      category: 'utility',
      tags: ['天气', '预报', '工具', '生活'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.2,
    ratingCount: 1,
    downloads: 67,
    verified: true,
    publishedAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'com.ditto.timer',
    manifest: {
      id: 'com.ditto.timer',
      name: 'Ditto Timer',
      version: '1.0.0',
      description: '番茄钟与倒计时器，专注效率提升',
      icon: '⏱️',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'productivity',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 400, height: 520, minWidth: 320, minHeight: 420, resizable: true, maximizable: true },
    },
    market: {
      summary: '番茄钟与倒计时器，专注效率提升',
      description: '# Ditto Timer\n\n番茄钟与倒计时器，专注效率提升。\n\n## 特性\n\n- **番茄钟** — 经典25分钟工作法\n- **倒计时** — 自定义时长倒计时\n- **统计报告** — 专注时长统计分析\n- **提醒通知** — 时间到自动提醒\n- **白噪音** — 内置专注白噪音',
      category: 'productivity',
      tags: ['番茄钟', '倒计时', '效率', '专注'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.8,
    ratingCount: 4,
    downloads: 203,
    verified: true,
    publishedAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'com.ditto.draw',
    manifest: {
      id: 'com.ditto.draw',
      name: 'Ditto Draw',
      version: '1.0.0',
      description: '轻量级画板应用，支持多种画笔和颜色',
      icon: '🎨',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'entertainment',
      sandbox: 'trusted',
      permissions: ['storage'],
      window: { width: 800, height: 600, minWidth: 600, minHeight: 450, resizable: true, maximizable: true },
    },
    market: {
      summary: '轻量级画板应用，支持多种画笔和颜色',
      description: '# Ditto Draw\n\n轻量级画板应用，支持多种画笔和颜色。\n\n## 特性\n\n- **多种画笔** — 铅笔、毛笔、马克笔、橡皮擦\n- **颜色面板** — HSL 色轮 + 自定义调色板\n- **图层系统** — 支持多图层编辑和混合\n- **撤销重做** — 完整的操作历史记录\n- **导出分享** — 支持 PNG/JPG 导出',
      category: 'entertainment',
      tags: ['画板', '绘图', '创意', '设计'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.3,
    ratingCount: 3,
    downloads: 156,
    verified: true,
    publishedAt: Date.now() - 86400000 * 8,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'com.ditto.todo',
    manifest: {
      id: 'com.ditto.todo',
      name: 'Ditto Todo',
      version: '1.0.0',
      description: '高效待办事项管理，支持分类与优先级',
      icon: '✅',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'productivity',
      sandbox: 'trusted',
      permissions: ['storage'],
      window: { width: 520, height: 640, minWidth: 380, minHeight: 480, resizable: true, maximizable: true },
    },
    market: {
      summary: '高效待办事项管理，支持分类与优先级',
      description: '# Ditto Todo\n\n高效待办事项管理，支持分类与优先级。\n\n## 特性\n\n- **分类管理** — 自定义任务分类\n- **优先级** — 高/中/低优先级标记\n- **截止日期** — 设置任务截止时间\n- **完成统计** — 可视化完成率统计\n- **快捷操作** — 拖拽排序与批量操作',
      category: 'productivity',
      tags: ['待办', '任务', '效率', '管理'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.9,
    ratingCount: 6,
    downloads: 287,
    verified: true,
    publishedAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 0.5,
  },
  {
    id: 'com.ditto.code',
    manifest: {
      id: 'com.ditto.code',
      name: 'Ditto Code',
      version: '1.0.0',
      description: '轻量级代码编辑器，支持语法高亮',
      icon: '💻',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'development',
      sandbox: 'trusted',
      permissions: ['storage'],
      window: { width: 800, height: 600, minWidth: 600, minHeight: 400, resizable: true, maximizable: true },
    },
    market: {
      summary: '轻量级代码编辑器，支持语法高亮',
      description: '# Ditto Code\n\n轻量级代码编辑器，支持语法高亮。\n\n## 特性\n\n- **语法高亮** — 支持50+编程语言\n- **文件管理** — 树形文件浏览器\n- **主题切换** — 多款编辑器主题\n- **快捷键** — VSCode 风格快捷键\n- **自动补全** — 智能代码补全',
      category: 'development',
      tags: ['编辑器', '代码', '开发', 'IDE'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.8,
    ratingCount: 5,
    downloads: 342,
    verified: true,
    publishedAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'com.ditto.calendar',
    manifest: {
      id: 'com.ditto.calendar',
      name: 'Ditto Calendar',
      version: '1.0.0',
      description: '优雅的日历应用，支持事件管理',
      icon: '📅',
      type: 'app',
      entry: 'frontend/index.html',
      category: 'productivity',
      sandbox: 'trusted',
      permissions: ['storage'],
      window: { width: 640, height: 560, minWidth: 480, minHeight: 400, resizable: true, maximizable: true },
    },
    market: {
      summary: '优雅的日历应用，支持事件管理',
      description: '# Ditto Calendar\n\n优雅的日历应用，支持事件管理。\n\n## 特性\n\n- **月/周/日视图** — 灵活切换查看方式\n- **事件管理** — 创建、编辑、删除事件\n- **提醒通知** — 事件开始前自动提醒\n- **重复事件** — 支持每日/每周/每月重复\n- **农历显示** — 同时显示农历日期',
      category: 'productivity',
      tags: ['日历', '日程', '效率', '时间'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.5,
    ratingCount: 3,
    downloads: 178,
    verified: true,
    publishedAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'widget.ditto.clock',
    manifest: {
      id: 'widget.ditto.clock',
      name: 'Ditto Clock Widget',
      version: '1.0.0',
      description: '精美的模拟/数字时钟小组件',
      icon: '🕐',
      type: 'widget',
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 320, height: 240, minWidth: 200, minHeight: 150, resizable: true, maximizable: false },
    },
    market: {
      summary: '精美的模拟/数字时钟小组件',
      description: '# Ditto Clock Widget\n\n精美的模拟/数字时钟小组件。\n\n## 特性\n\n- **模拟时钟** — 经典表盘样式\n- **数字时钟** — 现代数字显示\n- **秒针动画** — 流畅的秒针转动\n- **多时区** — 支持多时区显示\n- **桌面常驻** — 小组件模式常驻桌面',
      category: 'utility',
      tags: ['时钟', '小组件', '工具', '桌面'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.1,
    ratingCount: 2,
    downloads: 89,
    verified: true,
    publishedAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'widget.ditto.quote',
    manifest: {
      id: 'widget.ditto.quote',
      name: 'Ditto Quote Widget',
      version: '1.0.0',
      description: '每日名言小组件，激励每一天',
      icon: '💬',
      type: 'widget',
      entry: 'frontend/index.html',
      category: 'entertainment',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 360, height: 200, minWidth: 280, minHeight: 160, resizable: true, maximizable: false },
    },
    market: {
      summary: '每日名言小组件，激励每一天',
      description: '# Ditto Quote Widget\n\n每日名言小组件，激励每一天。\n\n## 特性\n\n- **每日更新** — 每天展示新的名言\n- **分类浏览** — 励志/哲理/诗词分类\n- **收藏功能** — 收藏喜欢的名言\n- **分享** — 一键分享名言\n- **桌面常驻** — 小组件模式常驻桌面',
      category: 'entertainment',
      tags: ['名言', '小组件', '激励', '桌面'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 3.9,
    ratingCount: 1,
    downloads: 45,
    verified: true,
    publishedAt: Date.now() - 86400000 * 9,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'widget.ditto.system',
    manifest: {
      id: 'widget.ditto.system',
      name: 'Ditto System Widget',
      version: '1.0.0',
      description: '系统状态监控小组件',
      icon: '📊',
      type: 'widget',
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 320, height: 280, minWidth: 260, minHeight: 220, resizable: true, maximizable: false },
    },
    market: {
      summary: '系统状态监控小组件',
      description: '# Ditto System Widget\n\n系统状态监控小组件。\n\n## 特性\n\n- **CPU 监控** — 实时 CPU 使用率\n- **内存监控** — 内存占用情况\n- **网络状态** — 网络连接与速度\n- **磁盘空间** — 存储空间使用情况\n- **桌面常驻** — 小组件模式常驻桌面',
      category: 'utility',
      tags: ['系统', '监控', '小组件', '工具'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.0,
    ratingCount: 1,
    downloads: 56,
    verified: true,
    publishedAt: Date.now() - 86400000 * 11,
    updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'com.ditto.theme.ocean',
    manifest: {
      id: 'com.ditto.theme.ocean',
      name: 'Ocean Theme',
      version: '1.0.0',
      description: '深邃海洋蓝色主题，宁静致远',
      icon: '🌊',
      type: 'theme',
      entry: 'frontend/index.html',
      category: 'theme',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 480, height: 400, minWidth: 360, minHeight: 300, resizable: true, maximizable: true },
    },
    market: {
      summary: '深邃海洋蓝色主题，宁静致远',
      description: '# Ocean Theme\n\n深邃海洋蓝色主题，宁静致远。\n\n## 特性\n\n- 海洋蓝色调配色方案\n- 水波纹过渡动画\n- 自定义蓝色强调色\n- 兼容所有内置应用\n\n包含完整的 design tokens 定义。',
      category: 'theme',
      tags: ['主题', '蓝色', '海洋', '外观'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.4,
    ratingCount: 3,
    downloads: 198,
    verified: true,
    publishedAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 0.5,
  },
  {
    id: 'com.ditto.theme.forest',
    manifest: {
      id: 'com.ditto.theme.forest',
      name: 'Forest Theme',
      version: '1.0.0',
      description: '自然森林绿色主题，清新舒适',
      icon: '🌲',
      type: 'theme',
      entry: 'frontend/index.html',
      category: 'forest',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 480, height: 400, minWidth: 360, minHeight: 300, resizable: true, maximizable: true },
    },
    market: {
      summary: '自然森林绿色主题，清新舒适',
      description: '# Forest Theme\n\n自然森林绿色主题，清新舒适。\n\n## 特性\n\n- 森林绿色调配色方案\n- 自然过渡动画\n- 自定义绿色强调色\n- 兼容所有内置应用\n\n包含完整的 design tokens 定义。',
      category: 'forest',
      tags: ['主题', '绿色', '森林', '自然'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 3.8,
    ratingCount: 1,
    downloads: 42,
    verified: true,
    publishedAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 0.3,
  },
  {
    id: 'com.ditto.theme.nord',
    manifest: {
      id: 'com.ditto.theme.nord',
      name: 'Nord Theme',
      version: '1.0.0',
      description: '北欧极光主题，冷峻优雅',
      icon: '❄️',
      type: 'theme',
      entry: 'frontend/index.html',
      category: 'theme',
      sandbox: 'trusted',
      permissions: [],
      window: { width: 480, height: 400, minWidth: 360, minHeight: 300, resizable: true, maximizable: true },
    },
    market: {
      summary: '北欧极光主题，冷峻优雅',
      description: '# Nord Theme\n\n北欧极光主题，冷峻优雅。\n\n## 特性\n\n- 北极色调配色方案\n- 极光渐变动画效果\n- 自定义冷色强调色\n- 兼容所有内置应用\n\n包含完整的 design tokens 定义。',
      category: 'theme',
      tags: ['主题', '北欧', '极光', '冷色'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.7,
    ratingCount: 4,
    downloads: 265,
    verified: true,
    publishedAt: Date.now() - 86400000 * 1.5,
    updatedAt: Date.now() - 86400000 * 0.2,
  },
  {
    id: 'com.ditto.plugin.clipboard',
    manifest: {
      id: 'com.ditto.plugin.clipboard',
      name: 'Clipboard Manager',
      version: '1.0.0',
      description: '剪贴板历史管理插件',
      icon: '📋',
      type: 'plugin',
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: ['clipboard.read', 'clipboard.write'],
      window: { width: 400, height: 500, minWidth: 300, minHeight: 400, resizable: true, maximizable: true },
    },
    market: {
      summary: '剪贴板历史管理插件',
      description: '# Clipboard Manager\n\n剪贴板历史管理插件。\n\n## 特性\n\n- **历史记录** — 自动记录剪贴板历史\n- **快速搜索** — 全文搜索历史记录\n- **置顶固定** — 常用内容置顶固定\n- **分类管理** — 文本/链接/图片分类\n- **一键粘贴** — 快速选择粘贴内容',
      category: 'utility',
      tags: ['剪贴板', '插件', '工具', '效率'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.3,
    ratingCount: 3,
    downloads: 134,
    verified: true,
    publishedAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 0.5,
  },
];

const DEMO_REVIEWS: Record<string, MarketReview[]> = {
  'com.ditto.notes': [
    { userId: 'alice', rating: 5, comment: '非常好用的笔记应用，Markdown 支持很棒！', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 10).toISOString() },
    { userId: 'bob', rating: 4, comment: '界面简洁，启动速度快，希望能增加标签功能。', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 8).toISOString() },
    { userId: 'charlie', rating: 5, comment: '终于有一个好用的 WebOS 笔记了！', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
  ],
  'com.ditto.calc': [
    { userId: 'dave', rating: 5, comment: '计算器很漂亮，键盘操作很方便！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { userId: 'eve', rating: 4, comment: '暗色主题很舒服，希望能加科学计算。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
  ],
  'com.ditto.theme.midnight': [
    { userId: 'kate', rating: 5, comment: '配色很舒服，长时间使用不累眼。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { userId: 'leo', rating: 4, comment: '不错，希望能加更多强调色选项。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { userId: 'mia', rating: 5, comment: '完美的深色主题！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
    { userId: 'noah', rating: 5, comment: '过渡动画很丝滑。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString() },
    { userId: 'olivia', rating: 4, comment: '和所有内置应用都兼容，赞。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.2).toISOString() },
  ],
  'com.ditto.timer': [
    { userId: 'peter', rating: 5, comment: '番茄钟太好用了，专注效率明显提升！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { userId: 'quinn', rating: 4, comment: '白噪音功能很赞，希望能加更多音效。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
  ],
  'com.ditto.draw': [
    { userId: 'rachel', rating: 4, comment: '画笔效果很流畅，适合快速草图！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
    { userId: 'sam', rating: 5, comment: '图层系统很实用，期待更多笔刷。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  ],
  'com.ditto.todo': [
    { userId: 'tina', rating: 5, comment: '待办管理终于有了，分类功能很棒！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { userId: 'uma', rating: 5, comment: '优先级标记和拖拽排序太好用了。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  ],
  'com.ditto.code': [
    { userId: 'iris', rating: 5, comment: '语法高亮很棒，启动超快！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { userId: 'jack', rating: 5, comment: '终于可以在 WebOS 里写代码了。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  ],
  'com.ditto.calendar': [
    { userId: 'victor', rating: 4, comment: '日历视图很优雅，事件管理方便。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 6).toISOString() },
    { userId: 'wendy', rating: 5, comment: '农历显示很贴心，国人必备！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
  ],
  'com.ditto.theme.ocean': [
    { userId: 'xander', rating: 5, comment: '海洋蓝色调太美了，水波纹动画很舒服。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
    { userId: 'yara', rating: 4, comment: '配色很和谐，适合长时间使用。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString() },
  ],
  'com.ditto.theme.nord': [
    { userId: 'zane', rating: 5, comment: '北欧风太有格调了，极光渐变绝美！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
    { userId: 'ava', rating: 4, comment: '冷色调很独特，和深色主题完全不同的感觉。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.3).toISOString() },
  ],
  'com.ditto.plugin.clipboard': [
    { userId: 'ben', rating: 4, comment: '剪贴板历史终于有了，效率提升明显！', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { userId: 'cathy', rating: 5, comment: '搜索和置顶功能很实用，再也不怕丢失复制内容。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString() },
  ],
  'com.ditto.weather': [
    { userId: 'henry', rating: 4, comment: '天气数据准确，界面美观。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
  ],
  'widget.ditto.clock': [
    { userId: 'diana', rating: 4, comment: '模拟时钟很精致，桌面常驻很方便。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  ],
  'widget.ditto.quote': [
    { userId: 'ethan', rating: 4, comment: '每天一句名言，很有仪式感。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
  ],
  'widget.ditto.system': [
    { userId: 'fiona', rating: 4, comment: '系统监控很直观，桌面小组件很实用。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  ],
  'com.ditto.theme.forest': [
    { userId: 'george', rating: 4, comment: '绿色主题很清新，适合白天使用。', version: '1.0.0', createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString() },
  ],
};

const DEMO_FEATURED: MarketFeatured = {
  banner: [
    { appId: 'com.ditto.timer', image: '', title: 'Ditto Timer — 番茄钟', subtitle: '番茄钟与倒计时器，专注效率提升' },
    { appId: 'com.ditto.theme.nord', image: '', title: 'Nord Theme — 北欧极光', subtitle: '北欧极光主题，冷峻优雅' },
    { appId: 'com.ditto.todo', image: '', title: 'Ditto Todo — 待办管理', subtitle: '高效待办事项管理，支持分类与优先级' },
  ],
  editorsChoice: ['com.ditto.timer', 'com.ditto.code', 'com.ditto.theme.nord', 'com.ditto.todo', 'com.ditto.draw'],
  newApps: ['com.ditto.theme.ocean', 'com.ditto.theme.forest', 'com.ditto.theme.nord', 'com.ditto.plugin.clipboard', 'widget.ditto.clock'],
  topRated: ['com.ditto.code', 'com.ditto.timer', 'com.ditto.theme.nord', 'com.ditto.todo', 'com.ditto.theme.midnight'],
};

export function createMarketRoutes(deps: MarketRouteDeps): Hono {
  const router = new Hono();
  const { cellManager, appsDir } = deps;
  const testAppsDir = deps.testAppsDir;
  const owner = deps.owner ?? DEFAULT_OWNER;
  const repo = deps.repo ?? DEFAULT_REPO;
  const localDataDir = deps.localDataDir;
  const packager = new Packager();

  const cache = new Map<string, CacheEntry<unknown>>();
  const API_CACHE_TTL = 5 * 60 * 1000;
  const REVIEW_CACHE_TTL = 2 * 60 * 1000;
  const ditCacheDir = path.join(appsDir, '..', 'cache', 'dit');
  fs.mkdirSync(ditCacheDir, { recursive: true });

  const packagesDir = path.resolve(process.cwd(), 'data', 'market-packages');
  // Persisted reviews live alongside installed apps under server/data/reviews/.
  const reviewsDir = path.resolve(process.cwd(), 'data', 'reviews');

  router.get('/packages/:filename', async (c) => {
    const filename = c.req.param('filename');
    if (!filename.match(/^[\w.-]+\.(dit|ditx|ditc|ditz)$/)) {
      return c.json({ error: 'Invalid package filename' }, 400);
    }
    const filePath = path.join(packagesDir, filename);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: 'Package not found' }, 404);
    }
    const data = fs.readFileSync(filePath);
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(data);
  });

  let githubAvailable: boolean | null = null;
  let githubCheckTime = 0;
  const GITHUB_CHECK_INTERVAL = 60 * 1000;

  function getCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  function setCache<T>(key: string, data: T, ttl: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttl });
  }

  function githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Ditto-Market-Server',
    };
    if (deps.githubToken) {
      headers['Authorization'] = `Bearer ${deps.githubToken}`;
    }
    return headers;
  }

  async function checkGitHubAvailable(): Promise<boolean> {
    if (githubAvailable !== null && Date.now() - githubCheckTime < GITHUB_CHECK_INTERVAL) {
      return githubAvailable;
    }
    try {
      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: githubHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      githubAvailable = response.ok;
      githubCheckTime = Date.now();
      return githubAvailable;
    } catch {
      githubAvailable = false;
      githubCheckTime = Date.now();
      return false;
    }
  }

  async function fetchGitHub<T>(apiPath: string): Promise<T> {
    const url = apiPath.startsWith('http') ? apiPath : `${GITHUB_API}${apiPath}`;
    const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async function fetchGitHubRaw(filePath: string): Promise<string> {
    const url = `${GITHUB_RAW}/${owner}/${repo}/${DEFAULT_BRANCH}/${filePath}`;
    const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`GitHub raw error: ${response.status}`);
    }
    return response.text();
  }

  async function fetchGitHubJSON<T>(filePath: string): Promise<T> {
    const text = await fetchGitHubRaw(filePath);
    return JSON.parse(text) as T;
  }

  function readLocalJSON<T>(filePath: string): T | null {
    if (!localDataDir) return null;
    const fullPath = path.join(localDataDir, filePath);
    try {
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as T;
      }
    } catch {}
    return null;
  }

  function readLocalText(filePath: string): string | null {
    if (!localDataDir) return null;
    const fullPath = path.join(localDataDir, filePath);
    try {
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
      }
    } catch {}
    return null;
  }

  function listLocalAppDirs(): string[] {
    if (!localDataDir) return [];
    const appsPath = path.join(localDataDir, 'apps');
    try {
      if (!fs.existsSync(appsPath)) return [];
      return fs.readdirSync(appsPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch { return []; }
  }

  function listTestAppDirs(): string[] {
    if (!testAppsDir) return [];
    try {
      if (!fs.existsSync(testAppsDir)) return [];
      return fs.readdirSync(testAppsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch { return []; }
  }

  /**
   * Reads the pre-installed apps directory (appsDir, e.g. server/data/apps/).
   * Directory names use underscores (com_ditto_calc) while manifest.id uses
   * dots (com.ditto.calc), so we read each manifest.json to resolve the real id.
   */
  function listPreInstalledAppIds(): string[] {
    try {
      if (!fs.existsSync(appsDir)) return [];
      const dirs = fs.readdirSync(appsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      const ids: string[] = [];
      for (const dirName of dirs) {
        try {
          const manifestPath = path.join(appsDir, dirName, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AppManifest;
            if (manifest.id) ids.push(manifest.id);
          }
        } catch {}
      }
      return ids;
    } catch { return []; }
  }

  /** Whether an app is physically present in the pre-installed apps directory. */
  function isPreInstalled(appId: string): boolean {
    const dirName = appId.replace(/\./g, '_');
    return fs.existsSync(path.join(appsDir, dirName, 'manifest.json'));
  }

  async function listAppDirs(): Promise<string[]> {
    const cacheKey = 'app-dirs';
    const cached = getCache<string[]>(cacheKey);
    if (cached) return cached;

    const localDirs = listLocalAppDirs();
    const testDirs = listTestAppDirs();
    const preInstalledIds = listPreInstalledAppIds();
    const combinedLocal = [...new Set([...localDirs, ...testDirs, ...preInstalledIds])];
    if (combinedLocal.length > 0) {
      const allDirs = [...new Set([...combinedLocal, ...DEMO_APPS.map(a => a.id)])];
      setCache(cacheKey, allDirs, API_CACHE_TTL);
      return allDirs;
    }

    const ghAvailable = await checkGitHubAvailable();
    if (!ghAvailable) {
      const demoDirs = DEMO_APPS.map(a => a.id);
      setCache(cacheKey, demoDirs, API_CACHE_TTL);
      return demoDirs;
    }

    try {
      const data = await fetchGitHub<{ path: string; type: string }[]>(
        `/repos/${owner}/${repo}/contents/test-apps`
      );
      const dirs = data.filter(item => item.type === 'dir').map(item => item.path.split('/').pop()!);
      const allDirs = [...new Set([...dirs, ...DEMO_APPS.map(a => a.id)])];
      setCache(cacheKey, allDirs, API_CACHE_TTL);
      return allDirs;
    } catch {
      const demoDirs = DEMO_APPS.map(a => a.id);
      console.log(`[Market] GitHub fetch failed, using ${demoDirs.length} demo apps`);
      setCache(cacheKey, demoDirs, API_CACHE_TTL);
      return demoDirs;
    }
  }

  async function getAppManifest(appId: string): Promise<AppManifest & { market?: MarketMeta }> {
    const cacheKey = `manifest:${appId}`;
    const cached = getCache<AppManifest & { market?: MarketMeta }>(cacheKey);
    if (cached) return cached;

    const localManifest = readLocalJSON<AppManifest & { market?: MarketMeta }>(`test-apps/${appId}/manifest.json`);
    if (localManifest) {
      setCache(cacheKey, localManifest, API_CACHE_TTL);
      return localManifest;
    }

    if (testAppsDir) {
      const testManifestPath = path.join(testAppsDir, appId, 'manifest.json');
      try {
        if (fs.existsSync(testManifestPath)) {
          const testManifest = JSON.parse(fs.readFileSync(testManifestPath, 'utf8')) as AppManifest & { market?: MarketMeta };
          setCache(cacheKey, testManifest, API_CACHE_TTL);
          return testManifest;
        }
      } catch {}
    }

    // Pre-installed apps live in appsDir using underscored directory names
    // (e.g. com.ditto.calc -> com_ditto_calc), while manifest.id keeps dots.
    const preInstalledDirName = appId.replace(/\./g, '_');
    const preInstalledManifestPath = path.join(appsDir, preInstalledDirName, 'manifest.json');
    try {
      if (fs.existsSync(preInstalledManifestPath)) {
        const preInstalledManifest = JSON.parse(fs.readFileSync(preInstalledManifestPath, 'utf8')) as AppManifest & { market?: MarketMeta };
        setCache(cacheKey, preInstalledManifest, API_CACHE_TTL);
        return preInstalledManifest;
      }
    } catch {}

    const demoApp = DEMO_APPS.find(a => a.id === appId);
    if (demoApp) {
      const manifest = { ...demoApp.manifest, market: demoApp.market };
      setCache(cacheKey, manifest, API_CACHE_TTL);
      return manifest;
    }

    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      const manifest = await fetchGitHubJSON<AppManifest & { market?: MarketMeta }>(
        `test-apps/${appId}/manifest.json`
      );
      setCache(cacheKey, manifest, API_CACHE_TTL);
      return manifest;
    }

    throw new Error(`App ${appId} not found`);
  }

  async function buildAppStoreEntry(appId: string): Promise<MarketAppEntry> {
    const manifest = await getAppManifest(appId);
    const market = manifest.market ?? {
      summary: manifest.description ?? '',
      description: manifest.description ?? '',
      category: manifest.category ?? 'other',
      tags: [],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: '',
    };

    let reviews: PersistedReview[] = [];
    try {
      reviews = await getAppReviews(appId);
    } catch {}

    const ratingCount = reviews.length;
    const rating = ratingCount > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount
      : 0;

    const demoApp = DEMO_APPS.find(a => a.id === appId);
    const installed = isPreInstalled(appId) || cellManager.getInstalledApps().has(appId);

    return {
      id: appId,
      manifest,
      market,
      rating: demoApp ? demoApp.rating : Math.round(rating * 10) / 10,
      ratingCount: demoApp ? demoApp.ratingCount : ratingCount,
      downloads: demoApp?.downloads ?? 0,
      verified: true,
      publishedAt: demoApp?.publishedAt ?? 0,
      updatedAt: demoApp?.updatedAt ?? 0,
      installed,
    };
  }

  /** Resolves the on-disk path for an app's persisted reviews (appId dots -> underscores). */
  function reviewFilePath(appId: string): string {
    return path.join(reviewsDir, `${appId.replace(/\./g, '_')}.json`);
  }

  /** Reads persisted reviews for an app; returns null when the file does not exist or is unreadable. */
  async function readReviewFile(appId: string): Promise<PersistedReview[] | null> {
    try {
      const filePath = reviewFilePath(appId);
      if (!fs.existsSync(filePath)) return null;
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ReviewFile>;
      if (parsed && Array.isArray(parsed.reviews)) {
        return parsed.reviews as PersistedReview[];
      }
      return null;
    } catch (e) {
      console.error(`[Market] Failed to read reviews for ${appId}:`, e instanceof Error ? e.message : e);
      return null;
    }
  }

  /** Persists reviews for an app, creating the reviews directory if needed. Returns false on failure. */
  async function writeReviewFile(appId: string, reviews: PersistedReview[]): Promise<boolean> {
    try {
      await fs.promises.mkdir(reviewsDir, { recursive: true });
      const file: ReviewFile = { appId, reviews };
      await fs.promises.writeFile(reviewFilePath(appId), JSON.stringify(file, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`[Market] Failed to write reviews for ${appId}:`, e instanceof Error ? e.message : e);
      return false;
    }
  }

  async function getAppReviews(appId: string): Promise<PersistedReview[]> {
    const cacheKey = `reviews:${appId}`;
    const cached = getCache<PersistedReview[]>(cacheKey);
    if (cached) return cached;

    // 1. Local persisted reviews (server/data/reviews/<appId>.json)
    const localReviews = await readReviewFile(appId);
    if (localReviews !== null) {
      setCache(cacheKey, localReviews, REVIEW_CACHE_TTL);
      return localReviews;
    }

    // 2. Fallback to demo reviews
    if (DEMO_REVIEWS[appId]) {
      setCache(cacheKey, DEMO_REVIEWS[appId] as PersistedReview[], REVIEW_CACHE_TTL);
      return DEMO_REVIEWS[appId] as PersistedReview[];
    }

    // 3. Remote (GitHub) as a last resort
    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      try {
        const reviews = await fetchGitHubJSON<PersistedReview[]>(
          `data/reviews/${appId}.json`
        );
        setCache(cacheKey, reviews, REVIEW_CACHE_TTL);
        return reviews;
      } catch { return []; }
    }

    return [];
  }

  router.get('/categories', async (c) => {
    const cacheKey = 'categories';
    const cached = getCache<MarketCategory[]>(cacheKey);
    if (cached) return c.json(cached);

    const localCategories = readLocalJSON<MarketCategory[]>('data/categories.json');
    if (localCategories) {
      setCache(cacheKey, localCategories, API_CACHE_TTL);
      return c.json(localCategories);
    }

    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      try {
        const categories = await fetchGitHubJSON<MarketCategory[]>('data/categories.json');
        setCache(cacheKey, categories, API_CACHE_TTL);
        return c.json(categories);
      } catch {}
    }

    setCache(cacheKey, DEFAULT_CATEGORIES, API_CACHE_TTL);
    return c.json(DEFAULT_CATEGORIES);
  });

  router.get('/featured', async (c) => {
    const cacheKey = 'featured';
    const cached = getCache<MarketFeatured>(cacheKey);
    if (cached) return c.json(cached);

    const localFeatured = readLocalJSON<MarketFeatured>('data/featured.json');
    if (localFeatured) {
      setCache(cacheKey, localFeatured, API_CACHE_TTL);
      return c.json(localFeatured);
    }

    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      try {
        const featured = await fetchGitHubJSON<MarketFeatured>('data/featured.json');
        setCache(cacheKey, featured, API_CACHE_TTL);
        return c.json(featured);
      } catch {}
    }

    setCache(cacheKey, DEMO_FEATURED, API_CACHE_TTL);
    return c.json(DEMO_FEATURED);
  });

  router.get('/apps', async (c) => {
    const category = c.req.query('category');
    const search = c.req.query('search');
    const sort = c.req.query('sort') ?? 'newest';

    try {
      const appDirs = await listAppDirs();
      const entries: MarketAppEntry[] = [];

      for (const appId of appDirs) {
        try {
          const entry = await buildAppStoreEntry(appId);
          if (category && entry.market.category !== category) continue;
          if (search) {
            const q = search.toLowerCase();
            const nameMatch = entry.manifest.name.toLowerCase().includes(q);
            const descMatch = entry.market.summary.toLowerCase().includes(q);
            const tagMatch = entry.market.tags.some(t => t.toLowerCase().includes(q));
            if (!nameMatch && !descMatch && !tagMatch) continue;
          }
          entries.push(entry);
        } catch (e) {
          console.error(`[Market] Failed to build entry for ${appId}:`, e instanceof Error ? e.message : e);
        }
      }

      switch (sort) {
        case 'rating':
          entries.sort((a, b) => b.rating - a.rating);
          break;
        case 'downloads':
          entries.sort((a, b) => b.downloads - a.downloads);
          break;
        case 'newest':
        default:
          entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          break;
      }

      return c.json({ apps: entries, total: entries.length });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Failed to fetch apps' }, 502);
    }
  });

  router.get('/apps/:appId', async (c) => {
    const appId = c.req.param('appId');
    try {
      const entry = await buildAppStoreEntry(appId);
      const reviews = await getAppReviews(appId);
      return c.json({ ...entry, reviews });
    } catch (e) {
      return c.json({ error: 'App not found' }, 404);
    }
  });

  router.get('/apps/:appId/screenshots/:name', async (c) => {
    const appId = c.req.param('appId');
    const name = c.req.param('name');

    if (localDataDir) {
      const localPath = path.join(localDataDir, 'test-apps', appId, 'screenshots', name);
      if (fs.existsSync(localPath)) {
        const ext = path.extname(name).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        };
        c.header('Content-Type', mimeTypes[ext] ?? 'image/png');
        c.header('Cache-Control', 'public, max-age=1800');
        return c.body(fs.readFileSync(localPath));
      }
    }

    const url = `${GITHUB_RAW}/${owner}/${repo}/${DEFAULT_BRANCH}/test-apps/${appId}/screenshots/${name}`;
    try {
      const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(10000) });
      if (!response.ok) return c.json({ error: 'Screenshot not found' }, 404);
      const data = await response.arrayBuffer();
      const ext = path.extname(name).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      };
      c.header('Content-Type', mimeTypes[ext] ?? 'image/png');
      c.header('Cache-Control', 'public, max-age=1800');
      return c.body(new Uint8Array(data));
    } catch {
      return c.json({ error: 'Screenshot not found' }, 404);
    }
  });

  router.get('/apps/:appId/icon', async (c) => {
    const appId = c.req.param('appId');
    const dirName = appId.replace(/\./g, '_');

    // Pre-installed apps live in appsDir (underscored names); test apps may live in testAppsDir.
    const candidateDirs: string[] = [path.join(appsDir, dirName)];
    if (testAppsDir) candidateDirs.push(path.join(testAppsDir, appId));

    const iconMimeTypes: Record<string, string> = {
      '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
    };

    for (const baseDir of candidateDirs) {
      const manifestPath = path.join(baseDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      let icon: string | undefined;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AppManifest;
        icon = manifest.icon;
      } catch {
        continue;
      }
      if (!icon) continue;

      // Only treat the icon as a file when it references an image asset path.
      if (!/\.(svg|png|jpe?g|webp|gif|ico|bmp)$/i.test(icon)) continue;

      const resolvedBase = path.resolve(baseDir);
      const iconPath = path.resolve(resolvedBase, icon);
      // Guard against path traversal escaping the app directory.
      if (!iconPath.startsWith(resolvedBase + path.sep) && iconPath !== resolvedBase) continue;
      if (!fs.existsSync(iconPath) || !fs.statSync(iconPath).isFile()) continue;

      const ext = path.extname(iconPath).toLowerCase();
      c.header('Content-Type', iconMimeTypes[ext] ?? 'application/octet-stream');
      c.header('Cache-Control', 'public, max-age=3600');
      return c.body(fs.readFileSync(iconPath));
    }

    return c.json({ error: 'Icon not found' }, 404);
  });

  router.get('/apps/:appId/changelog', async (c) => {
    const appId = c.req.param('appId');

    const localChangelog = readLocalText(`test-apps/${appId}/changelog.md`);
    if (localChangelog) {
      c.header('Content-Type', 'text/markdown');
      return c.body(localChangelog);
    }

    try {
      const changelog = await fetchGitHubRaw(`test-apps/${appId}/changelog.md`);
      c.header('Content-Type', 'text/markdown');
      return c.body(changelog);
    } catch {
      return c.json({ error: 'Changelog not found' }, 404);
    }
  });

  router.get('/apps/:appId/reviews', async (c) => {
    const appId = c.req.param('appId');
    const reviews = await getAppReviews(appId);
    return c.json({ reviews, total: reviews.length });
  });

  router.post('/apps/:appId/reviews', async (c) => {
    const appId = c.req.param('appId');
    const userId = c.req.header('X-User-Id');
    if (!userId) return c.json({ error: 'Authentication required' }, 401);

    const body = await c.req.json<{ rating: number; comment: string; userName?: string }>();
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      return c.json({ error: 'Rating must be between 1 and 5' }, 400);
    }

    const existingReviews = await getAppReviews(appId);
    const alreadyReviewed = existingReviews.some(r => r.userId === userId);
    if (alreadyReviewed) {
      return c.json({ error: 'You have already reviewed this app' }, 409);
    }

    const manifest = await getAppManifest(appId);
    const review: PersistedReview = {
      userId,
      userName: body.userName ?? userId,
      rating: body.rating,
      comment: body.comment ?? '',
      version: manifest.version,
      createdAt: new Date().toISOString(),
    };

    // Persist: read existing file -> append -> cap at MAX_REVIEWS_PER_APP (drop oldest) -> write back.
    const fileReviews = await readReviewFile(appId);
    const baseReviews: PersistedReview[] = fileReviews ?? [];
    const appended = [...baseReviews, review];
    const capped = appended.length > MAX_REVIEWS_PER_APP
      ? appended.slice(appended.length - MAX_REVIEWS_PER_APP)
      : appended;
    await writeReviewFile(appId, capped);

    // Invalidate cache so subsequent reads reflect the newly persisted review.
    cache.delete(`reviews:${appId}`);

    // Re-fetch the canonical review list (now served from the persisted file).
    const reviews = await getAppReviews(appId);

    const prTitle = `Review: ${appId} by ${userId}`;
    const prBody = `Adding review for ${appId}\n\nRating: ${'⭐'.repeat(body.rating)}\nComment: ${body.comment ?? '(no comment)'}`;
    const prUrl = `https://github.com/${owner}/${repo}/compare/${DEFAULT_BRANCH}...${userId}:ditto-market-review-${appId}-${Date.now()}?expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody)}`;

    return c.json({
      message: 'Review submitted',
      review,
      reviews,
      prUrl,
      instructions: `Fork the repo, add your review to data/reviews/${appId}.json, and submit a PR.`,
    });
  });

  router.post('/apps/:appId/install', async (c) => {
    const appId = c.req.param('appId');

    try {
      const manifest = await getAppManifest(appId);
      let downloadUrl = manifest.market?.downloadUrl;

      if (!downloadUrl && testAppsDir) {
        const srcDir = path.join(testAppsDir, appId);
        if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
          const destDir = path.join(appsDir, appId.replace(/\./g, '_'));
          fs.mkdirSync(destDir, { recursive: true });

          function copyDirRecursive(src: string, dest: string) {
            const entries = fs.readdirSync(src, { withFileTypes: true });
            for (const entry of entries) {
              const srcPath = path.join(src, entry.name);
              const destPath = path.join(dest, entry.name);
              if (entry.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                copyDirRecursive(srcPath, destPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          }

          copyDirRecursive(srcDir, destDir);

          const localManifestPath = path.join(destDir, 'manifest.json');
          let installedManifest = manifest;
          if (fs.existsSync(localManifestPath)) {
            installedManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8'));
          }

          cellManager.registerApp(installedManifest.id, installedManifest, path.join(destDir, 'backend'));

          return c.json({
            success: true,
            id: installedManifest.id,
            name: installedManifest.name,
            version: installedManifest.version,
            hasBackend: !!installedManifest.backend,
          });
        }
      }

      if (!downloadUrl) {
        return c.json({ error: 'No download URL available for this app' }, 400);
      }

      if (downloadUrl.startsWith('/')) {
        const host = c.req.header('host') ?? 'localhost:3001';
        const protocol = c.req.header('x-forwarded-proto') ?? 'http';
        downloadUrl = `${protocol}://${host}${downloadUrl}`;
      }

      const version = manifest.version;
      const cacheFile = path.join(ditCacheDir, `${appId}-${version}.dit`);

      if (!fs.existsSync(cacheFile)) {
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(downloadUrl, {
              headers: deps.githubToken ? { Authorization: `Bearer ${deps.githubToken}` } : {},
              signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(cacheFile, buffer);
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastError && !fs.existsSync(cacheFile)) {
          const localPattern = new RegExp(`^${appId.replace(/\./g, '\\.')}-${version.replace(/\./g, '\\.')}\\.(dit|ditx|ditc|ditz)$`);
          const localMatch = fs.readdirSync(packagesDir).find(f => localPattern.test(f));
          if (localMatch) {
            fs.copyFileSync(path.join(packagesDir, localMatch), cacheFile);
          } else {
            return c.json({ error: `Download failed after 3 attempts: ${lastError.message}` }, 502);
          }
        }
      }

      const validation = await packager.validate(cacheFile);
      if (!validation.valid) {
        return c.json({ error: 'Package validation failed', details: validation.errors }, 400);
      }

      const appDir = path.join(appsDir, appId.replace(/\./g, '_'));
      fs.mkdirSync(appDir, { recursive: true });

      const unpackResult = await packager.unpack(cacheFile, appDir);
      cellManager.registerApp(unpackResult.manifest.id, unpackResult.manifest, path.join(appDir, 'backend'));

      return c.json({
        success: true,
        id: unpackResult.manifest.id,
        name: unpackResult.manifest.name,
        version: unpackResult.manifest.version,
        hasBackend: !!unpackResult.manifest.backend,
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Installation failed' }, 500);
    }
  });

  router.get('/updates', async (c) => {
    const installedApps = cellManager.getInstalledApps();
    const updates: UpdateInfo[] = [];

    for (const [appId, data] of installedApps) {
      try {
        const remoteManifest = await getAppManifest(appId);
        const localVersion = data.manifest.version;
        const remoteVersion = remoteManifest.version;

        if (remoteVersion !== localVersion && compareVersions(remoteVersion, localVersion) > 0) {
          updates.push({
            appId,
            appName: data.manifest.name,
            icon: data.manifest.icon,
            currentVersion: localVersion,
            newVersion: remoteVersion,
            changelog: remoteManifest.market?.changelog,
            downloadUrl: remoteManifest.market?.downloadUrl ?? '',
          });
        }
      } catch {}
    }

    return c.json({ updates, total: updates.length });
  });

  router.get('/installed', async (c) => {
    const installedApps = cellManager.getInstalledApps();
    const result: InstalledAppInfo[] = [];

    for (const [appId, data] of installedApps) {
      let hasUpdate = false;
      let latestVersion: string | undefined;
      let latestDownloadUrl: string | undefined;
      try {
        const remoteManifest = await getAppManifest(appId);
        const localVersion = data.manifest.version;
        const remoteVersion = remoteManifest.version;
        if (remoteVersion !== localVersion && compareVersions(remoteVersion, localVersion) > 0) {
          hasUpdate = true;
          latestVersion = remoteVersion;
          latestDownloadUrl = remoteManifest.market?.downloadUrl ?? '';
        }
      } catch {}

      result.push({
        appId,
        appName: data.manifest.name,
        icon: data.manifest.icon,
        installedVersion: data.manifest.version,
        // NOTE: AppCellManager.getInstalledApps() does not track installation
        // timestamps, so 0 is returned as a placeholder until that API is extended.
        installedAt: 0,
        hasUpdate,
        latestVersion,
        latestDownloadUrl,
      });
    }

    return c.json({ apps: result, total: result.length });
  });

  return router;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
