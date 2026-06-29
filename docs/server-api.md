# Ditto Server HTTP API

Ditto WebOS 服务端 HTTP + WebSocket 接口文档，覆盖应用安装、注册表、市场、认证、管理、代理、虚拟文件系统与应用 Cell 后端等全部路由。

## 基础信息

| 项目 | 值 |
| --- | --- |
| Base URL | `http://localhost:<port>` |
| 默认端口 | `3001`（可通过环境变量 `PORT` 覆盖） |
| WebSocket | `ws://localhost:<port>/ws` |
| 默认 Content-Type | `application/json`（除文件上传/下载、VFS 写入、市场包下载等明确说明外） |
| CORS | 默认 `origin: '*'`；生产环境通过 `DITTO_CORS_ORIGIN` 配置白名单（逗号分隔） |
| 允许方法 | `GET` / `POST` / `PUT` / `DELETE` / `OPTIONS` |
| 允许请求头 | `Content-Type`、`Authorization`、`X-User-Id`、`X-Filename`、`X-Decrypt-Password` |
| 暴露响应头 | `X-RateLimit-Limit`、`X-Quota-Usage`、`Retry-After` |

应用安装目录由 `APPS_DIR` 控制，默认 `data/apps`；市场测试应用目录由 `TEST_APPS_DIR` 控制。

## 认证机制

服务端使用两种并行的认证方式：

- **Bearer Token**：登录/注册成功后返回 `token`，后续请求通过 `Authorization: Bearer <token>` 携带，用于 `/api/auth/me`、`/api/auth/profile` 等。
- **Session**：登录/注册返回 `sessionId`，通过 `X-Session-Id` 请求头携带；会话有效期 24 小时，每用户最多 5 个并发会话，超出会挤掉最旧会话。
- **轻量用户标识**：部分端点（市场评论、Cell 启动）通过 `X-User-Id` 请求头识别用户，用于配额与限流统计。

Token 为 base64url 编码的 JSON，包含 `userId`、`iat`、`rnd`，服务端通过 `AuthService.verifyToken` 校验。

