import type { IPCMessage } from '@ditto/shared';

type MessageHandler = (message: IPCMessage) => void;
type DisconnectHandler = (reason: 'close' | 'error' | 'max-retries') => void;

const DITTO_MSG_TYPE = 'ditto-ipc';

export interface CellBridgeOptions {
  /** 初始重连延迟（毫秒），默认 1000。 */
  baseRetryDelay?: number;
  /** 最大重连延迟（毫秒），默认 30000。 */
  maxRetryDelay?: number;
  /** 最大重连次数，默认 5（超过后触发 max-retries 事件并停止）。 */
  maxRetries?: number;
  /** 心跳间隔（毫秒），0 禁用，默认 30000。 */
  heartbeatInterval?: number;
  /** 心跳超时（毫秒），超时认为连接断开，默认 10000。 */
  heartbeatTimeout?: number;
}

/**
 * CellBridge：客户端 ↔ 服务端 AppCell 的 IPC 桥接。
 * - WebSocket 连接 /ws?userId=xxx
 * - HTTP 调用 /api/cell/{appId}/start|stop|hibernate|wake
 * - 自动重连（指数退避，可配 maxRetries）
 * - 心跳健康检查（ping/pong）
 * - 断连事件通知（onDisconnect）
 */
export class CellBridge {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private disconnectHandlers = new Set<DisconnectHandler>();
  private serverOrigin = '';
  private wsUrl = '';
  private userId = '';

  private readonly baseRetryDelay: number;
  private readonly maxRetryDelay: number;
  private readonly maxRetries: number;
  private readonly heartbeatInterval: number;
  private readonly heartbeatTimeout: number;

  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private connecting = false;

  constructor(opts: CellBridgeOptions = {}) {
    this.baseRetryDelay = opts.baseRetryDelay ?? 1000;
    this.maxRetryDelay = opts.maxRetryDelay ?? 30000;
    this.maxRetries = opts.maxRetries ?? 5;
    this.heartbeatInterval = opts.heartbeatInterval ?? 30000;
    this.heartbeatTimeout = opts.heartbeatTimeout ?? 10000;
  }

  async connect(wsUrl: string, userId: string): Promise<void> {
    this.userId = userId;
    this.wsUrl = wsUrl;
    this.manuallyClosed = false;
    // 从 wsUrl 推导 server origin（用于 HTTP 调用）
    this.serverOrigin = wsUrl.replace(/^ws/, 'http').replace(/\/ws.*$/, '');

    return this.openConnection();
  }

  private openConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connecting) return;
      this.connecting = true;

      const url = `${this.wsUrl}?userId=${encodeURIComponent(this.userId)}`;
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        this.connecting = false;
        reject(e);
        return;
      }

      const onOpen = () => {
        this.connecting = false;
        this.retryCount = 0;
        this.startHeartbeat();
        resolve();
      };
      const onError = (e: Event) => {
        this.connecting = false;
        this.stopHeartbeat();
        // 首次连接失败 reject；后续重连失败不 reject（已 resolve）
        if (this.retryCount === 0) {
          reject(e);
        }
      };

      this.ws.onopen = onOpen;
      this.ws.onerror = onError;
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
          if (data?.type === '__pong') {
            // 心跳响应
            this.clearHeartbeatTimeout();
            return;
          }
          if (data?.type !== DITTO_MSG_TYPE || !data?.message) return;
          const message = data.message as IPCMessage;
          for (const h of this.handlers) {
            try { h(message); } catch (e) { console.error('[Ditto CellBridge] handler error:', e); }
          }
        } catch (e) {
          console.error('[Ditto CellBridge] parse message failed:', e);
        }
      };
      this.ws.onclose = () => {
        this.connecting = false;
        this.stopHeartbeat();
        this.ws = null;
        if (this.manuallyClosed) return;
        this.emitDisconnect('close');
        this.scheduleReconnect();
      };
    });
  }

  /** 指数退避重连。 */
  private scheduleReconnect(): void {
    if (this.manuallyClosed) return;
    if (this.retryCount >= this.maxRetries) {
      console.warn(`[Ditto CellBridge] Max retries (${this.maxRetries}) reached, giving up`);
      this.emitDisconnect('max-retries');
      return;
    }

    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      this.maxRetryDelay
    );
    this.retryCount++;
    // 重连进度：debug 级别（生产浏览器默认隐藏，DevTools verbose 级别可见）
    console.debug(`[Ditto CellBridge] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // 静默重连：不 reject promise（已 resolved）
      this.openConnection().catch((e) => {
        console.warn(`[Ditto CellBridge] Reconnect failed:`, e);
      });
    }, delay);
  }

  /** 启动心跳。 */
  private startHeartbeat(): void {
    if (this.heartbeatInterval <= 0) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: '__ping', ts: Date.now() }));
          // 设置超时
          this.clearHeartbeatTimeout();
          this.heartbeatTimeoutTimer = setTimeout(() => {
            console.warn('[Ditto CellBridge] Heartbeat timeout, closing connection');
            // 强制关闭以触发重连
            try { this.ws?.close(); } catch {}
          }, this.heartbeatTimeout);
        } catch (e) {
          console.warn('[Ditto CellBridge] Heartbeat send failed:', e);
        }
      }
    }, this.heartbeatInterval);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  /** 强制重置重连计数（下次断连从头开始退避）。 */
  resetRetryCount(): void {
    this.retryCount = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** 当前重连次数。 */
  getRetryCount(): number {
    return this.retryCount;
  }

  /** 连接是否活跃。 */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendToServer(message: IPCMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: DITTO_MSG_TYPE, message }));
    } else {
      console.warn('[Ditto CellBridge] WS not open, dropping message');
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** 注册断连事件处理器。reason 为 'close' | 'error' | 'max-retries'。 */
  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  private emitDisconnect(reason: 'close' | 'error' | 'max-retries'): void {
    for (const h of this.disconnectHandlers) {
      try { h(reason); } catch (e) { console.error('[Ditto CellBridge] disconnect handler error:', e); }
    }
  }

  async notifyStart(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/start`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] start ${appId} failed:`, e);
    }
  }

  async notifyStop(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/stop`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] stop ${appId} failed:`, e);
    }
  }

  /** 通知服务端 hibernate（暂停后端 Cell，释放资源，保留 state）。 */
  async notifyHibernate(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/hibernate`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] hibernate ${appId} failed:`, e);
    }
  }

  /** 通知服务端 wake（从 hibernate 恢复后端 Cell）。 */
  async notifyWake(appId: string): Promise<void> {
    const url = `${this.serverOrigin}/api/cell/${encodeURIComponent(appId)}/wake`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      });
    } catch (e) {
      console.warn(`[Ditto CellBridge] wake ${appId} failed:`, e);
    }
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.handlers.clear();
    this.disconnectHandlers.clear();
  }
}
