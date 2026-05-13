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
  githubToken?: string;
  owner?: string;
  repo?: string;
  localDataDir?: string;
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
      entry: 'frontend/index.html',
      category: 'productivity',
      sandbox: 'trusted',
      permissions: ['storage'],
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
      entry: 'frontend/index.html',
      category: 'utility',
      sandbox: 'trusted',
      permissions: [],
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
      icon: '�',
      entry: 'frontend/index.html',
      category: 'theme',
      sandbox: 'trusted',
      permissions: [],
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
    id: 'com.ditto.canvas',
    manifest: {
      id: 'com.ditto.canvas',
      name: 'Ditto Canvas',
      version: '0.1.0',
      description: '创意画板应用',
      icon: '🎨',
      entry: 'index.html',
      category: 'entertainment',
      sandbox: 'trusted',
      permissions: ['storage'],
    },
    market: {
      summary: '专业级创意画板，释放你的创造力',
      description: '# Ditto Canvas\n\n一款功能丰富的创意画板应用。\n\n## 特性\n\n- **多种画笔** — 铅笔、毛笔、马克笔、橡皮擦\n- **颜色面板** — HSL 色轮 + 自定义调色板\n- **图层系统** — 支持多图层编辑和混合',
      category: 'entertainment',
      tags: ['画板', '绘图', '创意', '设计'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.5,
    ratingCount: 2,
    downloads: 86,
    verified: true,
    publishedAt: Date.now() - 86400000 * 9,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'com.ditto.weather',
    manifest: {
      id: 'com.ditto.weather',
      name: 'Ditto Weather',
      version: '0.1.0',
      description: '天气预报小组件',
      icon: '🌤️',
      entry: 'index.html',
      category: 'widget',
      sandbox: 'trusted',
      permissions: ['network'],
    },
    market: {
      summary: '精美的天气预报小组件',
      description: '# Ditto Weather\n\n天气小组件应用。\n\n## 特性\n\n- 实时天气数据\n- 7日天气预报\n- 空气质量指数',
      category: 'widget',
      tags: ['天气', '小组件', '预报'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.0,
    ratingCount: 1,
    downloads: 52,
    verified: true,
    publishedAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'com.ditto.code',
    manifest: {
      id: 'com.ditto.code',
      name: 'Ditto Code',
      version: '0.1.0',
      description: '轻量级代码编辑器',
      icon: '💻',
      entry: 'index.html',
      category: 'development',
      sandbox: 'trusted',
      permissions: ['storage', 'network'],
    },
    market: {
      summary: '轻量级在线代码编辑器，支持语法高亮',
      description: '# Ditto Code\n\n轻量级在线代码编辑器。\n\n## 特性\n\n- 语法高亮\n- 文件管理\n- 终端集成',
      category: 'development',
      tags: ['编辑器', '代码', '开发'],
      screenshots: [],
      changelog: '',
      downloadUrl: '',
      publisher: 'Ditto Team',
    },
    rating: 4.8,
    ratingCount: 4,
    downloads: 203,
    verified: true,
    publishedAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 86400000 * 1,
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
  'com.ditto.canvas': [
    { userId: 'frank', rating: 5, comment: '画笔效果很流畅，适合快速草图！', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 7).toISOString() },
    { userId: 'grace', rating: 4, comment: '功能丰富，期待更多笔刷。', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
  ],
  'com.ditto.weather': [
    { userId: 'henry', rating: 4, comment: '天气数据准确，界面美观。', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
  ],
  'com.ditto.code': [
    { userId: 'iris', rating: 5, comment: '语法高亮很棒，启动超快！', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { userId: 'jack', rating: 5, comment: '终于可以在 WebOS 里写代码了。', version: '0.1.0', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  ],
};

const DEMO_FEATURED: MarketFeatured = {
  banner: [
    { appId: 'com.ditto.notes', image: '', title: 'Ditto Notes — 轻量笔记', subtitle: '简洁高效的 Markdown 笔记应用' },
    { appId: 'com.ditto.calc', image: '', title: 'Ditto Calculator — 计算器', subtitle: '简洁美观的科学计算器' },
    { appId: 'com.ditto.theme.midnight', image: '', title: 'Midnight Theme — 深色主题', subtitle: '优雅的午夜深色主题' },
  ],
  editorsChoice: ['com.ditto.notes', 'com.ditto.calc', 'com.ditto.theme.midnight'],
  newApps: ['com.ditto.calc', 'com.ditto.theme.midnight', 'com.ditto.weather'],
  topRated: ['com.ditto.code', 'com.ditto.theme.midnight', 'com.ditto.notes'],
};

export function createMarketRoutes(deps: MarketRouteDeps): Hono {
  const router = new Hono();
  const { cellManager, appsDir } = deps;
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

  async function listAppDirs(): Promise<string[]> {
    const cacheKey = 'app-dirs';
    const cached = getCache<string[]>(cacheKey);
    if (cached) return cached;

    const localDirs = listLocalAppDirs();
    if (localDirs.length > 0) {
      setCache(cacheKey, localDirs, API_CACHE_TTL);
      return localDirs;
    }

    const ghAvailable = await checkGitHubAvailable();
    if (!ghAvailable) {
      const demoDirs = DEMO_APPS.map(a => a.id);
      setCache(cacheKey, demoDirs, API_CACHE_TTL);
      return demoDirs;
    }

    try {
      const data = await fetchGitHub<{ path: string; type: string }[]>(
        `/repos/${owner}/${repo}/contents/apps`
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

    const localManifest = readLocalJSON<AppManifest & { market?: MarketMeta }>(`apps/${appId}/manifest.json`);
    if (localManifest) {
      setCache(cacheKey, localManifest, API_CACHE_TTL);
      return localManifest;
    }

    const demoApp = DEMO_APPS.find(a => a.id === appId);
    if (demoApp) {
      const manifest = { ...demoApp.manifest, market: demoApp.market };
      setCache(cacheKey, manifest, API_CACHE_TTL);
      return manifest;
    }

    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      const manifest = await fetchGitHubJSON<AppManifest & { market?: MarketMeta }>(
        `apps/${appId}/manifest.json`
      );
      setCache(cacheKey, manifest, API_CACHE_TTL);
      return manifest;
    }

    throw new Error(`App ${appId} not found`);
  }

  async function buildAppStoreEntry(appId: string): Promise<AppStoreEntry> {
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

    let reviews: MarketReview[] = [];
    try {
      reviews = await getAppReviews(appId);
    } catch {}

    const ratingCount = reviews.length;
    const rating = ratingCount > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount
      : 0;

    const demoApp = DEMO_APPS.find(a => a.id === appId);

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
    };
  }

  async function getAppReviews(appId: string): Promise<MarketReview[]> {
    const cacheKey = `reviews:${appId}`;
    const cached = getCache<MarketReview[]>(cacheKey);
    if (cached) return cached;

    const localReviews = readLocalJSON<MarketReview[]>(`data/reviews/${appId}.json`);
    if (localReviews) {
      setCache(cacheKey, localReviews, REVIEW_CACHE_TTL);
      return localReviews;
    }

    if (DEMO_REVIEWS[appId]) {
      setCache(cacheKey, DEMO_REVIEWS[appId], REVIEW_CACHE_TTL);
      return DEMO_REVIEWS[appId];
    }

    const ghAvailable = await checkGitHubAvailable();
    if (ghAvailable) {
      try {
        const reviews = await fetchGitHubJSON<MarketReview[]>(
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
      const entries: AppStoreEntry[] = [];

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
        } catch {}
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
      const localPath = path.join(localDataDir, 'apps', appId, 'screenshots', name);
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

    const url = `${GITHUB_RAW}/${owner}/${repo}/${DEFAULT_BRANCH}/apps/${appId}/screenshots/${name}`;
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

  router.get('/apps/:appId/changelog', async (c) => {
    const appId = c.req.param('appId');

    const localChangelog = readLocalText(`apps/${appId}/changelog.md`);
    if (localChangelog) {
      c.header('Content-Type', 'text/markdown');
      return c.body(localChangelog);
    }

    try {
      const changelog = await fetchGitHubRaw(`apps/${appId}/changelog.md`);
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
    const userId = c.header('X-User-Id');
    if (!userId) return c.json({ error: 'Authentication required' }, 401);

    const body = await c.req.json<{ rating: number; comment: string }>();
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      return c.json({ error: 'Rating must be between 1 and 5' }, 400);
    }

    const existingReviews = await getAppReviews(appId);
    const alreadyReviewed = existingReviews.some(r => r.userId === userId);
    if (alreadyReviewed) {
      return c.json({ error: 'You have already reviewed this app' }, 409);
    }

    const manifest = await getAppManifest(appId);
    const review: MarketReview = {
      userId,
      rating: body.rating,
      comment: body.comment ?? '',
      version: manifest.version,
      createdAt: new Date().toISOString(),
    };

    const prTitle = `Review: ${appId} by ${userId}`;
    const prBody = `Adding review for ${appId}\n\nRating: ${'⭐'.repeat(body.rating)}\nComment: ${body.comment ?? '(no comment)'}`;
    const prUrl = `https://github.com/${owner}/${repo}/compare/${DEFAULT_BRANCH}...${userId}:ditto-market-review-${appId}-${Date.now()}?expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody)}`;

    return c.json({
      message: 'Please submit your review via GitHub PR',
      review,
      prUrl,
      instructions: `Fork the repo, add your review to data/reviews/${appId}.json, and submit a PR.`,
    });
  });

  router.post('/apps/:appId/install', async (c) => {
    const appId = c.req.param('appId');

    try {
      const manifest = await getAppManifest(appId);
      let downloadUrl = manifest.market?.downloadUrl;
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

  router.get('/installed', (c) => {
    const installedApps = cellManager.getInstalledApps();
    const result: InstalledAppInfo[] = [];

    for (const [appId, data] of installedApps) {
      result.push({
        appId,
        appName: data.manifest.name,
        icon: data.manifest.icon,
        installedVersion: data.manifest.version,
        installedAt: 0,
        hasUpdate: false,
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
