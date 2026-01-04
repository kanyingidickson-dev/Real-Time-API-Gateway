import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('admin endpoints', () => {
  it('serves the dashboard HTML when auth is not required', async () => {
    const app = buildApp({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      authRequired: false,
      jwtSecret: undefined,
      rateLimit: { max: 1000, windowMs: 60_000 },
      httpProxyTimeoutMs: 10_000,
      cache: { enabled: false, defaultTtlMs: 1000, maxBodyBytes: 262_144 },
      underPressure: { maxEventLoopDelayMs: 5_000 },
      upstreams: {},
      websocket: { maxBufferedBytes: 2_000_000, pingIntervalMs: 30_000 }
    });

    const res = await app.inject({ method: 'GET', url: '/admin' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/i);
    expect(res.body).toMatch(/Real-Time API Gateway/);

    await app.close();
  });

  it('exposes stats json at /admin/stats when auth is not required', async () => {
    const app = buildApp({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      authRequired: false,
      jwtSecret: undefined,
      rateLimit: { max: 1000, windowMs: 60_000 },
      httpProxyTimeoutMs: 10_000,
      cache: { enabled: false, defaultTtlMs: 1000, maxBodyBytes: 262_144 },
      underPressure: { maxEventLoopDelayMs: 5_000 },
      upstreams: {},
      websocket: { maxBufferedBytes: 2_000_000, pingIntervalMs: 30_000 }
    });

    const res = await app.inject({ method: 'GET', url: '/admin/stats' });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data).toHaveProperty('uptimeSeconds');
    expect(data).toHaveProperty('nodeVersion');
    expect(data).toHaveProperty('env');
    expect(data).toHaveProperty('services');
    expect(data).toHaveProperty('connections');

    await app.close();
  });

  it('requires auth for /admin when authRequired is true', async () => {
    const app = buildApp({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      authRequired: true,
      jwtSecret: 'x'.repeat(32),
      rateLimit: { max: 1000, windowMs: 60_000 },
      httpProxyTimeoutMs: 10_000,
      cache: { enabled: false, defaultTtlMs: 1000, maxBodyBytes: 262_144 },
      underPressure: { maxEventLoopDelayMs: 5_000 },
      upstreams: {},
      websocket: { maxBufferedBytes: 2_000_000, pingIntervalMs: 30_000 }
    });

    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(401);

    await app.close();
  });
});
