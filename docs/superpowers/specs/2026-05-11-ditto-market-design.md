# Ditto Market 应用市场系统设计文档

## 1. 概述

Ditto Market 是 Ditto WebOS 的内置应用市场，提供应用浏览、搜索、安装、评分评论、更新检测和开发者发布管理功能。数据源为 GitHub 仓库 `Nevino2233/Ditto_Market`，通过 Ditto Server 代理访问以解决网络稳定性问题。

## 2. 架构

```
┌──────────────────────────────────────────────────┐
│  Ditto Shell (Market.vue 内置应用)                │
│  ┌──────────┬───────────────────────────────────┐ │
│  │ 侧边栏    │  内容区                           │ │
│  │ 🏠 首页   │  搜索/分类/详情/评分/更新...       │ │
│  │ 📱 应用   │                                   │ │
│  │ 🎮 游戏   │                                   │ │
│  │ 🎨 主题   │                                   │ │
│  │ 📱 小组件  │                                   │ │
│  │ 📦 已安装  │                                   │ │
│  │ ⬆️ 更新   │                                   │ │
│  │ 📋 发布   │                                   │ │
│  └──────────┴───────────────────────────────────┘ │
└──────────────┬────────────────────────────────────┘
               │ HTTP API
┌──────────────▼────────────────────────────────────┐
│  Ditto Server (/api/market/*)                     │
│  - GitHub API 代理 + 内存缓存 (5min TTL)          │
│  - .dit 包下载代理 + 本地文件缓存                  │
│  - 评论/评分存储 (本地 JSON 文件)                   │
│  - 安装转发到 /api/apps/install-from-url           │
│  - 更新检测 (比对本地 vs 远程版本)                  │
└──────────────┬────────────────────────────────────┘
               │ GitHub REST API / Release Downloads
┌──────────────▼────────────────────────────────────┐
│  GitHub: Nevino2233/Ditto_Market                  │
│  /apps/{appId}/manifest.json                      │
│  /apps/{appId}/screenshots/                       │
│  /apps/{appId}/changelog.md                       │
│  /data/categories.json                            │
│  /data/featured.json                              │
│  /data/reviews/{appId}.json                       │
│  /releases/download/{tag}/{appId}.dit             │
└───────────────────────────────────────────────────┘
```

## 3. GitHub 仓库数据结构

```
Ditto_Market/
├── apps/
│   └── {appId}/                    # 反域名格式，如 com.example.myapp
│       ├── manifest.json           # 应用清单
│       ├── screenshots/            # 截图 (最多 8 张)
│       │   ├── 01.png
│       │   └── 02.png
│       └── changelog.md            # 版本变更日志
├── data/
│   ├── categories.json             # 分类定义
│   ├── featured.json               # 首页推荐配置
│   └── reviews/
│       └── {appId}.json            # 评论数据
├── scripts/
│   └── validate-pr.js              # PR 自动验证
└── README.md                       # 贡献指南
```

### 3.1 manifest.json 扩展

在现有 `AppManifest` 基础上增加 `market` 字段：

```typescript
interface MarketMeta {
  summary: string;              // 一句话描述
  description: string;          // 详细描述 (Markdown)
  category: string;             // 分类 ID
  tags: string[];               // 标签
  screenshots: string[];        // 截图相对路径
  changelog: string;            // 变更日志相对路径
  downloadUrl: string;          // GitHub Release 下载链接
  publisher: string;            // 开发者名称
  homepage?: string;            // 主页
  sourceUrl?: string;           // 源码链接
}
```

### 3.2 reviews/{appId}.json

```typescript
interface Review {
  userId: string;               // github:username 格式
  rating: number;               // 1-5
  comment: string;              // 评论文本
  version: string;              // 评论时的版本
  createdAt: string;            // ISO 8601
}
```

### 3.3 categories.json

```typescript
interface Category {
  id: string;
  name: string;
  icon: string;                 // emoji
  description?: string;
}
```

预定义分类：效率工具、社交、娱乐、开发工具、主题、小组件、教育、系统工具。

### 3.4 featured.json

```typescript
interface FeaturedConfig {
  banner: {
    appId: string;
    image: string;              // 横幅图相对路径
    title: string;
    subtitle: string;
  }[];
  editorsChoice: string[];      // appId 列表
  newApps: string[];            // 新上架
  topRated: string[];           // 最高评分
}
```

## 4. Server API 设计

