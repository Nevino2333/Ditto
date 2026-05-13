import { ref, onUnmounted } from 'vue';
import { useDittoIPC } from './ipc-api';

export function useDittoWindow() {
  const { send, onMessage } = useDittoIPC();

  function setTitle(title: string): void {
    send('window:setTitle', { title });
  }

  function close(): void {
    send('window:close', {});
  }

  function minimize(): void {
    send('window:minimize', {});
  }

  function maximize(): void {
    send('window:maximize', {});
  }

  function restore(): void {
    send('window:restore', {});
  }

  function setIcon(icon: string): void {
    send('window:setIcon', { icon });
  }

  return { setTitle, close, minimize, maximize, restore, setIcon };
}
