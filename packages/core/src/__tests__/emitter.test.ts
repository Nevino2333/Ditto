import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../event/emitter';

describe('EventEmitter v2', () => {
  it('on/emit 触发 handler', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('test', fn);
    emitter.emit('test', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('on 返回取消订阅函数', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    const off = emitter.on('test', fn);
    off();
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('once 只触发一次', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.once('test', fn);
    emitter.emit('test');
    emitter.emit('test');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('单个 handler 异常不影响其他 handler', () => {
    const emitter = new EventEmitter();
    const good = vi.fn();
    const bad = () => { throw new Error('boom'); };
    const errHandler = vi.fn();
    emitter.on('test', bad);
    emitter.on('test', good);
    emitter.on('error:handler', errHandler);
    emitter.emit('test');
    expect(good).toHaveBeenCalled();
    expect(errHandler).toHaveBeenCalled();
  });

  it('removeAllListeners 清除指定事件', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('test', fn);
    emitter.removeAllListeners('test');
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });
});
