import 'dotenv/config';

import { loadConfig } from './config/index.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exitCode = 1;
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
