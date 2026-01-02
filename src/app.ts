import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import type { Config } from './config/index.js';
import authPlugin from './plugins/auth.js';
import metricsPlugin from './plugins/metrics.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import healthRoutes from './routes/health.js';
import proxyRoutes from './routes/proxy.js';
import wsRoutes from './routes/ws.js';
import sseRoutes from './routes/sse.js';

export function buildApp(config: Config) {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.decorate('config', config);

  // Accept any content-type without parsing (proxy raw bytes)
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => done(null, body));

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

  app.register(healthRoutes);
  app.register(proxyRoutes);
  app.register(wsRoutes);
  app.register(sseRoutes);

  return app;
}
