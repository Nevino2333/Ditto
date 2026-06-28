import { describe, it, expect, vi } from 'vitest';
import { ServiceRegistry } from '../service-registry';
import { DittoError } from '@ditto/shared';

describe('ServiceRegistry', () => {
  it('register/resolve 基本流程', () => {
    const reg = new ServiceRegistry();
    reg.register('test', () => ({ value: 42 }));
    const svc = reg.resolve<{ value: number }>('test');
    expect(svc.value).toBe(42);
  });

  it('重复 register 抛错', () => {
    const reg = new ServiceRegistry();
    reg.register('test', () => ({}));
    expect(() => reg.register('test', () => ({}))).toThrow(DittoError);
  });

  it('resolve 未注册抛错', () => {
    const reg = new ServiceRegistry();
    expect(() => reg.resolve('nope')).toThrow(DittoError);
  });

  it('has/list', () => {
    const reg = new ServiceRegistry();
    reg.register('a', () => 1);
    reg.register('b', () => 2);
    expect(reg.has('a')).toBe(true);
    expect(reg.has('c')).toBe(false);
    expect(reg.list().sort()).toEqual(['a', 'b']);
  });

  it('工厂懒创建（仅首次 resolve 调用工厂）', () => {
    const reg = new ServiceRegistry();
    const factory = vi.fn(() => ({ x: 1 }));
    reg.register('test', factory);
    expect(factory).not.toHaveBeenCalled();
    reg.resolve('test');
    reg.resolve('test');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('shutdown 调用 destroy 逆序', async () => {
    const order: string[] = [];
    const reg = new ServiceRegistry();
    reg.register('a', () => ({ destroy: () => order.push('a') }));
    reg.register('b', () => ({ destroy: () => order.push('b') }));
    reg.resolve('a');
    reg.resolve('b');
    await reg.shutdown();
    expect(order).toEqual(['b', 'a']); // 逆序
  });

  it('shutdown 中单个 destroy 异常不中断', async () => {
    const reg = new ServiceRegistry();
    reg.register('a', () => ({ destroy: () => { throw new Error('boom'); } }));
    reg.register('b', () => ({ destroy: () => {} }));
    reg.resolve('a');
    reg.resolve('b');
    await expect(reg.shutdown()).resolves.not.toThrow();
  });
});
