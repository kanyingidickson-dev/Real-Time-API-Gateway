import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createUpstreamSelector } from '../lib/upstreams.js';
import { proxyHttp } from '../lib/httpProxy.js';

const sseRoutes: FastifyPluginAsync = async (app) => {
  const upstreams = createUpstreamSelector(app.config.upstreams);
  const preHandler = app.config.authRequired
    ? [async (req: FastifyRequest) => app.authenticate(req)]
    : undefined;

  app.route({
    method: ['GET', 'HEAD'],
    url: '/sse/:service/*',
    preHandler,
    handler: async (req, reply) => {
      const service = (req.params as { service: string }).service;
      const wildcard = (req.params as { '*': string | undefined })['*'] ?? '';

      const base = upstreams.pick(service);
      if (!base) {
        reply.code(404);
        return { error: 'unknown_service', message: `No upstream configured for service: ${service}` };
      }

      const incoming = new URL(req.raw.url ?? '', 'http://localhost');
      const target = new URL(`/${wildcard}`, base);
      target.search = incoming.search;

      reply.header('cache-control', 'no-cache');
      reply.header('connection', 'keep-alive');

      await proxyHttp(req, reply, target, app.config.httpProxyTimeoutMs);
    }
  });
};

export default sseRoutes;
