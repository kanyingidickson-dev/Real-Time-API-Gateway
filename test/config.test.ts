import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('config loading', () => {
  it('parses boolean env vars correctly', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: '8080',
      LOG_LEVEL: 'silent',
      AUTH_REQUIRED: 'false',
      CACHE_ENABLED: 'false',
      UPSTREAMS: '{}'
    });

    expect(cfg.authRequired).toBe(false);
    expect(cfg.cache.enabled).toBe(false);
  });

  it('requires JWT_SECRET when auth is required', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        LOG_LEVEL: 'silent',
        AUTH_REQUIRED: 'true',
        UPSTREAMS: '{}'
      })
    ).toThrow(/JWT_SECRET is required/);
  });
});
