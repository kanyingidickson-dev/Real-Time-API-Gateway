import 'fastify';
import type { Config } from '../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
  }
}
