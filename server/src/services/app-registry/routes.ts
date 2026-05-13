import { Hono } from 'hono';

const appRegistry = new Map<string, {
  id: string;
  name: string;
  version: string;
  entryUrl: string;
  iconUrl?: string;
  description?: string;
  registeredAt: number;
}>();

export const appRegistryRoutes = new Hono();

appRegistryRoutes.get('/', (c) => {
  return c.json([...appRegistry.values()]);
});

appRegistryRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ id: string; name: string; version: string; entryUrl: string; iconUrl?: string; description?: string }>();

  if (!body.id || !body.name || !body.entryUrl) {
    return c.json({ error: 'id, name, and entryUrl are required' }, 400);
  }

  appRegistry.set(body.id, {
    ...body,
    registeredAt: Date.now(),
  });

  return c.json({ success: true, id: body.id });
});

appRegistryRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  appRegistry.delete(id);
  return c.json({ success: true });
});
