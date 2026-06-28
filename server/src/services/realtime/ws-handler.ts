import type { AppCellManager } from '../app-cell/manager';

interface ClientData {
  clientId: string;
  userId?: string;
  appId?: string;
}

interface WSLike {
  data: ClientData;
  send: (data: string) => void;
}

interface ConnectedClient {
  ws: WSLike;
  userId: string;
  appId?: string;
  channels: Set<string>;
}

const clients = new Map<string, ConnectedClient>();

export function createWebSocketHandler(cellManager?: AppCellManager) {
  return {
    open(ws: WSLike) {
      const clientId = crypto.randomUUID?.() ?? `${Date.now()}`;
      ws.data = { clientId };
      console.log(`[WS] Client connected: ${clientId}`);
    },

    message(ws: WSLike, message: string | Buffer) {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case 'auth': {
            const client: ConnectedClient = {
              ws,
              userId: data.userId ?? 'anonymous',
              appId: data.appId,
              channels: new Set(),
            };
            clients.set(ws.data.clientId, client);
            ws.send(JSON.stringify({ type: 'auth_ok', clientId: ws.data.clientId }));

            if (cellManager && data.appId) {
              const cells = cellManager.getCellsByApp(data.appId);
              for (const cell of cells) {
                if (cell.toCellInstance().status === 'running') {
                  cell.getIpcBridge().addWSClient(ws);
                }
              }
            }
            break;
          }

          case 'join': {
            const client = clients.get(ws.data.clientId);
            if (!client) return;
            const channel = data.channel as string;
            client.channels.add(channel);
            ws.send(JSON.stringify({ type: 'joined', channel }));
            break;
          }

          case 'leave': {
            const client = clients.get(ws.data.clientId);
            if (!client) return;
            client.channels.delete(data.channel);
            break;
          }

          case 'cell-ipc': {
            if (!cellManager) return;
            const client = clients.get(ws.data.clientId);
            if (!client) return;

            const { appId, channel, payload, target } = data;
            if (!appId || !channel) return;

            if (target && target !== 'host') {
              const targetCells = cellManager.getCellsByApp(target);
              for (const cell of targetCells) {
                if (cell.toCellInstance().status === 'running') {
                  cell.getIpcBridge().receiveFromHost(channel, payload);
                }
              }
            } else {
              cellManager.deliverIPCMessage(appId, channel, payload, client.userId);
            }

            ws.send(JSON.stringify({ type: 'cell-ipc-sent', appId, channel }));
            break;
          }

          case 'chat': {
            const client = clients.get(ws.data.clientId);
            if (!client) return;
            const channel = data.channel as string;
            const chatMsg = {
              id: crypto.randomUUID?.() ?? `${Date.now()}`,
              userId: client.userId,
              content: data.content,
              timestamp: Date.now(),
              channel,
            };

            const broadcast = JSON.stringify({ type: 'chat', message: chatMsg });
            for (const [, c] of clients) {
              if (c.channels.has(channel) && c.ws !== ws) {
                c.ws.send(broadcast);
              }
            }

            ws.send(JSON.stringify({ type: 'chat_sent', messageId: chatMsg.id }));
            break;
          }
        }
      } catch (e) {
        console.error('[WS] Error processing message:', e);
      }
    },

    close(ws: WSLike) {
      const client = clients.get(ws.data.clientId);
      if (cellManager && client?.appId) {
        const cells = cellManager.getCellsByApp(client.appId);
        for (const cell of cells) {
          cell.getIpcBridge().removeWSClient(ws);
        }
      }
      clients.delete(ws.data.clientId);
      console.log(`[WS] Client disconnected: ${ws.data.clientId}`);
    },
  };
}
