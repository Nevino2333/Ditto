import { useDittoIPC } from './ipc-api';

export function useDittoFS() {
  const { request, send } = useDittoIPC();

  async function readFile(path: string): Promise<ArrayBuffer> {
    const result = await request<{ data: ArrayBuffer }>('fs:read', { path });
    return result.data;
  }

  async function readText(path: string): Promise<string> {
    const result = await request<{ text: string }>('fs:readText', { path });
    return result.text;
  }

  async function writeFile(path: string, data: ArrayBuffer): Promise<void> {
    await request('fs:write', { path, data });
  }

  async function writeText(path: string, text: string): Promise<void> {
    await request('fs:writeText', { path, text });
  }

  async function listDir(path: string): Promise<string[]> {
    const result = await request<{ entries: string[] }>('fs:ls', { path });
    return result.entries;
  }

  async function deleteFile(path: string): Promise<void> {
    await request('fs:delete', { path });
  }

  async function mkdir(path: string): Promise<void> {
    await request('fs:mkdir', { path });
  }

  async function stat(path: string): Promise<{ size: number; modified: number; type: string }> {
    return request('fs:stat', { path });
  }

  async function rename(oldPath: string, newPath: string): Promise<void> {
    await request('fs:rename', { oldPath, newPath });
  }

  async function exists(path: string): Promise<boolean> {
    const result = await request<{ exists: boolean }>('fs:exists', { path });
    return result.exists;
  }

  return { readFile, readText, writeFile, writeText, listDir, deleteFile, mkdir, stat, rename, exists };
}
