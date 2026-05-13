import { Hono } from 'hono';
import type { AppCellManager } from '../app-cell/manager';
import type { AppManifest } from '@ditto/shared';
import { Packager } from '@ditto/packager';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function createInstallRoutes(cellManager: AppCellManager, appsDir: string): Hono {
  const router = new Hono();
  const packager = new Packager();

  router.post('/install', async (c) => {
    const contentType = c.req.header('Content-Type') ?? '';
    const filename = c.req.header('X-Filename') ?? 'app.dit';
    const decryptPassword = c.req.header('X-Decrypt-Password');

    const body = await c.req.arrayBuffer();
    const buffer = Buffer.from(body);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ditto-install-'));
    let tempFile = path.join(tempDir, filename);

    try {
      fs.writeFileSync(tempFile, buffer);

      if (decryptPassword) {
        try {
          const decryptedPath = await packager.decrypt(tempFile, decryptPassword);
          tempFile = decryptedPath;
        } catch (e) {
          return c.json({ error: 'Decryption failed', message: e instanceof Error ? e.message : String(e) }, 400);
        }
      }

      const validation = await packager.validate(tempFile);
      if (!validation.valid) {
        return c.json({ error: 'Invalid package', details: validation.errors }, 400);
      }

      const appDir = path.join(appsDir, filename.replace(/\.(dit|ditx|ditc|ditz)$/, ''));
      fs.mkdirSync(appDir, { recursive: true });

      const unpackResult = await packager.unpack(tempFile, appDir);

      cellManager.registerApp(unpackResult.manifest.id, unpackResult.manifest, path.join(appDir, 'backend'));

      return c.json({
        success: true,
        id: unpackResult.manifest.id,
        name: unpackResult.manifest.name,
        version: unpackResult.manifest.version,
        type: unpackResult.type,
        hasBackend: !!unpackResult.manifest.backend,
        hasEncryption: unpackResult.hasEncryption,
        hasSignature: unpackResult.hasSignature,
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Installation failed' }, 500);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  router.delete('/uninstall/:appId', async (c) => {
    const appId = c.req.param('appId');

    const installed = cellManager.getInstalledApp(appId);
    if (!installed) {
      return c.json({ error: 'App not found' }, 404);
    }

    cellManager.unregisterApp(appId);

    const appDir = path.dirname(installed.backendDir);
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }

    return c.json({ success: true, appId, name: installed.manifest.name });
  });

  router.get('/list', (c) => {
    const apps = cellManager.getInstalledApps();
    const result = [...apps.entries()].map(([id, data]) => ({
      id,
      name: data.manifest.name,
      version: data.manifest.version,
      description: data.manifest.description,
      icon: data.manifest.icon,
      type: data.manifest.type ?? 'app',
      hasBackend: !!data.manifest.backend,
      category: data.manifest.category,
    }));
    return c.json({ apps: result, total: result.length });
  });

  router.get('/:appId/info', (c) => {
    const appId = c.req.param('appId');
    const installed = cellManager.getInstalledApp(appId);
    if (!installed) {
      return c.json({ error: 'App not found' }, 404);
    }

    const cells = cellManager.getCellsByApp(appId);
    return c.json({
      manifest: installed.manifest,
      hasBackend: !!installed.manifest.backend,
      runningCells: cells.filter(c => c.toCellInstance().status === 'running').length,
      hibernatedCells: cells.filter(c => c.toCellInstance().status === 'hibernated').length,
    });
  });

  router.get('/:appId/frontend/*', async (c) => {
    const appId = c.req.param('appId');
    const filePath = c.req.path.replace(`/api/apps/${appId}/frontend/`, '');

    const installed = cellManager.getInstalledApp(appId);
    if (!installed) {
      return c.json({ error: 'App not found' }, 404);
    }

    const appDir = path.dirname(installed.backendDir);
    const frontendPath = path.join(appDir, 'frontend', filePath);

    if (!fs.existsSync(frontendPath)) {
      const indexPath = path.join(appDir, 'frontend', 'index.html');
      if (fs.existsSync(indexPath) && !filePath.includes('.')) {
        const indexData = fs.readFileSync(indexPath);
        c.header('Content-Type', 'text/html');
        return c.body(indexData);
      }
      return c.json({ error: 'File not found' }, 404);
    }

    const stat = fs.statSync(frontendPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        const data = fs.readFileSync(indexPath);
        c.header('Content-Type', 'text/html');
        return c.body(data);
      }
      return c.json({ error: 'Directory listing not allowed' }, 403);
    }

    const data = fs.readFileSync(frontendPath);

    const ext = path.extname(frontendPath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.webmanifest': 'application/manifest+json',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.map': 'application/json',
    };

    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    c.header('Content-Type', contentType);
    c.header('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');

    return c.body(data);
  });

  return router;
}
