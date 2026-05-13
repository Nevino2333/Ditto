import type { Permission, PermissionStatus } from '@ditto/shared';
import type { PersistenceStore } from '../persistence/store';

interface PermissionEntry {
  appId: string;
  permission: string;
  status: PermissionStatus;
  grantedAt?: number;
}

type PermissionRequestHandler = (appId: string, permission: Permission) => Promise<boolean>;

export class PermissionManager {
  private permissions = new Map<string, PermissionEntry>();
  private store: PersistenceStore | null;
  private requestHandler: PermissionRequestHandler | null = null;

  constructor(store?: PersistenceStore) {
    this.store = store ?? null;
  }

  setRequestHandler(handler: PermissionRequestHandler): void {
    this.requestHandler = handler;
  }

  async check(appId: string, permission: string): Promise<PermissionStatus> {
    const key = `${appId}:${permission}`;
    const entry = this.permissions.get(key);
    return entry?.status ?? 'prompt';
  }

  async grant(appId: string, permission: string): Promise<void> {
    const key = `${appId}:${permission}`;
    this.permissions.set(key, { appId, permission, status: 'granted', grantedAt: Date.now() });
    this.persist();
  }

  async deny(appId: string, permission: string): Promise<void> {
    const key = `${appId}:${permission}`;
    this.permissions.set(key, { appId, permission, status: 'denied' });
    this.persist();
  }

  async request(appId: string, permission: Permission): Promise<boolean> {
    const permName = permission.name;
    const status = await this.check(appId, permName);
    if (status === 'granted') return true;
    if (status === 'denied') return false;

    if (this.requestHandler) {
      const granted = await this.requestHandler(appId, permission);
      if (granted) {
        await this.grant(appId, permName);
      } else {
        await this.deny(appId, permName);
      }
      return granted;
    }

    return false;
  }

  async checkPermission(appId: string, required: Permission): Promise<boolean> {
    const status = await this.check(appId, required.name);
    if (status !== 'granted') return false;

    if (required.name === 'fs.read' || required.name === 'fs.write') {
      const requestedPaths = required.params.paths;
      for (const path of requestedPaths) {
        const pathStatus = await this.check(appId, `${required.name}:${path}`);
        if (pathStatus !== 'granted' && pathStatus !== 'prompt') return false;
      }
    }

    if (required.name === 'net.request') {
      const requestedOrigins = required.params.origins;
      for (const origin of requestedOrigins) {
        const originStatus = await this.check(appId, `${required.name}:${origin}`);
        if (originStatus !== 'granted' && originStatus !== 'prompt') return false;
      }
    }

    return true;
  }

  revoke(appId: string, permission?: string): void {
    if (permission) {
      this.permissions.delete(`${appId}:${permission}`);
    } else {
      for (const [key, entry] of this.permissions) {
        if (entry.appId === appId) {
          this.permissions.delete(key);
        }
      }
    }
    this.persist();
  }

  loadFromStorage(data: Record<string, string>): void {
    for (const [key, status] of Object.entries(data)) {
      const [appId, ...permParts] = key.split(':');
      if (appId && permParts.length > 0) {
        this.permissions.set(key, {
          appId,
          permission: permParts.join(':'),
          status: status as PermissionStatus,
        });
      }
    }
  }

  getGrantedPermissions(appId: string): string[] {
    const result: string[] = [];
    for (const [, entry] of this.permissions) {
      if (entry.appId === appId && entry.status === 'granted') {
        result.push(entry.permission);
      }
    }
    return result;
  }

  private persist(): void {
    if (!this.store) return;
    const data: Record<string, string> = {};
    for (const [key, entry] of this.permissions) {
      data[key] = entry.status;
    }
    this.store.set('permissions', data);
  }
}

let instance: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!instance) {
    instance = new PermissionManager();
  }
  return instance;
}
