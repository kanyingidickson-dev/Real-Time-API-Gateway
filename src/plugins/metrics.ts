import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import client from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry: client.Registry;
      websocketConnections: client.Gauge<string>;
    };
  }
}

const metricsPlugin: FastifyPluginAsync = async (app) => {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const httpDuration = new client.Histogram({
    name: 'gateway_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry]
  });

  const websocketConnections = new client.Gauge({
    name: 'gateway_websocket_connections',
    help: 'Number of active WebSocket connections',
    registers: [registry]
  });

  app.decorate('metrics', { registry, websocketConnections });

  app.addHook('onRequest', async (req) => {
    (req as unknown as { _startHrtime?: bigint })._startHrtime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = (req as unknown as { _startHrtime?: bigint })._startHrtime;
    if (!start) return;

    const diffNs = process.hrtime.bigint() - start;
    const seconds = Number(diffNs) / 1e9;

    const route = req.routeOptions?.url ?? 'unknown';
    httpDuration
      .labels(req.method, route, String(reply.statusCode))
      .observe(seconds);
  });

  app.get('/metrics', { config: { rateLimit: false } }, async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });
};

export default fp(metricsPlugin, { name: 'metrics' });
