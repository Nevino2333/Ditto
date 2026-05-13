export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  icon?: string;
  position: Position;
  size: Size;
  minSize: Size;
  state: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
  zIndex: number;
  resizable: boolean;
  maximizable: boolean;
}

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  entry: string;
  category?: string;
  sandbox: 'strict' | 'trusted';
  permissions: string[];
  window: {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    resizable?: boolean;
    maximizable?: boolean;
    titlebar?: boolean;
  };
  dependencies?: Record<string, string>;
  i18n?: {
    default: string;
    supported: string[];
  };
  backend?: {
    entry: string;
    type: 'cell';
    port?: number;
    healthCheck?: string;
    env?: Record<string, string>;
  };
  type?: 'app' | 'widget' | 'plugin' | 'theme';
  signature?: {
    algorithm: string;
    value: string;
    publicKey: string;
  };
  encryption?: {
    algorithm: 'aes-256-gcm';
    keyDerivation: 'pbkdf2';
    iterations: number;
    salt: string;
  };
  minDittoVersion?: string;
}

export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error';
  channel: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
  requestId?: string;
}

export type IPCChannel =
  | 'system://window/open'
  | 'system://window/close'
  | 'system://window/focus'
  | 'system://notification'
  | 'fs://read'
  | 'fs://write'
  | 'fs://watch'
  | 'clipboard://read'
  | 'clipboard://write'
  | 'app://message'
  | 'net://request'
  | 'auth://status'
  | 'rtc://signal';

export interface VFSProvider {
  scheme: string;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  ls(path: string): Promise<VFSEntry[]>;
  stat(path: string): Promise<VFSStats>;
  watch(path: string, callback: VFSCallback): () => void;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface VFSEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: number;
  createdAt: number;
}

export interface VFSStats {
  size: number;
  type: 'file' | 'directory';
  modifiedAt: number;
  createdAt: number;
}

export type VFSCallback = (event: VFSEvent) => void;

export interface VFSEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export type Permission =
  | { name: 'fs.read'; params: { paths: string[] } }
  | { name: 'fs.write'; params: { paths: string[] } }
  | { name: 'net.request'; params: { origins: string[] } }
  | { name: 'notification.send'; params: Record<string, never> }
  | { name: 'clipboard.read'; params: Record<string, never> }
  | { name: 'clipboard.write'; params: Record<string, never> }
  | { name: 'geolocation'; params: Record<string, never> }
  | { name: 'camera'; params: Record<string, never> }
  | { name: 'microphone'; params: Record<string, never> }
  | { name: 'window.manage'; params: Record<string, never> };

export type PermissionStatus = 'granted' | 'denied' | 'prompt';

export interface ThemeTokens {
  color: {
    primary: Record<string, string>;
    surface: Record<string, string>;
    text: Record<string, string>;
    border: Record<string, string>;
    semantic: Record<string, string>;
    window: Record<string, string>;
  };
  space: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  motion: {
    duration: Record<string, string>;
    easing: Record<string, string>;
  };
}

export interface Theme {
  id: string;
  name: string;
  colorScheme: 'light' | 'dark';
  tokens: ThemeTokens;
}

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';
export type LayoutMode = 'floating' | 'tiling' | 'snap' | 'mobile';

export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetManifest {
  id: string;
  appId?: string;
  name: string;
  description?: string;
  icon?: string;
  entry: string;
  size: WidgetSize;
  minWidth: number;
  minHeight: number;
  refreshInterval?: number;
  permissions?: string[];
  preview?: string;
  type?: 'widget';
  signature?: AppManifest['signature'];
  encryption?: AppManifest['encryption'];
  minDittoVersion?: string;
}

export interface WidgetInstance {
  id: string;
  widgetId: string;
  appId?: string;
  manifest: WidgetManifest;
  position: Position;
  size: WidgetSize;
  status: 'loading' | 'running' | 'error' | 'stopped';
  lastUpdated?: number;
  error?: Error;
}

export interface IslandSlot {
  id: string;
  appId: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  content: string;
  icon?: string;
  actions?: { label: string; action: string }[];
  expandable: boolean;
  expanded?: boolean;
}

export interface ResourceEntry {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'link';
  path: string;
  size: number;
  mimeType?: string;
  modifiedAt: number;
  createdAt: number;
  ownerId: string;
  isPublic: boolean;
  tags?: string[];
}

export interface MarketMeta {
  summary: string;
  description: string;
  category: string;
  tags: string[];
  screenshots: string[];
  changelog: string;
  downloadUrl: string;
  publisher: string;
  homepage?: string;
  sourceUrl?: string;
}

