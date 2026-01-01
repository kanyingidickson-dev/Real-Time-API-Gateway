import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  if (!app.config.jwtSecret) {
    app.decorate('authenticate', async () => {
      if (app.config.authRequired) {
        throw app.httpErrors.unauthorized('Authentication is required');
      }
    });

    return;
  }

  await app.register(fastifyJwt, {
    secret: app.config.jwtSecret
  });

  app.decorate('authenticate', async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      if (app.config.authRequired) {
        throw app.httpErrors.unauthorized('Invalid or missing token');
      }
    }
  });
};

export default fp(authPlugin, { name: 'auth' });
