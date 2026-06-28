import { describe, it, expect, vi } from 'vitest';
import { IPCBus } from '../ipc/bus';
import type { IPCMessage } from '@ditto/shared';

describe('IPCBus v2', () => {
  it('send/on 触发 handler', () => {
    const bus = new IPCBus('host');
    const fn = vi.fn();
    bus.on('channel:x', fn);
    bus.send('channel:x', { a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    const msg = fn.mock.calls[0][0] as IPCMessage;
    expect(msg.payload).toEqual({ a: 1 });
    expect(msg.target).toBe('host');
  });

  it('request/respond 往返', async () => {
    const bus = new IPCBus('host');
    bus.on('rpc:add', (msg) => {
      bus.respond(msg.id, { sum: (msg.payload as number[])?.reduce((a, b) => a + b, 0) });
    });
    const res = await bus.request('rpc:add', [1, 2, 3]);
    expect(res.payload).toEqual({ sum: 6 });
  });

  it('request 超时抛 DittoError', async () => {
    const bus = new IPCBus('host', 50);
    await expect(bus.request('no:handler', null, 50)).rejects.toThrow(/timed out/);
  });

  it('中间件链迭代执行', () => {
    const bus = new IPCBus('host');
    const order: string[] = [];
    bus.use((msg, next) => { order.push('a:before'); next(msg); order.push('a:after'); });
    bus.use((msg, next) => { order.push('b:before'); next(msg); order.push('b:after'); });
    const fn = vi.fn();
    bus.on('ch', fn);
    bus.send('ch');
    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('handler 异常被捕获，不中断其他 handler', () => {
    const bus = new IPCBus('host');
    const good = vi.fn();
    const errHandler = vi.fn();
    bus.on('ch', () => { throw new Error('boom'); });
    bus.on('ch', good);
    bus.on('ipc:handler-error', errHandler);
    bus.send('ch');
    expect(good).toHaveBeenCalled();
    expect(errHandler).toHaveBeenCalled();
  });

  it('connectBridge 拒绝 origin=*', () => {
    const bus = new IPCBus('host');
    expect(() => bus.connectBridge({} as Window, '*')).toThrow(/origin/);
  });

  it('use 返回取消函数', () => {
    const bus = new IPCBus('host');
    const mw = vi.fn((msg, next) => next(msg));
    const off = bus.use(mw);
    off();
    bus.send('ch');
    expect(mw).not.toHaveBeenCalled();
  });
});
