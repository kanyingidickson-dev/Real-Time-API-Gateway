import 'fastify';
import type { Config } from '../config/index.js';
import type { GatewayState } from '../plugins/gatewayState.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    gatewayState: GatewayState;
  }
}