export interface AppStoreEntry {
  id: string;
  manifest: AppManifest;
  market: MarketMeta;
  rating: number;
  ratingCount: number;
  downloads: number;
  verified: boolean;
  publishedAt: number;
  updatedAt: number;
}

export interface MarketCategory {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

export interface MarketFeatured {
  banner: {
    appId: string;
    image: string;
    title: string;
    subtitle: string;
  }[];
  editorsChoice: string[];
  newApps: string[];
  topRated: string[];
}

export interface MarketReview {
  userId: string;
  rating: number;
  comment: string;
  version: string;
  createdAt: string;
}

export interface InstalledAppInfo {
  appId: string;
  appName: string;
  icon?: string;
  installedVersion: string;
  installedAt: number;
  hasUpdate: boolean;
  latestVersion?: string;
  latestDownloadUrl?: string;
}

export interface UpdateInfo {
  appId: string;
  appName: string;
  icon?: string;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  downloadUrl: string;
}

export interface AppCellModule {
  onInit?(ctx: CellContext): Promise<void>;
  onStart?(ctx: CellContext): Promise<void>;
  onStop?(ctx: CellContext): Promise<void>;
  onDestroy?(ctx: CellContext): Promise<void>;
  registerRoutes(router: CellRouter): void;
  registerWebSocket?(ws: CellWebSocketHandler): void;
}

export interface CellContext {
  appId: string;
  cellId: string;
  config: Record<string, unknown>;
  env: Record<string, string>;
  db: CellDatabase;
  storage: CellStorage;
  ipc: CellIPC;
  logger: CellLogger;
  metrics: CellMetrics;
}

export interface CellRouter {
  get(path: string, handler: CellRouteHandler): void;
  post(path: string, handler: CellRouteHandler): void;
  put(path: string, handler: CellRouteHandler): void;
  delete(path: string, handler: CellRouteHandler): void;
  ws(path: string, handler: CellWSHandler): void;
  middleware(fn: CellMiddleware): void;
}

export interface CellRouteHandler {
  (req: CellRequest, res: CellResponse): Promise<void>;
}

export interface CellWSHandler {
  (ws: CellWebSocket, req: CellRequest): void;
}

export interface CellMiddleware {
  (req: CellRequest, res: CellResponse, next: () => Promise<void>): Promise<void>;
}

export interface CellRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  userId?: string;
}

export interface CellResponse {
  status(code: number): CellResponse;
  json(data: unknown): void;
  text(data: string): void;
  binary(data: Uint8Array): void;
}

export interface CellWebSocket {
  send(data: string): void;
  close(): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: () => void): void;
}

export interface CellWebSocketHandler {
  (ws: CellWebSocket): void;
}

export interface CellDatabase {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface CellStorage {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface CellIPC {
  send(channel: string, payload: unknown, target?: string): void;
  onMessage(channel: string, handler: (payload: unknown) => void): () => void;
}

export interface CellLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface CellMetrics {
  increment(name: string, value?: number): void;
  gauge(name: string, value: number): void;
  timing(name: string, durationMs: number): void;
}

export interface CellInstance {
  cellId: string;
  appId: string;
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'hibernating' | 'hibernated' | 'waking' | 'error';
  startedAt?: number;
  lastActivityAt?: number;
  memoryUsage?: number;
  error?: Error;
  replica: 'shared' | 'exclusive';
  userIds: string[];
}

export interface ResourceQuota {
  memoryMB: number;
  cpuPercent: number;
  maxConnections: number;
  storageGB: number;
}

export interface UserResourceUsage {
  userId: string;
  totalCells: number;
  totalMemoryMB: number;
  totalCpuPercent: number;
  maxCells: number;
  maxMemoryMB: number;
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  colorScheme: 'light' | 'dark';
  tokens: ThemeTokens;
  type: 'theme';
  signature?: AppManifest['signature'];
  encryption?: AppManifest['encryption'];
  minDittoVersion?: string;
}

export interface PackOptions {
  type: 'app' | 'widget' | 'plugin' | 'theme';
  manifest: AppManifest;
  frontendDir: string;
  backendDir?: string;
  iconPath?: string;
  outputPath?: string;
  encrypt?: { password: string; algorithm: 'aes-256-gcm' };
  sign?: { privateKeyPath: string; algorithm: 'ed25519' };
}

export interface UnpackResult {
  manifest: AppManifest;
  type: 'app' | 'widget' | 'plugin' | 'theme';
  frontendDir: string;
  backendDir?: string;
  iconPath?: string;
  hasBackend: boolean;
  hasEncryption: boolean;
  hasSignature: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface VerifyResult {
  verified: boolean;
  signer?: string;
  algorithm?: string;
  error?: string;
}

export interface DitAppConfig {
  type: 'dit';
  archiveUrl: string;
  origin?: string;
}
