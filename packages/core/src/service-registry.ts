import { DittoError } from '@ditto/shared';

export type ServiceId = string;

export interface ServiceInstance {
  instance: unknown;
  destroy?: () => void | Promise<void>;
}

export type ServiceFactory<T> = (ctx: ServiceResolveContext) => T | Promise<T>;

export interface ServiceResolveContext {
  resolve<T>(id: ServiceId): T;
  has(id: ServiceId): boolean;
}

/**
 * 服务注册表。
 * - 工厂模式，懒创建（首次 resolve 才实例化）
 * - 同步/异步工厂都支持
 * - shutdown 按注册逆序销毁，单个 destroy 异常不中断
 */
export class ServiceRegistry {
  private factories = new Map<ServiceId, ServiceFactory<unknown>>();
  private instances = new Map<ServiceId, ServiceInstance>();
  private registrationOrder: ServiceId[] = [];

  register<T>(id: ServiceId, factory: ServiceFactory<T>): void {
    if (this.factories.has(id)) {
      throw DittoError.serviceAlreadyRegistered(id);
    }
    this.factories.set(id, factory as ServiceFactory<unknown>);
    this.registrationOrder.push(id);
  }

  resolve<T>(id: ServiceId): T {
    const existing = this.instances.get(id);
    if (existing) return existing.instance as T;

    const factory = this.factories.get(id);
    if (!factory) {
      throw DittoError.serviceNotRegistered(id);
    }

    const ctx: ServiceResolveContext = {
      resolve: <T2>(sid: ServiceId) => this.resolve<T2>(sid),
      has: (sid: ServiceId) => this.has(sid),
    };
    const instance = factory(ctx) as unknown as { destroy?: () => void | Promise<void> };
    this.instances.set(id, { instance, destroy: instance.destroy });
    return instance as T;
  }

  async resolveAsync<T>(id: ServiceId): Promise<T> {
    const existing = this.instances.get(id);
    if (existing) return existing.instance as T;

    const factory = this.factories.get(id);
    if (!factory) {
      throw DittoError.serviceNotRegistered(id);
    }
    const ctx: ServiceResolveContext = {
      resolve: <T2>(sid: ServiceId) => this.resolve<T2>(sid),
      has: (sid: ServiceId) => this.has(sid),
    };
    const instance = (await factory(ctx)) as { destroy?: () => void | Promise<void> };
    this.instances.set(id, { instance, destroy: instance.destroy });
    return instance as T;
  }

  has(id: ServiceId): boolean {
    return this.factories.has(id);
  }

  list(): ServiceId[] {
    return [...this.registrationOrder];
  }

  async shutdown(): Promise<void> {
    const errors: unknown[] = [];
    // 逆序销毁
    for (let i = this.registrationOrder.length - 1; i >= 0; i--) {
      const id = this.registrationOrder[i];
      const entry = this.instances.get(id);
      if (entry?.destroy) {
        try {
          await entry.destroy();
        } catch (e) {
          errors.push(e);
          console.error(`[Ditto ServiceRegistry] Error destroying "${id}":`, e);
        }
      }
    }
    this.instances.clear();
    this.factories.clear();
    this.registrationOrder.length = 0;
    if (errors.length > 0) {
      console.warn(`[Ditto ServiceRegistry] shutdown completed with ${errors.length} errors`);
    }
  }
}
