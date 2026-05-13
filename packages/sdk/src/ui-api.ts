import { useDittoIPC } from './ipc-api';

export function useDittoUI() {
  const { send, request } = useDittoIPC();

  function showNotification(title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    send('ui:notify', { title, body, type });
  }

  async function showOpenFileDialog(options?: { accept?: string; multiple?: boolean }): Promise<File[]> {
    const result = await request<{ files: { name: string; size: number; type: string; data: ArrayBuffer }[] }>('ui:openFile', options);
    return result.files.map((f) => new File([f.data], f.name, { type: f.type }));
  }

  async function showConfirm(title: string, message: string): Promise<boolean> {
    const result = await request<{ confirmed: boolean }>('ui:confirm', { title, message });
    return result.confirmed;
  }

  async function showAlert(title: string, message: string): Promise<void> {
    await request('ui:alert', { title, message });
  }

  return { showNotification, showOpenFileDialog, showConfirm, showAlert };
}
