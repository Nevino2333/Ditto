# Ditto 部署指南

> 本文档说明 Ditto WebOS 的开发环境、生产环境部署方式，以及 PWA 离线支持、环境变量配置、性能优化与 Chrome 80 兼容性。

## 目录

- [开发环境部署](#开发环境部署)
- [生产环境部署](#生产环境部署)
  - [方式一：Docker Compose（推荐）](#方式一docker-compose推荐)
  - [方式二：手动部署](#方式二手动部署)
- [PWA 离线支持](#pwa-离线支持)
- [环境变量配置](#环境变量配置)
- [性能优化建议](#性能优化建议)
- [Chrome 80 兼容性说明](#chrome-80-兼容性说明)

## 开发环境部署

### 前置依赖

| 工具 | 版本 | 安装建议 |
|------|------|---------|
| Node.js | 20+ | 使用 [nvm](https://github.com/nvm-sh/nvm) 或 [fnm](https://github.com/Schniz/fnm) 管理 |
| pnpm | 9.15.0+ | `npm install -g pnpm@9` |
| Bun | 最新 | `curl -fsSL https://bun.sh/install \| bash`（Linux/macOS）或 PowerShell 安装 |
| Git | 任意 | 用于克隆仓库 |

### 步骤

1. **克隆仓库**：

```bash
git clone <repo-url> ditto
cd ditto
```

2. **安装依赖**（pnpm 会自动识别 workspace）：

```bash
pnpm install
```

3. **启动后端 server**（Bun 运行时，端口 3001）：

```bash
cd server
bun run --watch src/index.ts
```

启动成功会输出：

```
🦎 Ditto Server starting on port 3001...
🦎 Ditto Server running at http://localhost:3001
📡 WebSocket endpoint at ws://localhost:3001/ws
📦 Apps directory: /path/to/server/data/apps
```

4. **启动前端 shell**（Vite dev server，端口 3000，自动打开浏览器）：

```bash
cd apps/shell
pnpm dev
```

5. **访问应用**：浏览器打开 `http://localhost:3000`

### 开发模式特性

- **Vite HMR**：前端修改热重载，无需刷新
- **Bun --watch**：后端修改自动重启
- **API 代理**：`apps/shell/vite.config.ts` 已配置 `/api` 与 `/ws` 代理到 `http://localhost:3001`，无 CORS 问题
- **源码 alias**：Vite 配置了 `@ditto/*` alias 直接指向 `packages/*/src`，无需预构建

### 一键启动（turbo）

使用 turbo 并行启动所有 workspace 的 dev 任务：

```bash
pnpm dev
```

> **注意**：turbo 会同时启动多个 dev server，终端输出会混合。开发时建议分别启动 server 与 shell 以便调试。

### 测试与构建

```bash
# 运行全部测试
pnpm test

# 构建生产产物（按依赖拓扑顺序）
pnpm build

# 清理 dist 目录
pnpm clean
```

## 生产环境部署

### 方式一：Docker Compose（推荐）

源码已提供 `server/docker-compose.yml`，包含 server 与 web 两个服务。

**步骤**：

1. **构建前端**：

```bash
cd apps/shell
pnpm build
# 产物在 apps/shell/dist/
```

2. **启动 Docker Compose**：

```bash
cd server
docker-compose up -d
```

这会启动：

- **server** 服务：基于 `oven/bun:1` 镜像，运行 `bun run src/index.ts`，端口 3001
- **web** 服务：基于 `nginx:alpine`，托管 `apps/shell/dist` 静态文件，端口 80/443

3. **验证部署**：

```bash
# 健康检查
curl http://localhost/api/health

# 应返回类似：
# {"status":"ok","timestamp":...,"cells":{...},"resources":{...}}
```

4. **查看日志**：

```bash
docker-compose logs -f server
docker-compose logs -f web
```

### Dockerfile 说明

源码：`server/Dockerfile`

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY src/ ./src/
EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
```

- 基础镜像：`oven/bun:1`（官方 Bun 镜像）
- 仅安装生产依赖（`--production`）
- 数据卷 `ditto_data` 持久化 `server/data/`

### nginx 配置说明

源码：`server/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://server:3001;
        # ... 转发头
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://server:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;  # 长连接 24h
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**关键配置**：

- **SPA 回退**：`try_files` 确保前端路由正常工作
- **WebSocket 长连接**：`proxy_read_timeout 86400` 避免 60s 默认超时断开
- **静态资源 1 年缓存**：`immutable` 标记，配合文件哈希实现强缓存

### 方式二：手动部署

适用于不使用 Docker 的场景。

1. **构建前端**：

```bash
cd apps/shell
pnpm build
# 部署 apps/shell/dist 到任意静态文件服务器
```

2. **启动后端**：

```bash
cd server
bun run src/index.ts
```

3. **配置反向代理**（nginx 示例）：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/apps/shell/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

4. **使用 PM2 / systemd 管理进程**（推荐 systemd）：

```ini
# /etc/systemd/system/ditto-server.service
[Unit]
Description=Ditto WebOS Server
After=network.target

[Service]
Type=simple
User=ditto
WorkingDirectory=/opt/ditto/server
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ditto-server
sudo systemctl start ditto-server
```

### 应用数据目录

服务端启动时会自动创建 `data/apps/` 目录，用于存放应用包：

```
server/
└── data/
    └── apps/
        ├── com_ditto_calc/        # 应用 ID 中的 . 替换为 _
        │   ├── manifest.json
        │   ├── frontend/
        │   └── backend/
        └── ...
```

通过 `ditto install` 命令或手动放置应用包到该目录即可安装应用。

## PWA 离线支持

源码：`apps/shell/vite.config.ts`

Ditto shell 通过 `vite-plugin-pwa` 提供 PWA 支持，可独立安装到桌面/主屏幕，并支持离线访问。

### 配置

```typescript
VitePWA({
  registerType: 'autoUpdate',  // 自动更新 Service Worker
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },
  manifest: {
    name: 'Ditto WebOS',
    short_name: 'Ditto',
    description: '基于 Web 的操作系统框架',
    theme_color: '#3b82f6',
    background_color: '#0f172a',
    display: 'standalone',
    start_url: '/',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}),
```

### 离线行为

| 资源类型 | 缓存策略 | 离线可用 |
|---------|---------|---------|
| JS / CSS / HTML / SVG / WOFF2 | 预缓存（precache） | ✅ |
| Google Fonts | StaleWhileRevalidate | ✅（首次访问后） |
| API 请求 | 不缓存 | ❌ |
| 应用 iframe 内容 | 由 Service Worker 缓存（首次后） | ✅ |

### 安装到桌面

- **Chrome / Edge**：地址栏右侧安装图标 → Install
- **Safari（iOS）**：分享 → 添加到主屏幕
- **manifest 配置**：`display: 'standalone'` 让应用以独立窗口运行，无浏览器 UI

### Service Worker 更新

`registerType: 'autoUpdate'` 模式下：

1. 应用更新时，新版本 SW 会在后台下载资源
2. 下载完成后，下次刷新自动激活新版本
3. 也可通过 `navigator.serviceWorker.getRegistration()` 主动触发更新

## 环境变量配置

服务端支持以下环境变量：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `3001` | server 监听端口 |
| `NODE_ENV` | — | 环境标识（`production` / `development`） |
| `APPS_DIR` | `{cwd}/data/apps` | 应用数据目录 |
| `TEST_APPS_DIR` | `{cwd}/../test-apps` | 测试应用目录（市场发布用） |
| `MARKET_DATA_DIR` | — | 市场数据目录（覆盖默认） |
| `GITHUB_TOKEN` | — | GitHub token（市场从 GitHub 拉取应用时用） |

### 配置示例

**Docker Compose**：

```yaml
services:
  server:
    environment:
      - PORT=3001
      - NODE_ENV=production
      - APPS_DIR=/app/data/apps
      - GITHUB_TOKEN=ghp_xxxxx
```

**systemd**：

```ini
Environment=PORT=3001
Environment=NODE_ENV=production
Environment=APPS_DIR=/var/lib/ditto/apps
```

**直接运行**：

```bash
PORT=3001 NODE_ENV=production bun run src/index.ts
```

### 应用专属环境变量

应用的 `manifest.json` 中 `backend.env` 字段可注入应用专属环境变量：

```json
{
  "backend": {
    "entry": "backend/index.ts",
    "type": "cell",
    "env": {
      "DATABASE_URL": "file:///app/data/db",
      "LOG_LEVEL": "info"
    }
  }
}
```

这些变量通过 `CellContext.env` 注入到后端 Cell：

```typescript
async onInit(ctx: CellContext): Promise<void> {
  const dbUrl = ctx.env.DATABASE_URL;
  const logLevel = ctx.env.LOG_LEVEL;
}
```

## 性能优化建议

### 前端优化

1. **路由懒加载**：

```typescript
const routes = [
  { path: '/settings', component: () => import('./Settings.vue') },
  { path: '/market', component: () => import('./Market.vue') },
];
```

2. **Tree Shaking**：按需引入 UI 组件

```typescript
// ❌ 全量引入
import { DWindow, DDesktop, DTaskbar } from '@ditto/ui';

// ✅ 按需引入（构建工具自动 tree shake）
import { DWindow } from '@ditto/ui';
```

3. **静态资源缓存**：nginx 配置 `expires 1y` + `immutable`，配合 Vite 文件哈希实现强缓存

4. **PWA 预缓存**：Workbox 自动预缓存构建产物，二次访问离线可用

### 后端优化

1. **Cell 冬眠机制**：空闲 Cell 自动冬眠，释放内存

```typescript
// server 默认配置
hibernateAfterMs: 900000,  // 15 分钟空闲后冬眠
```

2. **资源配额限制**：防止单个应用耗尽资源

```typescript
// 默认配额
const DEFAULT_CELL_QUOTA = {
  memoryMB: 128,          // 单 Cell 最大内存
  cpuPercent: 10,         // CPU 占比
  maxConnections: 100,    // 最大连接数
  storageGB: 1,           // 存储上限
};

// 单用户限制
const DEFAULT_USER_LIMITS = {
  maxCells: 5,            // 最多 5 个 Cell
  maxMemoryMB: 640,       // 总内存 640MB
};
```

3. **流量整形**：TrafficShaper 支持按应用优先级调度

```typescript
// 降低低优先级应用带宽
trafficShaper.setAppPriority('com.ditto.low', 'low');
```

4. **共享副本**：多用户共享同一 Cell 实例（`replica: 'shared'`），减少内存占用

### 数据库优化

- VFS 基于 IndexedDB / OPFS，浏览器原生异步 I/O
- 后端 Cell 数据库默认内存存储，适合小数据量；大数据量建议接入外部数据库

## Chrome 80 兼容性说明

源码：`apps/shell/vite.config.ts`

Ditto 通过多种手段兼容 Chrome 80+（甚至 Chrome 78+）。

### 兼容目标

```typescript
legacy({
  targets: ['chrome >= 78', 'firefox >= 72', 'safari >= 13', 'edge >= 79'],
  additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
  modernPolyfills: true,
}),
```

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 78+ |
| Firefox | 72+ |
| Safari | 13+ |
| Edge | 79+ |

### 构建目标

```typescript
build: {
  target: 'es2015',         // ES2015 语法
  cssTarget: 'chrome78',    // CSS 兼容 Chrome 78
},
```

### 兼容策略

1. **@vitejs/plugin-legacy**：自动生成两份产物（modern + legacy），根据浏览器能力加载
   - Modern：原生 ES module
   - Legacy：SystemJS + regenerator-runtime，支持 async/await

2. **CSS 兼容**：
   - `cssTarget: 'chrome78'`：autoprefixer 自动添加 vendor prefix
   - **flex-gap polyfill**：`apps/shell/postcss-flex-gap-polyfill.mjs` 补丁 `gap` 属性（Chrome 80 以下不支持 flex gap）

3. **regenerator-runtime**：`additionalLegacyPolyfills` 注入，让 async/await 在 ES5 环境可用

4. **polyfill 自动检测**：`modernPolyfills: true` 检测缺失 API 自动 polyfill

### 已知限制

| 特性 | Chrome 80 支持 | 兼容方案 |
|------|--------------|---------|
| ES2020+ 语法（可选链 `?.`、空值合并 `??`） | ❌ | legacy 插件转译 |
| `gap` in flexbox | ⚠️（83+ 完整支持） | postcss polyfill |
| `Array.prototype.at()` | ❌ | modernPolyfills |
| `Object.hasOwn()` | ❌ | modernPolyfills |
| Top-level await | ❌ | 不使用 |
| Structured Clone | ✅ | 原生支持 |
| IndexedDB 2.0 | ✅ | 原生支持 |
| OPFS | ❌ | VFS 自动降级到 IndexedDB |
| CSS `aspect-ratio` | ❌ | 不使用，用 padding-bottom hack |
| WebSocket | ✅ | 原生支持 |

### 测试兼容性

使用 BrowserStack 或本地 Chrome 80 测试：

```bash
# 启动 Chrome 80（需要本地安装）
google-chrome --version=80.0.3987.0 --headless --disable-gpu --remote-debugging-port=9222

# 或使用 BrowserStack Automate
```

### 移动端兼容

- 触控事件：`useSwipe` / `useDrag` 使用 `touchstart` / `touchend`，Chrome 80 原生支持
- 响应式布局：基于 `window.innerWidth` 断点判断，不依赖 `matchMedia`（虽 80 支持）
- viewport meta：shell HTML 已包含 `<meta name="viewport" content="width=device-width, initial-scale=1">`

### 部署到内网

内网部署时，legacy 产物需要从 CDN 加载 polyfill。可改为本地托管：

```bash
# 下载 polyfill 到本地
wget https://unpkg.com/regenerator-runtime/runtime.js -O apps/shell/public/regenerator-runtime.js
```

修改 `vite.config.ts`：

```typescript
legacy({
  additionalLegacyPolyfills: ['/regenerator-runtime.js'],  // 本地路径
}),
```
