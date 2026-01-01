import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createResponseCache } from '../lib/cache.js';
import { proxyHttp } from '../lib/httpProxy.js';
import { createUpstreamSelector } from '../lib/upstreams.js';

const proxyRoutes: FastifyPluginAsync = async (app) => {
  const upstreams = createUpstreamSelector(app.config.upstreams);
  const cache = app.config.cache.enabled ? createResponseCache() : null;

  const preHandler = app.config.authRequired
    ? [async (req: FastifyRequest) => app.authenticate(req)]
    : undefined;

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    url: '/api/:service/*',
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

      const hasUserContext =
        typeof req.headers.authorization === 'string' || typeof req.headers.cookie === 'string';

      const cacheKey =
        cache && req.method === 'GET' && !hasUserContext ? `${service}:${target.toString()}` : null;

      if (cache && cacheKey) {
        const cached = cache.get(cacheKey);
        if (cached) {
          reply.code(cached.status);
          for (const [k, v] of Object.entries(cached.headers)) reply.header(k, v);
          reply.send(cached.body);
          return;
        }
      }

      const result = await proxyHttp(
        req,
        reply,
        target,
        app.config.httpProxyTimeoutMs,
        cache ? app.config.cache.maxBodyBytes : undefined
      );

      if (cache && cacheKey && result.cached && result.statusCode >= 200 && result.statusCode < 300) {
        cache.set(cacheKey, {
          status: result.statusCode,
          headers: result.cached.headers,
          body: result.cached.body,
          createdAtMs: Date.now(),
          ttlMs: app.config.cache.defaultTtlMs
        });
      }
    }
  });
};

export default proxyRoutes;
