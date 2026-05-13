import { ref } from 'vue';
import { useDittoIPC } from './ipc-api';

export function useDittoAuth() {
  const { request, send, onMessage } = useDittoIPC();
  const isAuthenticated = ref(false);
  const user = ref<{ id: string; username: string; avatar?: string } | null>(null);

  async function login(username: string, password: string): Promise<void> {
    const result = await request<{ user: { id: string; username: string; avatar?: string }; token: string }>('auth:login', { username, password });
    isAuthenticated.value = true;
    user.value = result.user;
  }

  async function register(username: string, password: string): Promise<void> {
    const result = await request<{ user: { id: string; username: string }; token: string }>('auth:register', { username, password });
    isAuthenticated.value = true;
    user.value = result.user;
  }

  async function logout(): Promise<void> {
    await request('auth:logout', {});
    isAuthenticated.value = false;
    user.value = null;
  }

  async function me(): Promise<{ id: string; username: string; avatar?: string } | null> {
    try {
      const result = await request<{ user: { id: string; username: string; avatar?: string } }>('auth:me', {});
      isAuthenticated.value = true;
      user.value = result.user;
      return result.user;
    } catch {
      isAuthenticated.value = false;
      user.value = null;
      return null;
    }
  }

  return { isAuthenticated, user, login, register, logout, me };
}
