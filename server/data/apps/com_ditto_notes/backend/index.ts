import type { AppCellModule, CellContext, CellRouter } from '@ditto/shared';

const module: AppCellModule = {
  async onInit(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Notes backend initialized');
  },
  async onStart(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Notes backend started');
  },
  async onStop(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Notes backend stopped');
  },
  async onDestroy(ctx: CellContext): Promise<void> {
    ctx.logger.info('Ditto Notes backend destroyed');
  },
  registerRoutes(router: CellRouter): void {
    router.get('/health', async (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now(), app: 'com.ditto.notes' });
    });
    router.get('/stats', async (req, res) => {
      res.json({
        totalNotes: 0,
        lastUpdated: new Date().toISOString(),
        userId: req.userId,
      });
    });
  },
};

export default module;
