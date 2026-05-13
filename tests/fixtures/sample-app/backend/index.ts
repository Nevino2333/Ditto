import type { AppCellModule, CellContext, CellRouter } from '@ditto/shared';

const module: AppCellModule = {
  async onInit(ctx: CellContext): Promise<void> {
    ctx.logger.info('Sample app backend initialized');
  },

  async onStart(ctx: CellContext): Promise<void> {
    ctx.logger.info('Sample app backend started');
  },

  async onStop(ctx: CellContext): Promise<void> {
    ctx.logger.info('Sample app backend stopped');
  },

  async onDestroy(ctx: CellContext): Promise<void> {
    ctx.logger.info('Sample app backend destroyed');
  },

  registerRoutes(router: CellRouter): void {
    router.get('/health', async (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    router.get('/data', async (req, res) => {
      res.json({ message: 'Hello from sample app backend!', userId: req.userId });
    });

    router.post('/echo', async (req, res) => {
      res.json({ echo: req.body });
    });
  },
};

export default module;
