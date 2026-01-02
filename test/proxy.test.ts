import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { buildApp } from '../src/app.js';

describe('proxy route', () => {
  it('proxies response bodies from upstream', async () => {
    const upstream = http.createServer((req, res) => {
      const payload = JSON.stringify({ ok: true, upstream: true, url: req.url });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('content-length', Buffer.byteLength(payload));
      res.end(payload);
    });

    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const addr = upstream.address();
    if (!addr || typeof addr === 'string') throw new Error('failed to bind upstream');

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
      upstreams: {
        example: [`http://127.0.0.1:${addr.port}`]
      },
      websocket: { maxBufferedBytes: 2_000_000, pingIntervalMs: 30_000 }
    });

    const res = await app.inject({ method: 'GET', url: '/api/example/' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/i);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
    expect(res.body).toMatch(/"upstream":true/);

    await app.close();
    await new Promise<void>((resolve, reject) =>
      upstream.close((err) => (err ? reject(err) : resolve()))
    );
  });
});
