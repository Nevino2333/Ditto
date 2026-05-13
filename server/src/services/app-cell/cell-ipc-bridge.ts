type MessageHandler = (channel: string, payload: unknown) => void;
type HostSender = (appId: string, channel: string, payload: unknown, target?: string) => void;

interface PendingMessage {
  channel: string;
  payload: unknown;
  target?: string;
  timestamp: number;
}

export class CellIPCBridge {
  private appId: string;
  private cellId: string;
  private handlers = new Map<string, Set<MessageHandler>>();
  private sendToHost: HostSender | null = null;
  private pendingMessages: PendingMessage[] = [];
  private wsClients = new Set<{ send: (data: string) => void }>();
  private crossCellHandler: ((targetAppId: string, channel: string, payload: unknown) => void) | null = null;

  constructor(appId: string, cellId: string) {
    this.appId = appId;
    this.cellId = cellId;
  }

  setHostSender(sender: HostSender): void {
    this.sendToHost = sender;
    for (const msg of this.pendingMessages) {
      this.sendToHost(this.appId, msg.channel, msg.payload, msg.target);
    }
    this.pendingMessages = [];
  }

  setCrossCellHandler(handler: (targetAppId: string, channel: string, payload: unknown) => void): void {
    this.crossCellHandler = handler;
  }

  addWSClient(client: { send: (data: string) => void }): void {
    this.wsClients.add(client);
  }

  removeWSClient(client: { send: (data: string) => void }): void {
    this.wsClients.delete(client);
  }

  send(channel: string, payload: unknown, target?: string): void {
    if (target && target !== 'host' && target !== this.appId && this.crossCellHandler) {
      this.crossCellHandler(target, channel, payload);
      return;
    }

    if (this.sendToHost) {
      this.sendToHost(this.appId, channel, payload, target);
    } else {
      this.pendingMessages.push({ channel, payload, target, timestamp: Date.now() });
      if (this.pendingMessages.length > 100) {
        this.pendingMessages.shift();
      }
    }

    this.broadcastToWS({
      type: 'cell-ipc',
      appId: this.appId,
      cellId: this.cellId,
      channel,
      payload,
      direction: 'outgoing',
      timestamp: Date.now(),
    });
  }

  onMessage(channel: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
    return () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }

  receiveFromHost(channel: string, payload: unknown): void {
    const handlers = this.handlers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(channel, payload);
        } catch (e) {
          console.error(`[CellIPC] Error in handler for channel "${channel}":`, e);
        }
      }
    }

    this.broadcastToWS({
      type: 'cell-ipc',
      appId: this.appId,
      cellId: this.cellId,
      channel,
      payload,
      direction: 'incoming',
      timestamp: Date.now(),
    });
  }

  broadcast(channel: string, payload: unknown): void {
    this.send(channel, payload, '*');
  }

  getPendingCount(): number {
    return this.pendingMessages.length;
  }

  getWSClientCount(): number {
    return this.wsClients.size;
  }

  destroy(): void {
    this.handlers.clear();
    this.pendingMessages = [];
    this.wsClients.clear();
    this.sendToHost = null;
    this.crossCellHandler = null;
  }

  private broadcastToWS(data: unknown): void {
    const message = JSON.stringify(data);
    for (const client of this.wsClients) {
      try {
        client.send(message);
      } catch {
        this.wsClients.delete(client);
      }
    }
  }
}
