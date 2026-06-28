import type { Hono } from 'hono';
import type { CellRouter as CellRouterInterface, CellRouteHandler, CellWSHandler, CellMiddleware, CellRequest, CellResponse } from '@ditto/shared';

interface RouteRegistration {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: CellRouteHandler;
}

interface WSRegistration {
  path: string;
  handler: CellWSHandler;
}

export class CellRouter implements CellRouterInterface {
  private routes: RouteRegistration[] = [];
  private wsRoutes: WSRegistration[] = [];
  private middlewares: CellMiddleware[] = [];
  private onRequest?: () => void;

  get(path: string, handler: CellRouteHandler): void {
    this.routes.push({ method: 'GET', path, handler });
  }

  post(path: string, handler: CellRouteHandler): void {
    this.routes.push({ method: 'POST', path, handler });
  }

  put(path: string, handler: CellRouteHandler): void {
    this.routes.push({ method: 'PUT', path, handler });
  }

  delete(path: string, handler: CellRouteHandler): void {
    this.routes.push({ method: 'DELETE', path, handler });
  }

  ws(path: string, handler: CellWSHandler): void {
    this.wsRoutes.push({ path, handler });
  }

  middleware(fn: CellMiddleware): void {
    this.middlewares.push(fn);
  }

  setOnRequest(fn: () => void): void {
    this.onRequest = fn;
  }

  getRoutes(): RouteRegistration[] {
    return [...this.routes];
  }

  getWSRoutes(): WSRegistration[] {
    return [...this.wsRoutes];
  }

  getMiddlewares(): CellMiddleware[] {
    return [...this.middlewares];
  }

  applyToHono(app: Hono, prefix: string): void {
    for (const route of this.routes) {
      const fullPath = `${prefix}${route.path}`;
      const honoHandler = async (c: any) => {
        this.onRequest?.();

        const req: CellRequest = {
          method: c.req.method,
          path: c.req.path,
          headers: Object.fromEntries(Object.entries(c.req.header())),
          query: c.req.query() ?? {},
          params: c.req.param() ?? {},
          body: await this.parseBody(c),
          userId: c.get('userId') ?? c.req.header('X-User-Id'),
        };

        for (const mw of this.middlewares) {
          const result = await mw(req);
          if (result) {
            return c.json(result, 403);
          }
        }

        let statusCode: number = 200;
        let responseBody: unknown = null;
        let responseHeaders: Record<string, string> = {};

        const res: CellResponse = {
          status(code: number): CellResponse {
            statusCode = code;
            return res;
          },
          json(data: unknown): void {
            responseBody = data;
          },
          text(data: string): void {
            responseBody = data;
            responseHeaders['Content-Type'] = 'text/plain';
          },
          binary(data: Uint8Array): void {
            responseBody = data;
            responseHeaders['Content-Type'] = 'application/octet-stream';
          },
        };

        try {
          await route.handler(req, res);
        } catch (e) {
          statusCode = 500;
          responseBody = {
            error: 'Internal cell error',
            message: e instanceof Error ? e.message : String(e),
          };
        }

        if (responseBody instanceof Uint8Array) {
          return new Response(responseBody, { status: statusCode, headers: responseHeaders });
        }
        return c.json(responseBody, statusCode as any, responseHeaders);
      };

      switch (route.method) {
        case 'GET':
          app.get(fullPath, honoHandler);
          break;
        case 'POST':
          app.post(fullPath, honoHandler);
          break;
        case 'PUT':
          app.put(fullPath, honoHandler);
          break;
        case 'DELETE':
          app.delete(fullPath, honoHandler);
          break;
      }
    }
  }

  private async parseBody(c: any): Promise<unknown> {
    const contentType = c.req.header('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      return c.req.json().catch(() => null);
    }
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      return c.req.parseBody().catch(() => null);
    }
    return null;
  }
}
