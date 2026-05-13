import { EventEmitter } from './emitter';

export type EventMap = Record<string, unknown>;

export class EventDispatcher<T extends EventMap = EventMap> {
  private emitter = new EventEmitter();

  on<K extends keyof T & string>(event: K, handler: (data: T[K]) => void): () => void {
    return this.emitter.on(event as string, handler);
  }

  once<K extends keyof T & string>(event: K, handler: (data: T[K]) => void): () => void {
    return this.emitter.once(event as string, handler);
  }

  emit<K extends keyof T & string>(event: K, data: T[K]): void {
    this.emitter.emit(event as string, data);
  }

  off<K extends keyof T & string>(event: K, handler: (data: T[K]) => void): void {
    this.emitter.off(event as string, handler);
  }
}
