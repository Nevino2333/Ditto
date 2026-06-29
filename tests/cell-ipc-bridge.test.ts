import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CellIPCBridge } from '../server/src/services/app-cell/cell-ipc-bridge';

describe('CellIPCBridge', () => {
  let bridge: CellIPCBridge;

  beforeEach(() => {
    bridge = new CellIPCBridge('com.ditto.test', 'cell_abc12345');
  });

  it('构造时初始化 appId 与 cellId', () => {
    expect((bridge as any).appId).toBe('com.ditto.test');
    expect((bridge as any).cellId).toBe('cell_abc12345');
  });

  it('未设置 hostSender 时 send 缓冲到 pendingMessages', () => {
    bridge.send('test:channel', { foo: 'bar' });
    expect(bridge.getPendingCount()).toBe(1);
  });

  it('设置 hostSender 后自动 flush pendingMessages', () => {
    const sender = vi.fn();
    bridge.send('test:ch1', { x: 1 });
    bridge.send('test:ch2', { x: 2 });
    expect(bridge.getPendingCount()).toBe(2);
    bridge.setHostSender(sender);
    expect(bridge.getPendingCount()).toBe(0);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenNthCalledWith(1, 'com.ditto.test', 'test:ch1', { x: 1 }, undefined);
    expect(sender).toHaveBeenNthCalledWith(2, 'com.ditto.test', 'test:ch2', { x: 2 }, undefined);
  });

  it('设置 hostSender 后立即 send 不再缓冲', () => {
    const sender = vi.fn();
    bridge.setHostSender(sender);
    bridge.send('test:ch', { y: 1 });
    expect(bridge.getPendingCount()).toBe(0);
    expect(sender).toHaveBeenCalledWith('com.ditto.test', 'test:ch', { y: 1 }, undefined);
  });

  it('onMessage 注册 handler 并在 receiveFromHost 时触发', () => {
    const fn = vi.fn();
    const unsub = bridge.onMessage('test:event', fn);
    bridge.receiveFromHost('test:event', { value: 42 });
    expect(fn).toHaveBeenCalledWith('test:event', { value: 42 });
    unsub();
    bridge.receiveFromHost('test:event', { value: 100 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('receiveFromHost 对未注册的 channel 不抛错', () => {
    expect(() => bridge.receiveFromHost('unknown:ch', {})).not.toThrow();
  });

  it('handler 抛错时不影响其他 handler 调用', () => {
    const good = vi.fn();
    const bad = vi.fn().mockImplementation(() => { throw new Error('bad'); });
    bridge.onMessage('ch', bad);
    bridge.onMessage('ch', good);
    bridge.receiveFromHost('ch', { v: 1 });
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it('addWSClient/removeWSClient 管理 WS 客户端集合', () => {
    const client = { send: vi.fn() };
    bridge.addWSClient(client);
    expect(bridge.getWSClientCount()).toBe(1);
    bridge.removeWSClient(client);
    expect(bridge.getWSClientCount()).toBe(0);
  });

  it('send 时同时向所有 WS 客户端广播 cell-ipc 消息', () => {
    const sender = vi.fn();
    bridge.setHostSender(sender);
    const client1 = { send: vi.fn() };
    const client2 = { send: vi.fn() };
    bridge.addWSClient(client1);
    bridge.addWSClient(client2);
    bridge.send('test:ch', { data: 'hello' });
    // host sender 被调用
    expect(sender).toHaveBeenCalledWith('com.ditto.test', 'test:ch', { data: 'hello' }, undefined);
    // 两个 WS 客户端都收到广播
    expect(client1.send).toHaveBeenCalledTimes(1);
    expect(client2.send).toHaveBeenCalledTimes(1);
    const broadcast = JSON.parse(client1.send.mock.calls[0][0]);
    expect(broadcast.type).toBe('cell-ipc');
    expect(broadcast.appId).toBe('com.ditto.test');
    expect(broadcast.channel).toBe('test:ch');
    expect(broadcast.payload).toEqual({ data: 'hello' });
    expect(broadcast.direction).toBe('outgoing');
  });

  it('receiveFromHost 时向 WS 客户端广播 direction=incoming', () => {
    const client = { send: vi.fn() };
    bridge.addWSClient(client);
    const fn = vi.fn();
    bridge.onMessage('test:ch', fn);
    bridge.receiveFromHost('test:ch', { v: 1 });
    const broadcast = JSON.parse(client.send.mock.calls[0][0]);
    expect(broadcast.direction).toBe('incoming');
    expect(broadcast.channel).toBe('test:ch');
  });

  it('WS 客户端 send 抛错时自动移除该客户端', () => {
    const badClient = { send: vi.fn().mockImplementation(() => { throw new Error('closed'); }) };
    const goodClient = { send: vi.fn() };
    bridge.addWSClient(badClient);
    bridge.addWSClient(goodClient);
    bridge.setHostSender(vi.fn());
    bridge.send('ch', {});
    expect(bridge.getWSClientCount()).toBe(1);
    expect(goodClient.send).toHaveBeenCalled();
  });

  it('cross-cell handler：target 为其他 appId 时走 crossCellHandler', () => {
    const crossHandler = vi.fn();
    bridge.setCrossCellHandler(crossHandler);
    const sender = vi.fn();
    bridge.setHostSender(sender);
    bridge.send('ch', { v: 1 }, 'com.ditto.other');
    expect(crossHandler).toHaveBeenCalledWith('com.ditto.other', 'ch', { v: 1 });
    expect(sender).not.toHaveBeenCalled();
  });

  it('broadcast 等价于 send(channel, payload, "*")', () => {
    const sender = vi.fn();
    bridge.setHostSender(sender);
    bridge.broadcast('ch', { v: 1 });
    expect(sender).toHaveBeenCalledWith('com.ditto.test', 'ch', { v: 1 }, '*');
  });

  it('destroy 清理所有状态', () => {
    const fn = vi.fn();
    bridge.onMessage('ch', fn);
    bridge.addWSClient({ send: vi.fn() });
    bridge.setHostSender(vi.fn());
    bridge.send('ch', {});
    bridge.destroy();
    expect(bridge.getPendingCount()).toBe(0);
    expect(bridge.getWSClientCount()).toBe(0);
    // destroy 后 receiveFromHost 不应触发已注销的 handler
    bridge.receiveFromHost('ch', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it('pendingMessages 超过 100 时丢弃最旧的消息', () => {
    // 未设置 hostSender，所有消息都会缓冲
    for (let i = 0; i < 105; i++) {
      bridge.send(`ch:${i}`, { i });
    }
    // 缓冲区上限 100
    expect(bridge.getPendingCount()).toBe(100);
  });
});
