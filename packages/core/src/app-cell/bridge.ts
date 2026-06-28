import type { IPCMessage } from '@ditto/shared';

type MessageHandler = (message: IPCMessage) => void;

const DITTO_MSG_TYPE = 'ditto-ipc';

/**
 * CellBridge：客户端 ↔ 服务端 AppCell 的 IPC 桥接。
 * - WebSocket 连接 /ws?userId=xxx
 * - HTTP 调用 /api/cell/{appId}/start|stop
 * - 阶段 3 替换为健康检查 + 自动重连
 */
export class CellBridge {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private serverOrigin = '';
  private userId = '';

  async connect(wsUrl: string, userId: string): Promise<void> {
    this.userId = userId;
    // 从 wsUrl 推导 server origin（用于 HTTP 调用）
    this.serverOrigin = wsUrl.replace(/^ws/, 'http').replace(/\/ws.*$/, '');

    return new Promise((resolve, reject) => {
      const url = `${wsUrl}?userId=${encodeURIComponent(userId)}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
          if (data?.type !== DITTO_MSG_TYPE || !data?.message) return;
          const message = data.message as IPCMessage;
          for (const h of this.handlers) {
            try { h(message); } catch (e) { console.error('[Ditto CellBridge] handler error:', e); }
          }
        } catch (e) {
          console.error('[Ditto CellBridge] parse message failed:', e);
        }
      };
      this.ws.onclose = () => { this.ws = null; };
    });
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

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }
}
