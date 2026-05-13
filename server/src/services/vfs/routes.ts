import { Hono } from 'hono';

const fileStore = new Map<string, { data: Uint8Array; type: 'file' | 'directory'; modifiedAt: number; createdAt: number }>();

export const vfsRoutes = new Hono();

vfsRoutes.get('/ls/*', async (c) => {
  const path = c.req.path.replace('/api/vfs/ls', '') || '/';
  const prefix = path === '/' ? '/' : path + '/';
  const entries: { name: string; path: string; type: string; size: number; modifiedAt: number }[] = [];

  for (const [filePath, record] of fileStore) {
    if (filePath === path) continue;
    if (!filePath.startsWith(prefix)) continue;
    const relativePath = filePath.slice(prefix.length);
    if (relativePath.includes('/')) continue;
    entries.push({
      name: relativePath,
      path: filePath,
      type: record.type,
      size: record.data.byteLength,
      modifiedAt: record.modifiedAt,
    });
  }

  return c.json(entries);
});

vfsRoutes.get('/read/*', async (c) => {
  const path = c.req.path.replace('/api/vfs/read', '');
  const record = fileStore.get(path);
  if (!record) return c.json({ error: 'File not found' }, 404);
  return new Response(record.data);
});

vfsRoutes.put('/write/*', async (c) => {
  const path = c.req.path.replace('/api/vfs/write', '');
  const data = await c.req.arrayBuffer();
  const now = Date.now();
  const existing = fileStore.get(path);
  fileStore.set(path, {
    data: new Uint8Array(data),
    type: 'file',
    modifiedAt: now,
    createdAt: existing?.createdAt ?? now,
  });
  return c.json({ success: true, path });
});

vfsRoutes.delete('/delete/*', async (c) => {
  const path = c.req.path.replace('/api/vfs/delete', '');
  fileStore.delete(path);
  return c.json({ success: true });
});

vfsRoutes.post('/mkdir/*', async (c) => {
  const path = c.req.path.replace('/api/vfs/mkdir', '');
  const now = Date.now();
  fileStore.set(path, {
    data: new Uint8Array(0),
    type: 'directory',
    modifiedAt: now,
    createdAt: now,
  });
  return c.json({ success: true, path });
});
