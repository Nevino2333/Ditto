type EventHandler<T = unknown> = (payload: T) => void;

/**
 * EventEmitter v2。
 * 关键变更：emit 时对每个 handler 包 try/catch，单个异常不影响其他；
 * 异常打到 console 并触发 error:handler 事件。
 * 保留泛型签名以兼容现有 typed handler 调用方（如 EventDispatcher）。
 */
export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = (payload) => {
      this.off(event, wrapper as EventHandler);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as EventHandler);
      if (set.size === 0) this.handlers.delete(event);
    }
  }

  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // 复制一份避免迭代中修改
    const handlers = [...set];
    for (const handler of handlers) {
      try {
        (handler as EventHandler)(payload);
      } catch (e) {
        console.error(`[Ditto EventEmitter] Handler error on "${event}":`, e);
        // 触发 error:handler（避免无限递归：直接调用，不走 emit）
        const errSet = this.handlers.get('error:handler');
        if (errSet && event !== 'error:handler') {
          for (const errHandler of [...errSet]) {
            try {
              (errHandler as EventHandler)({ event, error: e, handler });
            } catch (ee) {
              console.error(`[Ditto EventEmitter] Error in error:handler:`, ee);
            }
          }
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// 保留 EventDispatcher 别名（旧代码可能引用）
export { EventEmitter as EventDispatcher };
