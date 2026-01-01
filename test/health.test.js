import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
describe('health endpoints', () => {
    it('returns 200 from /healthz', async () => {
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
        const res = await app.inject({ method: 'GET', url: '/healthz' });
        expect(res.statusCode).toBe(200);
        await app.close();
    });
});
//# sourceMappingURL=health.test.js.map