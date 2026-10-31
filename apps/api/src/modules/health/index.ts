import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const checkLive = async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  const checkReady = async (request: any, reply: any) => {
    try {
      await app.sql`SELECT 1;`;
      return {
        status: 'ok',
        checks: {
          database: 'healthy',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Database check failed';
      request.log.error({ err }, 'Readiness check failed: database unavailable');
      return reply.status(503).send({
        status: 'degraded',
        checks: {
          database: 'unhealthy',
          error: message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  app.get('/live', checkLive);
  app.get('/ready', checkReady);
  app.get('/api/v1/health/live', checkLive);
  app.get('/api/v1/health/ready', checkReady);
}