### 4.1 Market 路由 (`/api/market/*`)

| 方法   | 路径                                        | 说明                                     |
| ---- | ----------------------------------------- | -------------------------------------- |
| GET  | /api/market/apps                          | 应用列表（支持 ?category=\&search=\&sort= 分页） |
| GET  | /api/market/apps/:appId                   | 应用详情（含评分统计、评论摘要）                       |
| GET  | /api/market/apps/:appId/screenshots/:name | 截图代理                                   |
| GET  | /api/market/apps/:appId/changelog         | 变更日志                                   |
| GET  | /api/market/categories                    | 分类列表                                   |
| GET  | /api/market/featured                      | 首页推荐                                   |
| GET  | /api/market/apps/:appId/reviews           | 评论列表                                   |
| POST | /api/market/apps/:appId/reviews           | 提交评论（需认证）                              |
| POST | /api/market/apps/:appId/install           | 安装应用（下载 .dit 并转发到 install API）         |
| GET  | /api/market/updates                       | 检测已安装应用的更新                             |
| GET  | /api/market/installed                     | 已安装应用列表（含市场元数据）                        |

### 4.2 缓存策略

- GitHub API 响应：内存缓存，TTL 5 分钟
- .dit 包文件：本地文件缓存 `data/cache/dit/{appId}-{version}.dit`，不设过期
- 截图：内存缓存 + ETag 支持，TTL 30 分钟
- 评论数据：内存缓存，TTL 2 分钟（评论更新频率低）

### 4.3 安装流程

```
用户点击"安装" → POST /api/market/apps/:appId/install
  → Server 检查本地缓存是否有 .dit 包
    → 有：直接使用缓存
    → 无：从 GitHub Release 下载 → 存入缓存
  → 调用 Packager.validate() 验证包
  → 调用内部 install 流程（复用 app-install 逻辑）
  → 返回安装结果
```

### 4.4 更新检测

```
GET /api/market/updates
  → 获取本地已安装应用列表
  → 遍历每个应用，从 GitHub 获取最新 manifest.json
  → 比对 version (semver)
  → 返回有更新的应用列表
```

## 5. 前端设计

### 5.1 页面结构

Market.vue 作为 Ditto Shell 的内置应用，在 DWindow 中运行。采用侧边栏 + 内容区布局。

#### 侧边栏导航项

| 图标     | 名称  | 视图                       |
| ------ | --- | ------------------------ |
| 🏠     | 首页  | 推荐横幅 + 编辑精选 + 新上架 + 最高评分 |
| 📱     | 应用  | 全部应用列表，支持分类筛选            |
| <br /> | 插件  | 插件分类快捷入口                 |
| 🎨     | 主题  | 主题分类快捷入口                 |
| 📱     | 小组件 | 小组件分类快捷入口                |
| 📦     | 已安装 | 本地已安装应用管理                |
| ⬆️     | 更新  | 有可用更新的应用                 |
| 📋     | 发布  | 开发者发布指南                  |

#### 内容区视图

**首页视图：**

- 顶部搜索栏
- 轮播横幅 (featured.banner)
- 编辑精选卡片行 (featured.editorsChoice)
- 新上架卡片行 (featured.newApps)
- 最高评分卡片行 (featured.topRated)

**应用列表视图：**

- 搜索栏 + 排序 (最新/最热/评分)
- 分类标签过滤
- 应用卡片网格 (3-4 列)

**应用详情视图：**

- 返回按钮
- 应用图标 + 名称 + 开发者 + 评分
- 安装/打开/更新按钮
- 截图轮播
- 描述 (Markdown 渲染)
- 评论列表 + 评分分布图
- 版本历史

**已安装视图：**

- 已安装应用列表
- 每项显示：图标 + 名称 + 版本 + 大小
- 操作：打开/卸载/检查更新

**更新视图：**

- 有更新的应用列表
- 每项显示：图标 + 名称 + 当前版本 → 新版本
- 操作：更新/全部更新

### 5.2 需要新增的 UI 组件

当前 Ditto UI 组件库缺少基础交互组件，需要新增：

