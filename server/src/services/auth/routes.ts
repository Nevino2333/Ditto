import { Hono } from 'hono';
import { AuthService } from './auth-service';
import { SessionManager } from './session-manager';

const authService = new AuthService();
const sessionManager = new SessionManager();

export function createAuthRoutes(): Hono {
  const router = new Hono();

  router.post('/register', async (c) => {
    const body = await c.req.json();
    const result = authService.register(body);
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
    const sessionId = sessionManager.createSession(result.user!.id);
    return c.json({
      user: result.user,
      token: result.token,
      sessionId,
    }, 201);
  });

  router.post('/login', async (c) => {
    const body = await c.req.json();
    const result = authService.login(body);
    if (!result.success) {
      return c.json({ error: result.error }, 401);
    }
    const sessionId = sessionManager.createSession(result.user!.id);
    return c.json({
      user: result.user,
      token: result.token,
      sessionId,
    });
  });

  router.post('/logout', async (c) => {
    const sessionId = c.req.header('X-Session-Id');
    if (sessionId) {
      sessionManager.destroySession(sessionId);
    }
    return c.json({ success: true });
  });

  router.get('/me', async (c) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    const userId = authService.verifyToken(token);
    if (!userId) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    const user = authService.getUser(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json({ user });
  });

  router.put('/profile', async (c) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    const userId = authService.verifyToken(token);
    if (!userId) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    const body = await c.req.json();
    const result = authService.updateUser(userId, body);
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ user: result.user });
  });

  return router;
}

export { authService, sessionManager };
