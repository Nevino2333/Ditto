/**
 * Ditto Counter - 后端 Cell 模块
 *
 * 演示 dit 类型应用的后端 Cell 完整能力：
 *  - 生命周期：onInit / onStart / onStop / onDestroy
 *  - HTTP 路由：registerRoutes（CellRouter）
 *  - WebSocket：registerWebSocket（CellWebSocketHandler）
 *  - 持久化：CellStorage（counter 值跨重启保留）
 *  - 跨客户端广播：CellIPC（多端实时同步）
 *  - 可观测性：CellLogger + CellMetrics
 *
 * 路由前缀（由 AppCellManager 注入）：/api/cell/com.ditto.counter/...
 *  - GET  /health        健康检查
 *  - GET  /counter       读取当前值
 *  - POST /counter/inc   +delta（payload: { delta?: number }，默认 1）
 *  - POST /counter/dec   -delta（payload: { delta?: number }，默认 1）
 *  - POST /counter/reset 归零
 *  - GET  /stats         计数历史与活跃客户端数
 *
 * WebSocket：连接后客户端收到 counter:update 事件
 */
import type { AppCellModule, CellContext, CellRouter, CellWebSocketHandler } from '@ditto/shared';

const APP_ID = 'com.ditto.counter';
const STORAGE_KEY = 'counter:value';
const CHANNEL_COUNTER_UPDATE = 'counter:update';

interface CounterState {
  value: number;
  updatedAt: number;
  updatedBy?: string;
}

interface HistoryEntry {
  value: number;
  at: number;
  by?: string;
  action: 'inc' | 'dec' | 'reset' | 'init';
}

interface WSClient {
  send: (data: string) => void;
  close?: () => void;
}

// 模块级状态：在 onInit 时由 CellContext 注入。registerRoutes 通过闭包访问。
let cellCtx: CellContext | null = null;
const activeClients = new Set<WSClient>();
const history: HistoryEntry[] = [];
const MAX_HISTORY = 50;

function encodeState(state: CounterState): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(state));
}

function decodeState(data: Uint8Array | null): CounterState | null {
  if (!data) return null;
  try {
    return JSON.parse(new TextDecoder().decode(data)) as CounterState;
  } catch {
    return null;
  }
}

function pushHistory(entry: HistoryEntry): void {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
}

function broadcastUpdate(state: CounterState): void {
  if (!cellCtx) return;
  // 通过 CellIPC 跨 Cell 广播（其他 Cell 可订阅 counter:update）
  cellCtx.ipc.send(CHANNEL_COUNTER_UPDATE, state, '*');
  // 同时通过 WebSocket 推送给前端订阅者
  const payload = JSON.stringify({ type: CHANNEL_COUNTER_UPDATE, data: state });
  for (const client of activeClients) {
    try {
      client.send(payload);
    } catch {
      activeClients.delete(client);
    }
  }
}

function getCurrentState(): Promise<CounterState> {
  return (async () => {
    const stored = await cellCtx!.storage.get(STORAGE_KEY);
    return decodeState(stored) ?? { value: 0, updatedAt: Date.now() };
  })();
}

async function updateValue(
  delta: number,
  action: 'inc' | 'dec' | 'reset',
  userId: string,
): Promise<CounterState> {
  const ctx = cellCtx!;
  const current = await getCurrentState();
  const next: CounterState = {
    value: action === 'reset' ? 0 : current.value + delta,
    updatedAt: Date.now(),
    updatedBy: userId,
  };
  await ctx.storage.put(STORAGE_KEY, encodeState(next));
  pushHistory({ value: next.value, at: next.updatedAt, by: next.updatedBy, action });
  ctx.metrics.gauge('counter.value', next.value);
  ctx.metrics.increment(`counter.${action}`);
  broadcastUpdate(next);
  return next;
}

const module: AppCellModule = {
  async onInit(ctx: CellContext): Promise<void> {
    cellCtx = ctx;
    ctx.logger.info('Ditto Counter backend initializing');

    // 初始化或读取持久化状态
    const stored = await ctx.storage.get(STORAGE_KEY);
    const state = decodeState(stored) ?? { value: 0, updatedAt: Date.now() };
    if (!stored) {
      await ctx.storage.put(STORAGE_KEY, encodeState(state));
    }
    pushHistory({ value: state.value, at: state.updatedAt, by: state.updatedBy ?? 'system', action: 'init' });

    ctx.metrics.gauge('counter.value', state.value);
    ctx.logger.info('Counter initialized', { value: state.value });
  },

  async onStart(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Counter backend started', { activeClients: activeClients.size });
    ctx.metrics.increment('lifecycle.start');
  },

  async onStop(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Counter backend stopping', { activeClients: activeClients.size });
    ctx.metrics.increment('lifecycle.stop');
    // 通知所有 WebSocket 客户端即将停止
    const payload = JSON.stringify({ type: 'cell:stopping' });
    for (const client of activeClients) {
      try {
        client.send(payload);
      } catch { /* ignore */ }
    }
  },

  async onDestroy(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Counter backend destroyed');
    activeClients.clear();
    history.length = 0;
    cellCtx = null;
  },

  registerRoutes(router: CellRouter): void {
    router.get('/health', async (_req, res) => {
      res.json({
        status: 'ok',
        appId: APP_ID,
        activeClients: activeClients.size,
        historySize: history.length,
      });
    });

    router.get('/counter', async (_req, res) => {
      if (!cellCtx) {
        res.status(503).json({ error: 'Cell not initialized' });
        return;
      }
      const state = await getCurrentState();
      res.json(state);
    });

    router.post('/counter/inc', async (req, res) => {
      if (!cellCtx) {
        res.status(503).json({ error: 'Cell not initialized' });
        return;
      }
      const body = (req.body ?? {}) as { delta?: number };
      const delta = typeof body.delta === 'number' ? body.delta : 1;
      const next = await updateValue(delta, 'inc', req.userId ?? 'anonymous');
      res.json(next);
    });

    router.post('/counter/dec', async (req, res) => {
      if (!cellCtx) {
        res.status(503).json({ error: 'Cell not initialized' });
        return;
      }
      const body = (req.body ?? {}) as { delta?: number };
      const delta = typeof body.delta === 'number' ? body.delta : 1;
      const next = await updateValue(-delta, 'dec', req.userId ?? 'anonymous');
      res.json(next);
    });

    router.post('/counter/reset', async (req, res) => {
      if (!cellCtx) {
        res.status(503).json({ error: 'Cell not initialized' });
        return;
      }
      const next = await updateValue(0, 'reset', req.userId ?? 'anonymous');
      res.json(next);
    });

    router.get('/stats', async (_req, res) => {
      res.json({
        activeClients: activeClients.size,
        history: history.slice(0, 20),
        totalEvents: history.length,
      });
    });
  },

  registerWebSocket(_wsHandler: CellWebSocketHandler): void {
    // WebSocket 客户端通过 CellIPCBridge.addWSClient 管理。
    // 此处注册表示后端支持 WebSocket，实际 WS 消息由 broadcastUpdate 推送。
    void _wsHandler;
  },
};

export default module;
