import { describe, it, expect, vi } from 'vitest';
import { createSandbox, IFrameSandbox, ShadowSandbox } from '../sandbox';
import { DittoError } from '@ditto/shared';

describe('CellSandbox', () => {
  describe('createSandbox 工厂', () => {
    it('iframe-strict 返回 IFrameSandbox', () => {
      const sb = createSandbox('app1', 'iframe-strict', { origin: 'https://example.com' });
      expect(sb).toBeInstanceOf(IFrameSandbox);
    });

    it('shadow-trusted 返回 ShadowSandbox', () => {
      const sb = createSandbox('app1', 'shadow-trusted', {});
      expect(sb).toBeInstanceOf(ShadowSandbox);
    });

    it('worker 模式抛 NotSupported', () => {
      expect(() => createSandbox('app1', 'worker', {})).toThrow(DittoError);
    });

    it('iframe-strict 缺少 origin 抛错', () => {
      expect(() => createSandbox('app1', 'iframe-strict', {})).toThrow(/origin/);
    });
  });

  describe('IFrameSandbox', () => {
    it('send 在未 mount 时静默不抛', () => {
      const sb = new IFrameSandbox('app1', 'https://example.com');
      expect(() => sb.send({ id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any)).not.toThrow();
    });

    it('onMessage 返回取消函数', () => {
      const sb = new IFrameSandbox('app1', 'https://example.com');
      const off = sb.onMessage(() => {});
      expect(typeof off).toBe('function');
      off();
    });
  });

  describe('ShadowSandbox', () => {
    it('mount 创建 shadow root', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const sb = new ShadowSandbox('app1');
      sb.mount(container, '<div id="app"></div>');
      expect(sb.getShadowRoot()).toBeTruthy();
      expect(sb.getShadowRoot()?.innerHTML).toContain('id="app"');
      sb.destroy();
      document.body.removeChild(container);
    });

    it('send 触发 onMessage handler', () => {
      const sb = new ShadowSandbox('app1');
      const container = document.createElement('div');
      document.body.appendChild(container);
      sb.mount(container, '');
      const fn = vi.fn();
      sb.onMessage(fn);
      const msg = { id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any;
      sb.send(msg);
      expect(fn).toHaveBeenCalledWith(msg);
      sb.destroy();
      document.body.removeChild(container);
    });
  });
});