## 根路径与健康检查

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/` | 返回服务名、版本与端点索引 | 否 |
| GET | `/api/health` | 健康检查：Cell 数量、运行/休眠统计、系统资源 | 否 |

## 应用安装与管理（/api/apps）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | `/api/apps/install` | 上传并安装 `.dit/.ditx/.ditc/.ditz` 包 | 否 |
| DELETE | `/api/apps/uninstall/:appId` | 卸载应用并删除目录 | 否 |
| GET | `/api/apps/list` | 列出已安装应用 | 否 |
| GET | `/api/apps/:appId/info` | 应用详情及运行/休眠 Cell 数 | 否 |
| GET | `/api/apps/:appId/frontend/*` | 提供前端静态资源（HTML 注入 polyfill） | 否 |
| GET | `/api/apps/:appId/tokens/*` | 提供 tokens 目录下的 JSON 文件 | 否 |

`POST /api/apps/install` 请求体为二进制包内容，相关请求头：

- `X-Filename`：包文件名（默认 `app.dit`）
- `X-Decrypt-Password`：可选，加密包的解密口令

成功响应：

```json
{
  "success": true,
  "id": "com.ditto.notes",
  "name": "Ditto Notes",
  "version": "0.1.0",
  "type": "app",
  "hasBackend": false,
  "hasEncryption": false,
  "hasSignature": false
}
```

## 应用注册表（/api/app-registry）

轻量级应用注册表，用于登记外部 entry URL 应用。

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/app-registry/` | 列出所有已注册应用 | 否 |
| POST | `/api/app-registry/register` | 注册应用 | 否 |
| DELETE | `/api/app-registry/:id` | 注销应用 | 否 |

`POST /register` 请求体：

```json
{ "id": "com.example.app", "name": "Example", "version": "1.0.0", "entryUrl": "https://example.com/index.html", "iconUrl": "", "description": "" }
```

`id`、`name`、`entryUrl` 为必填。

## 应用市场（/api/market）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/market/packages/:filename` | 下载市场包（`application/octet-stream`） | 否 |
| GET | `/api/market/categories` | 获取分类列表 | 否 |
| GET | `/api/market/featured` | 获取推荐位（banner / editorsChoice / newApps / topRated） | 否 |
| GET | `/api/market/apps` | 浏览市场应用 | 否 |
| GET | `/api/market/apps/:appId` | 应用详情（含评论） | 否 |
| GET | `/api/market/apps/:appId/screenshots/:name` | 截图文件 | 否 |
| GET | `/api/market/apps/:appId/changelog` | 更新日志（`text/markdown`） | 否 |
| GET | `/api/market/apps/:appId/reviews` | 评论列表 | 否 |
| POST | `/api/market/apps/:appId/reviews` | 提交评论（返回 PR 链接，需人工合并） | `X-User-Id` |
| POST | `/api/market/apps/:appId/install` | 从市场下载并安装 | 否 |
| GET | `/api/market/updates` | 检查已安装应用的更新 | 否 |
| GET | `/api/market/installed` | 以市场视角列出已安装应用 | 否 |

`GET /apps` 查询参数：

- `category`：按分类过滤
- `search`：在名称、摘要、标签中搜索
- `sort`：`newest`（默认）/ `rating` / `downloads`

数据源优先级：本地 `MARKET_DATA_DIR` → `TEST_APPS_DIR` → 内置 demo 数据 → GitHub 仓库 `Nevino2233/Ditto_Market`（可用时）。市场数据缓存 5 分钟，评论缓存 2 分钟。

`POST /apps/:appId/reviews` 请求体：`{ "rating": 1-5, "comment": "..." }`，同一用户对同一应用仅能评论一次（409）。

## 认证（/api/auth）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 注册并返回 user/token/sessionId | 否 |
| POST | `/api/auth/login` | 登录并返回 user/token/sessionId | 否 |
| POST | `/api/auth/logout` | 注销会话（`X-Session-Id`） | 否 |
| GET | `/api/auth/me` | 获取当前用户 | `Authorization: Bearer` |
| PUT | `/api/auth/profile` | 更新用户资料（username/email/avatar） | `Authorization: Bearer` |

`POST /register` 请求体：`{ "username": "...", "email": "...", "password": "..." }`（用户名 ≥3 字符、密码 ≥6 字符、email 含 `@`）。

`POST /login` 请求体：`{ "username": "...", "password": "..." }`。

## 管理（/api/admin）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/admin/cells` | 全部 Cell 列表与统计 | 否 |
| POST | `/api/admin/cells/:cellId/start` | 唤醒指定 Cell | 否 |
| POST | `/api/admin/cells/:cellId/stop` | 停止并销毁 Cell | 否 |
| POST | `/api/admin/cells/:cellId/hibernate` | 休眠 Cell | 否 |
| GET | `/api/admin/cells/:cellId` | Cell 详情（含内存/CPU/请求数） | 否 |
| GET | `/api/admin/cells/:cellId/metrics` | Cell 指标（含 customMetrics） | 否 |
| GET | `/api/admin/metrics` | 系统整体指标（Cell、资源、流量、弹性扩缩） | 否 |
| GET | `/api/admin/quotas` | 所有配额记录 | 否 |
| PUT | `/api/admin/quotas/app/:appId` | 设置应用配额 | 否 |
| PUT | `/api/admin/quotas/user/:userId` | 设置用户限额 | 否 |
| GET | `/api/admin/installed-apps` | 已安装应用及 Cell 统计 | 否 |
| GET | `/api/admin/traffic` | 流量整形统计 | 否 |
| PUT | `/api/admin/traffic/:appId/priority` | 设置应用优先级（`system`/`high`/`normal`/`low`） | 否 |
| GET | `/api/admin/scaler/config` | 弹性扩缩配置 | 否 |
| PUT | `/api/admin/scaler/config` | 更新弹性扩缩配置 | 否 |
| GET | `/api/admin/scaler/load` | 整体 CPU/内存/负载信息 | 否 |

> 注：当前代码未对 admin 路由强制鉴权，生产部署建议在前置网关层加权限校验。

## 网络代理（/api/proxy）

通用 HTTP 代理，受域名黑白名单与体积上限约束。

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | `/api/proxy/fetch` | 代理转发请求 | 否 |
| GET | `/api/proxy/cache/stats` | 缓存条目数与总大小 | 否 |
| DELETE | `/api/proxy/cache` | 清空缓存 | 否 |
| GET | `/api/proxy/rules` | 查看代理规则 | 否 |
| PUT | `/api/proxy/rules` | 更新代理规则 | 否 |

`POST /fetch` 请求头：

- `X-Proxy-Target`（必填）：目标 URL
- `X-Proxy-Method`：HTTP 方法（默认 `GET`）
- 转发 `Authorization`、`Accept`、`Accept-Language`、`Content-Type`
- 请求体可选 `{ "body": "..." }`（非 GET/HEAD 时）

默认规则：屏蔽 `localhost` / `127.0.0.1` / `0.0.0.0` / `::1`；最大响应体 50 MB；超时 30 s；启用缓存（按 `Cache-Control: max-age` 失效，最多 500 条）。响应头会附加 `X-Proxy-Status`、`X-Proxy-StatusText`、`X-Proxy-Cached` 等。

## 虚拟文件系统（/api/vfs）

基于内存 Map 的简易 VFS，路径作为路由尾部通配传入。

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/vfs/ls/*` | 列出指定目录下的直接子项 | 否 |
| GET | `/api/vfs/read/*` | 读取文件原始字节 | 否 |
| PUT | `/api/vfs/write/*` | 写入文件（请求体为二进制） | 否 |
| DELETE | `/api/vfs/delete/*` | 删除文件 | 否 |
| POST | `/api/vfs/mkdir/*` | 创建目录记录 | 否 |

`GET /ls` 返回数组：`[{ "name", "path", "type", "size", "modifiedAt" }]`。

## 应用 Cell 后端（/api/cell）

应用隔离运行单元（Cell）的管理与代理入口。整段 `/api/cell/*` 经过 `createResourceFabricMiddleware` 中间件，按 `appId` + `X-User-Id` 进行限流与配额统计。

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/cell/health` | Cell 子系统健康检查 | 否 |
| GET | `/api/cell/membrane/:appId` | 应用 CellMembrane 统计 | 否 |
| GET | `/api/cell/:appId/health` | 指定应用的 Cell 状态 | 否 |
| POST | `/api/cell/:appId/start` | 为当前用户启动 Cell | `Authorization` 或 `X-User-Id` |
| POST | `/api/cell/:appId/stop` | 停止当前用户的 Cell | `Authorization` 或 `X-User-Id` |
| GET | `/api/cell/:appId/status` | 应用所有 Cell 状态 | 否 |
| POST | `/api/cell/:appId/hibernate` | 休眠应用所有 Cell | 否 |
| POST | `/api/cell/:appId/wake` | 唤醒应用所有休眠 Cell | 否 |
| ALL | `/api/cell/:appId/proxy/*` | 转发到应用后端 Cell 路由 | `Authorization` 或 `X-User-Id` |

`POST /:appId/start` 会先做配额检查（`quotaManager.checkQuota`），通过后分配配额、注册流量整形与弹性扩缩，再启动 Cell；启动失败会回滚配额。

`ALL /:appId/proxy/*` 是应用级 API 入口：先校验用户、限流（`trafficShaper.checkRate`，超限返回 429），再将请求路径匹配到 Cell 内部路由并调用其 handler。响应由 Cell 自行决定。若没有运行中的 Cell，返回 503 并提示先调用 `POST /api/cell/:appId/start`。

## WebSocket 端点（/ws）

连接 URL：`ws://localhost:<port>/ws`（需 `Upgrade: websocket` 头）。所有消息均为 JSON 文本。

### 客户端 → 服务端

| `type` | 字段 | 说明 |
| --- | --- | --- |
| `auth` | `userId`、`appId?` | 鉴权并绑定客户端；若携带 `appId`，将客户端注册到该应用运行中 Cell 的 IPC 桥 |
| `join` | `channel` | 加入频道 |
| `leave` | `channel` | 离开频道 |
| `cell-ipc` | `appId`、`channel`、`payload`、`target?` | 应用间 IPC：`target` 省略或 `host` 时投递到宿主 Cell，否则投递到目标 appId 的运行中 Cell |
| `chat` | `channel`、`content` | 向频道广播聊天消息 |

### 服务端 → 客户端

| `type` | 字段 | 说明 |
| --- | --- | --- |
| `auth_ok` | `clientId` | 鉴权成功 |
| `joined` | `channel` | 加入频道确认 |
| `cell-ipc-sent` | `appId`、`channel` | IPC 消息已投递 |
| `chat` | `message`（含 `id`/`userId`/`content`/`timestamp`/`channel`） | 频道广播的聊天消息 |
| `chat_sent` | `messageId` | 自身聊天消息已发送 |

频道为任意字符串，由 `join`/`leave` 动态管理；服务端不预置固定频道列表。

## 错误响应格式

错误响应统一为 JSON，至少包含 `error` 字段，HTTP 状态码体现在响应行：

```json
{ "error": "App not found" }
```

部分端点会附加上下文字段，例如：

```json
{ "error": "Too many requests", "retryAfterMs": 1200, "appId": "com.ditto.notes" }
```

```json
{ "error": "Resource quota exceeded", "appId": "com.ditto.notes", "usagePercent": 105 }
```

常见状态码：`400`（参数/包无效）、`401`（未认证）、`403`（代理域名禁止）、`404`（资源不存在）、`409`（评论冲突）、`429`（限流/超配额）、`500`（服务端异常）、`502`（上游/下载失败）、`503`（Cell 不可用或流量整形器未启用）。

## 资源配额与限流

`/api/cell/*` 全量经过资源织造中间件，行为如下：

1. 若请求路径含 `appId`，先调用 `trafficShaper.checkRate(appId)`：
   - 超限时返回 `429`，并设置响应头 `Retry-After`（秒）与 `X-RateLimit-Limit`。
2. 若同时存在 `userId`（来自 `c.get('userId')` 或 `X-User-Id`）：
   - 检查 `quotaManager.isOverQuota(appId, userId)`，超配额时返回 `429` 并设置 `X-Quota-Usage`（百分比整数）。
   - 通过则 `quotaManager.recordRequest(appId, userId)` 记录一次请求。
3. 下游处理完成后调用 `quotaManager.releaseConnection(appId, userId)` 释放连接计数。

应用级代理 `POST /api/cell/:appId/proxy/*` 还会在 Cell 路由匹配前再做一次 `trafficShaper.checkRate`，返回 `429` 时附带 `retryAfterMs`。

相关响应头（已在 CORS `exposeHeaders` 中暴露）：

- `X-RateLimit-Limit`：应用每秒最大请求数
- `X-Quota-Usage`：当前用户对该应用的配额使用百分比
- `Retry-After`：限流后的建议重试秒数

## 示例

安装一个 `.dit` 应用包：

```bash
curl -X POST http://localhost:3001/api/apps/install \
  -H "Content-Type: application/octet-stream" \
  -H "X-Filename: com.ditto.notes-0.1.0.dit" \
  --data-binary @com.ditto.notes-0.1.0.dit
```

登录并保存 Token：

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
```

为用户启动应用 Cell（带 X-User-Id）：

```bash
curl -X POST http://localhost:3001/api/cell/com.ditto.notes/start \
  -H "X-User-Id: alice"
```

通过 Cell 代理调用应用后端 API：

```bash
curl -X POST http://localhost:3001/api/cell/com.ditto.notes/proxy/notes \
  -H "Content-Type: application/json" \
  -H "X-User-Id: alice" \
  -d '{"title":"Hello","body":"World"}'
```

查看系统指标：

```bash
curl http://localhost:3001/api/admin/metrics
```
