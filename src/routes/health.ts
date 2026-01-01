import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ ok: true }));

  app.get('/readyz', { config: { rateLimit: false } }, async () => {
    return {
      ok: true,
      upstreamServices: Object.keys(app.config.upstreams).length
    };
  });
};

export default healthRoutes;
