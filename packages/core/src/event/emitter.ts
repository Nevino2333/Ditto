type EventHandler<T = unknown> = (data: T) => void;

const DEFAULT_MAX_LISTENERS = 10;

export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();
  private maxListeners = DEFAULT_MAX_LISTENERS;

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler);

    if (set.size > this.maxListeners) {
      console.warn(
        `[Ditto EventEmitter] Possible memory leak: "${event}" has ${set.size} listeners ` +
        `(max: ${this.maxListeners}). Use setMaxListeners() to increase limit.`
      );
    }

    return () => {
      set.delete(handler as EventHandler);
      if (set.size === 0) this.handlers.delete(event);
    };
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = (data) => {
      try {
        handler(data);
      } finally {
        off();
      }
    };
    const off = this.on(event, wrapper);
    return off;
  }

  emit<T = unknown>(event: string, data: T): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch (e) {
        console.error(`[Ditto EventEmitter] Error in handler for "${event}":`, e);
      }
    }
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as EventHandler);
      if (set.size === 0) this.handlers.delete(event);
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

  eventNames(): string[] {
    return [...this.handlers.keys()];
  }

  setMaxListeners(n: number): void {
    this.maxListeners = n;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }
}