| 组件           | 用途                  |
| ------------ | ------------------- |
| MCard        | 应用卡片（图标+名称+评分+安装按钮） |
| MSearchBar   | 搜索输入框               |
| MRating      | 星级评分显示/输入           |
| MScreenshot  | 截图轮播                |
| MReviewItem  | 评论条目                |
| MTag         | 分类标签                |
| MButton      | 通用按钮                |
| MBadge       | 徽标（新/更新/已安装）        |
| MBanner      | 首页轮播横幅              |
| MEmpty       | 空状态占位               |
| MLoading     | 加载状态                |
| MProgressBar | 下载/安装进度条            |

这些组件以 `M` 前缀命名，放在 `packages/ui/src/components/Market/` 目录下，仅 Market 应用使用，不污染通用组件库。

### 5.3 状态管理

新增 Pinia Store: `useMarketStore`

```typescript
interface MarketState {
  categories: Category[];
  featured: FeaturedConfig | null;
  apps: Map<string, AppStoreEntry>;      // 缓存的应用详情
  searchQuery: string;
  selectedCategory: string | null;
  currentView: 'home' | 'apps' | 'detail' | 'installed' | 'updates' | 'publish';
  selectedAppId: string | null;
  installedApps: Map<string, InstalledAppInfo>;
  updatesAvailable: UpdateInfo[];
  loading: boolean;
  error: string | null;
}
```

## 6. 类型扩展

在 `packages/shared/src/types.ts` 中扩展：

**MarketMeta** — manifest.json 中的 market 字段（见 3.1 节）。

**AppStoreEntry** — 替换现有空壳定义，完整实现：

```typescript
interface AppStoreEntry {
  id: string;
  manifest: AppManifest;
  market: MarketMeta;             // 从 manifest.json 的 market 字段读取
  rating: number;                 // 平均评分（从 reviews 计算）
  ratingCount: number;            // 评分人数
  downloads: number;              // 下载次数（从 Release assets 统计）
  verified: boolean;              // 是否经过管理员审核
  publishedAt: number;            // 首次发布时间（manifest.json 提交时间）
  updatedAt: number;              // 最后更新时间（manifest.json 最后修改时间）
}
```

注意：`screenshots`、`changelog`、`publisher`、`category` 等字段统一放在 `MarketMeta` 中，`AppStoreEntry` 通过 `market` 字段引用，不重复定义。

**InstalledAppInfo** — 本地已安装应用信息：

```typescript
interface InstalledAppInfo {
  appId: string;
  appName: string;
  icon?: string;
  installedVersion: string;
  installedAt: number;
  hasUpdate: boolean;
  latestVersion?: string;
  latestDownloadUrl?: string;
}
```

**UpdateInfo** — 更新信息：

```typescript
interface UpdateInfo {
  appId: string;
  appName: string;
  icon?: string;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  downloadUrl: string;
}
```

**评论存储策略**：评论数据存储在 GitHub 仓库的 `data/reviews/{appId}.json` 中，通过 PR 更新。Ditto Server 代理读取时缓存 2 分钟。提交评论时，Server 生成评论数据并提示用户通过 GitHub PR 提交（提供预填充的 PR 链接），不自动写入仓库。

## 7. 发布流程

1. 开发者 Fork `Nevino2233/Ditto_Market`
2. 在 `apps/` 下创建应用目录，添加 manifest.json 和截图
3. 在 GitHub 创建 Release，上传 .dit 包
4. 提交 PR
5. 仓库管理员审核：
   - 验证 manifest.json 格式
   - 验证 .dit 包（Packager.validate）
   - 检查截图质量
   - 检查是否有恶意权限请求
6. 合并 PR，市场自动更新（缓存 TTL 过期后）

## 8. 错误处理

| 场景             | 处理方式                     |
| -------------- | ------------------------ |
| GitHub API 不可达 | 返回缓存数据 + 提示"数据可能不是最新"    |
| .dit 包下载失败     | 重试 3 次，仍失败则返回错误 + 提示稍后重试 |
| 安装验证失败         | 返回具体验证错误，不执行安装           |
| 应用已安装          | 显示"打开"按钮而非"安装"按钮         |
| 评论提交失败         | 本地暂存，提示用户稍后重试            |
| 搜索无结果          | 显示空状态 + 推荐热门应用           |

## 9. 安全考虑

- Server 代理 GitHub API，前端不直接暴露 GitHub Token
- .dit 包安装前必须通过 Packager.validate() 验证
- 评论提交需要认证（X-User-Id 或 Authorization）
- 评分限制每用户每个应用只能评一次
- 搜索输入做 XSS 过滤
- manifest.json 中的 downloadUrl 必须指向 github.com 域名

