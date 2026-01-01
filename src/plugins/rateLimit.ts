import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';

const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    max: app.config.rateLimit.max,
    timeWindow: app.config.rateLimit.windowMs,
    hook: 'onRequest'
  });
};

export default fp(rateLimitPlugin, { name: 'rateLimit' });
