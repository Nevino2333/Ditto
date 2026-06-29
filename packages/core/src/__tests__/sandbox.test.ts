import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSandbox, IFrameSandbox, ShadowSandbox, WorkerSandbox } from '../sandbox';
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

    it('worker 缺少 code/url 抛错', () => {
      expect(() => createSandbox('app1', 'worker', {})).toThrow(/workerCode|workerUrl|requires/);
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

  describe('WorkerSandbox', () => {
    // jsdom 不实现 Worker，需要 mock
    const OriginalWorker = (globalThis as any).Worker;

    beforeEach(() => {
      // mock Worker 构造
      (globalThis as any).Worker = class MockWorker {
        url: string;
        opts: any;
        listeners: Record<string, ((e: any) => void)[]> = {};
        onmessage: ((e: any) => void) | null = null;
        onerror: ((e: any) => void) | null = null;
        onclose: ((e: any) => void) | null = null;
        constructor(url: string, opts?: any) {
          this.url = url;
          this.opts = opts;
        }
        addEventListener(type: string, fn: (e: any) => void) {
          (this.listeners[type] = this.listeners[type] || []).push(fn);
        }
        removeEventListener(type: string, fn: (e: any) => void) {
          const arr = this.listeners[type];
          if (arr) {
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
          }
        }
        postMessage(data: any) {
          // 模拟 echo：触发 message 事件
          setTimeout(() => {
            (this.listeners['message'] || []).forEach(fn => fn({ data }));
          }, 0);
        }
        terminate() {}
      };
    });

    afterEach(() => {
      if (OriginalWorker) (globalThis as any).Worker = OriginalWorker;
      else delete (globalThis as any).Worker;
    });

    it('缺少 code 和 url 抛错', () => {
      expect(() => new WorkerSandbox('app1', {})).toThrow(/code or url/);
    });

    it('用 code 创建 Worker（Blob URL）', () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      expect(sb).toBeInstanceOf(WorkerSandbox);
      sb.destroy();
    });

    it('mount 挂载占位元素', () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      const container = document.createElement('div');
      document.body.appendChild(container);
      sb.mount(container);
      expect(container.children.length).toBe(1);
      expect((container.children[0] as HTMLElement).dataset.appId).toBe('app1');
      sb.destroy();
      document.body.removeChild(container);
    });

    it('send 通过 postMessage 发送消息', () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      const msg = { id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any;
      expect(() => sb.send(msg)).not.toThrow();
      sb.destroy();
    });

    it('onMessage 返回取消函数', () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      const off = sb.onMessage(() => {});
      expect(typeof off).toBe('function');
      off();
      sb.destroy();
    });

    it('setVisible(false) 暂停消息派发，setVisible(true) 恢复', async () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      const fn = vi.fn();
      sb.onMessage(fn);
      const container = document.createElement('div');
      document.body.appendChild(container);
      sb.mount(container);
      const msg = { id: '1', type: 'event', channel: 'x', source: 'host', payload: null, timestamp: 0 } as any;
      sb.setVisible(false);
      sb.send(msg); // worker mock 会 echo，但应被缓冲
      await new Promise(r => setTimeout(r, 10));
      expect(fn).not.toHaveBeenCalled();
      sb.setVisible(true);
      await new Promise(r => setTimeout(r, 10));
      expect(fn).toHaveBeenCalledWith(msg);
      sb.destroy();
      document.body.removeChild(container);
    });

    it('destroy 清理资源', () => {
      const sb = new WorkerSandbox('app1', { code: 'self.onmessage = () => {};' });
      const container = document.createElement('div');
      document.body.appendChild(container);
      sb.mount(container);
      sb.destroy();
      expect(container.children.length).toBe(0);
    });
  });
});
