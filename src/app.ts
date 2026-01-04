/**
 * Fastify application factory.
 *
 * Responsibilities:
 * - Configure request ID generation/propagation (`x-request-id`)
 * - Register core plugins (metrics, rate limiting, auth, gateway runtime state)
 * - Register gateway routes (health/admin/proxy/ws/sse)
 */
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import type { Config } from './config/index.js';
import authPlugin from './plugins/auth.js';
import metricsPlugin from './plugins/metrics.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import gatewayStatePlugin from './plugins/gatewayState.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';
import proxyRoutes from './routes/proxy.js';
import wsRoutes from './routes/ws.js';
import sseRoutes from './routes/sse.js';

export function buildApp(config: Config) {
  const app = Fastify({
    logger: {
      level: config.logLevel
    },
    genReqId: (req) => {
      // Preserve an incoming request id (if present) so tracing can be correlated across hops.
      const incoming = req.headers['x-request-id'];
      const requestId = Array.isArray(incoming) ? incoming[0] : incoming;
      if (typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128) {
        return requestId;
      }
      return randomUUID();
    }
  });

  app.decorate('config', config);

  // This gateway forwards payloads to upstreams. Parsing/validating arbitrary content-types would
  // cause avoidable 415 errors and extra overhead.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => done(null, body));

  app.addHook('onRequest', async (req, reply) => {
    // Make request IDs visible to callers (and easy to correlate with upstream logs).
    if (typeof req.id === 'string') {
      reply.header('x-request-id', req.id);
    }
  });

  app.register(sensible);

  app.register(underPressure, {
    maxEventLoopDelay: config.underPressure.maxEventLoopDelayMs,
    maxHeapUsedBytes: config.underPressure.maxHeapUsedBytes,
    maxRssBytes: config.underPressure.maxRssBytes,
    exposeStatusRoute: {
      url: '/_pressure',
      routeOpts: {
        config: {
          rateLimit: false
        }
      }
    }
  });

  app.register(metricsPlugin);
  app.register(rateLimitPlugin);
  app.register(authPlugin);
  app.register(gatewayStatePlugin);

  app.register(healthRoutes);
  app.register(adminRoutes);
  app.register(proxyRoutes);
  app.register(wsRoutes);
  app.register(sseRoutes);

  return app;
}
