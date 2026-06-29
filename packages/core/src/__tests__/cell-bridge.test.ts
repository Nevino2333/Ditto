import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CellBridge } from '../app-cell/bridge';

// mock WebSocket
class MockWS {
  static instances: MockWS[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sent: any[] = [];
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }

  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.readyState = 3; this.onclose?.({}); }
}

describe('CellBridge', () => {
  beforeEach(() => {
    MockWS.instances = [];
    (global as any).WebSocket = MockWS;
  });
  afterEach(() => {
    delete (global as any).WebSocket;
  });

  it('connect 建立 WS 连接', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    expect(MockWS.instances).toHaveLength(1);
    expect(MockWS.instances[0].url).toBe('ws://srv/ws?userId=user-1');
  });

  it('sendToServer 发送 IPC 消息', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const msg = { id: '1', type: 'event' as const, channel: 'ch', source: 'host', target: 'server:app1', payload: { x: 1 }, timestamp: 0 };
    bridge.sendToServer(msg);
    expect(MockWS.instances[0].sent[0]).toMatchObject({ type: 'ditto-ipc', message: msg });
  });

  it('onMessage 接收服务端消息', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const fn = vi.fn();
    bridge.onMessage(fn);
    const msg = { id: '2', type: 'event', channel: 'ch', source: 'server', target: 'host', payload: null, timestamp: 0 };
    MockWS.instances[0].onmessage!({ data: JSON.stringify({ type: 'ditto-ipc', message: msg }) });
    expect(fn).toHaveBeenCalledWith(msg);
  });

  it('notifyStart/notifyStop 调用对应 API', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const bridge = new CellBridge();
    await bridge.connect('ws://srv', 'user-1');
    await bridge.notifyStart('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/start', expect.objectContaining({ method: 'POST' }));
    await bridge.notifyStop('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/stop', expect.objectContaining({ method: 'POST' }));
    fetchSpy.mockRestore();
  });

  it('notifyHibernate/notifyWake 调用对应 API', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const bridge = new CellBridge();
    await bridge.connect('ws://srv', 'user-1');
    await bridge.notifyHibernate('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/hibernate', expect.objectContaining({ method: 'POST' }));
    await bridge.notifyWake('com.ditto.x');
    expect(fetchSpy).toHaveBeenCalledWith('http://srv/api/cell/com.ditto.x/wake', expect.objectContaining({ method: 'POST' }));
    fetchSpy.mockRestore();
  });

  it('disconnect 关闭 WS', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    const ws = MockWS.instances[0];
    bridge.disconnect();
    expect(ws.readyState).toBe(3);
  });

  it('断连后触发 onDisconnect 回调', async () => {
    const bridge = new CellBridge({ maxRetries: 0, baseRetryDelay: 1 });
    await bridge.connect('ws://srv/ws', 'user-1');
    const fn = vi.fn();
    bridge.onDisconnect(fn);
    // 模拟服务端关闭
    MockWS.instances[0].close();
    expect(fn).toHaveBeenCalledWith('close');
    bridge.disconnect();
  });

  it('手动 disconnect 不触发重连', async () => {
    const bridge = new CellBridge({ maxRetries: 3, baseRetryDelay: 1 });
    await bridge.connect('ws://srv/ws', 'user-1');
    const initialCount = MockWS.instances.length;
    bridge.disconnect();
    // 等待潜在重连
    await new Promise(r => setTimeout(r, 50));
    expect(MockWS.instances.length).toBe(initialCount);
  });

  it('maxRetries=0 时断连直接触发 max-retries 不重连', async () => {
    const bridge = new CellBridge({ maxRetries: 0, baseRetryDelay: 1 });
    await bridge.connect('ws://srv/ws', 'user-1');
    const fn = vi.fn();
    bridge.onDisconnect(fn);
    MockWS.instances[0].close();
    // 第一次 close 先触发 'close'，然后 scheduleReconnect 发现 retryCount(0) >= maxRetries(0) 触发 'max-retries'
    await new Promise(r => setTimeout(r, 20));
    expect(fn).toHaveBeenCalledWith('close');
    expect(fn).toHaveBeenCalledWith('max-retries');
    // 不应创建新 WS（不重连）
    expect(MockWS.instances.length).toBe(1);
  });

  it('isConnected 反映连接状态', async () => {
    const bridge = new CellBridge();
    await bridge.connect('ws://srv/ws', 'user-1');
    expect(bridge.isConnected()).toBe(true);
    MockWS.instances[0].close();
    expect(bridge.isConnected()).toBe(false);
    bridge.disconnect();
  });

  it('心跳发送 __ping 消息', async () => {
    const bridge = new CellBridge({ heartbeatInterval: 10 });
    await bridge.connect('ws://srv/ws', 'user-1');
    // 等待心跳
    await new Promise(r => setTimeout(r, 30));
    const pings = MockWS.instances[0].sent.filter(m => m.type === '__ping');
    expect(pings.length).toBeGreaterThan(0);
    bridge.disconnect();
  });

  it('resetRetryCount 重置重连计数', async () => {
    const bridge = new CellBridge({ maxRetries: 5, baseRetryDelay: 1000 });
    await bridge.connect('ws://srv/ws', 'user-1');
    MockWS.instances[0].close();
    // close 后立即检查（重连 setTimeout 1000ms 未触发，retryCount 已 ++）
    expect(bridge.getRetryCount()).toBe(1);
    bridge.resetRetryCount();
    expect(bridge.getRetryCount()).toBe(0);
    bridge.disconnect();
  });
});
