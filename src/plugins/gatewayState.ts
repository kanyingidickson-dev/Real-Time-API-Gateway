import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

type UpstreamRuntime = {
  service: string;
  url: string;
  inflightHttp: number;
  inflightSse: number;
  inflightWs: number;
  requestsTotal: number;
  errorsTotal: number;
  lastLatencyMs: number | null;
  ewmaLatencyMs: number | null;
  rps: number;
  lastRpsSampleAtMs: number;
  lastRpsSampleRequestsTotal: number;
  failureTimestampsMs: number[];
  circuitOpenUntilMs: number;
};

type ServiceRuntime = {
  urls: string[];
  rrIndex: number;
};

export type UpstreamSnapshot = {
  url: string;
  healthy: boolean;
  circuitOpenUntilMs: number | null;
  inflight: {
    http: number;
    sse: number;
    ws: number;
  };
  requestsTotal: number;
  errorsTotal: number;
  rps: number;
  latency: {
    ewmaMs: number | null;
    lastMs: number | null;
  };
};

export type ServiceSnapshot = {
  upstreams: number;
  healthy: number;
  avgLatencyMs: number | null;
  rps: number;
  errorRate: number;
  upstreamDetails: UpstreamSnapshot[];
};

export type GatewaySnapshot = {
  nowMs: number;
  uptimeSeconds: number;
  nodeVersion: string;
  env: string;
  services: Record<string, ServiceSnapshot>;
  connections: {
    http: number;
    sse: number;
    ws: number;
  };
};

export type GatewayRequestContext = {
  finish: (statusCode: number, upstreamMs?: number) => void;
};

export type GatewayWebSocketContext = {
  markUpstreamOpen: () => void;
  markUpstreamError: () => void;
  close: () => void;
};

export type GatewayState = {
  list: (service: string) => string[] | null;
  pick: (service: string) => string | null;
  beginHttp: (service: string, upstreamUrl: string) => GatewayRequestContext;
  beginSse: (service: string, upstreamUrl: string) => GatewayRequestContext;
  beginWebSocket: (service: string, upstreamUrl: string) => GatewayWebSocketContext;
  snapshot: () => GatewaySnapshot;
};

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function keyFor(service: string, url: string): string {
  return `${service}::${url}`;
}

const failureThreshold = 5;
const failureWindowMs = 10_000;
const circuitOpenMs = 15_000;
const latencyAlpha = 0.2;

function updateLatency(upstream: UpstreamRuntime, latencyMs: number): void {
  upstream.lastLatencyMs = latencyMs;
  upstream.ewmaLatencyMs =
    upstream.ewmaLatencyMs === null ? latencyMs : upstream.ewmaLatencyMs * (1 - latencyAlpha) + latencyMs * latencyAlpha;
}

function trimFailures(upstream: UpstreamRuntime, nowMs: number): void {
  const cutoff = nowMs - failureWindowMs;
  while (upstream.failureTimestampsMs.length > 0 && upstream.failureTimestampsMs[0] < cutoff) {
    upstream.failureTimestampsMs.shift();
  }
}

function isCircuitOpen(upstream: UpstreamRuntime, nowMs: number): boolean {
  return upstream.circuitOpenUntilMs > nowMs;
}

function recordFailure(upstream: UpstreamRuntime, nowMs: number): void {
  trimFailures(upstream, nowMs);
  upstream.failureTimestampsMs.push(nowMs);
  trimFailures(upstream, nowMs);

  if (upstream.failureTimestampsMs.length >= failureThreshold) {
    upstream.circuitOpenUntilMs = nowMs + circuitOpenMs;
    upstream.failureTimestampsMs = [];
  }
}

function recordSuccess(upstream: UpstreamRuntime): void {
  upstream.failureTimestampsMs = [];
  upstream.circuitOpenUntilMs = 0;
}

function scoreUpstream(upstream: UpstreamRuntime): number {
  const inflight = upstream.inflightHttp + upstream.inflightSse + upstream.inflightWs;
  const latency = upstream.ewmaLatencyMs ?? upstream.lastLatencyMs ?? 0;
  return inflight * 1000 + latency;
}

const gatewayStatePlugin: FastifyPluginAsync = async (app) => {
  const services = new Map<string, ServiceRuntime>();
  const upstreams = new Map<string, UpstreamRuntime>();

  for (const [service, urls] of Object.entries(app.config.upstreams)) {
    const normalized = urls.map(normalizeBaseUrl);
    services.set(service, { urls: normalized, rrIndex: 0 });
    for (const url of normalized) {
      const k = keyFor(service, url);
      upstreams.set(k, {
        service,
        url,
        inflightHttp: 0,
        inflightSse: 0,
        inflightWs: 0,
        requestsTotal: 0,
        errorsTotal: 0,
        lastLatencyMs: null,
        ewmaLatencyMs: null,
        rps: 0,
        lastRpsSampleAtMs: Date.now(),
        lastRpsSampleRequestsTotal: 0,
        failureTimestampsMs: [],
        circuitOpenUntilMs: 0
      });
    }
  }

  const getUpstream = (service: string, url: string): UpstreamRuntime => {
    const normalized = normalizeBaseUrl(url);
    const k = keyFor(service, normalized);
    const existing = upstreams.get(k);
    if (existing) return existing;

    const created: UpstreamRuntime = {
      service,
      url: normalized,
      inflightHttp: 0,
      inflightSse: 0,
      inflightWs: 0,
      requestsTotal: 0,
      errorsTotal: 0,
      lastLatencyMs: null,
      ewmaLatencyMs: null,
      rps: 0,
      lastRpsSampleAtMs: Date.now(),
      lastRpsSampleRequestsTotal: 0,
      failureTimestampsMs: [],
      circuitOpenUntilMs: 0
    };

    upstreams.set(k, created);
    return created;
  };

  const sampleRps = (u: UpstreamRuntime, nowMs: number): void => {
    const elapsedMs = nowMs - u.lastRpsSampleAtMs;
    if (elapsedMs <= 0) return;

    const delta = u.requestsTotal - u.lastRpsSampleRequestsTotal;
    u.rps = (delta * 1000) / elapsedMs;
    u.lastRpsSampleAtMs = nowMs;
    u.lastRpsSampleRequestsTotal = u.requestsTotal;
  };

  const beginRequest = (kind: 'http' | 'sse', service: string, url: string): GatewayRequestContext => {
    const u = getUpstream(service, url);
    if (kind === 'http') u.inflightHttp += 1;
    else u.inflightSse += 1;

    u.requestsTotal += 1;
    const startedAt = Date.now();
    sampleRps(u, startedAt);

    let finished = false;
    return {
      finish: (statusCode, upstreamMs) => {
        if (finished) return;
        finished = true;

        if (kind === 'http') u.inflightHttp = Math.max(0, u.inflightHttp - 1);
        else u.inflightSse = Math.max(0, u.inflightSse - 1);

        const now = Date.now();
        sampleRps(u, now);

        if (typeof upstreamMs === 'number' && Number.isFinite(upstreamMs) && upstreamMs >= 0) {
          updateLatency(u, upstreamMs);
        }

        const failed = statusCode >= 500;
        if (failed) {
          u.errorsTotal += 1;
          recordFailure(u, now);
        } else if (u.circuitOpenUntilMs > 0) {
          recordSuccess(u);
        }
      }
    };
  };

  const state: GatewayState = {
    list(service) {
      return services.get(service)?.urls ?? null;
    },

    pick(service) {
      const svc = services.get(service);
      if (!svc || svc.urls.length === 0) return null;

      const now = Date.now();
      const all = svc.urls.map((url) => getUpstream(service, url));
      const healthy = all.filter((u) => !isCircuitOpen(u, now));
      const pool = healthy.length > 0 ? healthy : all;

      let bestScore = Number.POSITIVE_INFINITY;
      const best: UpstreamRuntime[] = [];

      for (const u of pool) {
        const score = scoreUpstream(u);
        if (score < bestScore) {
          bestScore = score;
          best.length = 0;
          best.push(u);
        } else if (score === bestScore) {
          best.push(u);
        }
      }

      const idx = svc.rrIndex % best.length;
      svc.rrIndex = (svc.rrIndex + 1) % Number.MAX_SAFE_INTEGER;
      return best[idx]?.url ?? pool[0]?.url ?? null;
    },

    beginHttp(service, upstreamUrl) {
      return beginRequest('http', service, upstreamUrl);
    },

    beginSse(service, upstreamUrl) {
      return beginRequest('sse', service, upstreamUrl);
    },

    beginWebSocket(service, upstreamUrl) {
      const u = getUpstream(service, upstreamUrl);
      u.inflightWs += 1;

      const startedAt = Date.now();
      u.requestsTotal += 1;
      sampleRps(u, startedAt);

      let closed = false;
      return {
        markUpstreamOpen: () => {
          if (u.circuitOpenUntilMs > 0) recordSuccess(u);
        },
        markUpstreamError: () => {
          const now = Date.now();
          u.errorsTotal += 1;
          recordFailure(u, now);
          sampleRps(u, now);
        },
        close: () => {
          if (closed) return;
          closed = true;
          u.inflightWs = Math.max(0, u.inflightWs - 1);
        }
      };
    },

    snapshot() {
      const now = Date.now();

      const servicesOut: Record<string, ServiceSnapshot> = {};
      let totalHttp = 0;
      let totalSse = 0;
      let totalWs = 0;

      for (const [service, svc] of services.entries()) {
        const upstreamDetails: UpstreamSnapshot[] = [];
        let healthy = 0;
        let latencySum = 0;
        let latencyCount = 0;
        let requestsTotal = 0;
        let errorsTotal = 0;
        let rpsSum = 0;

        for (const url of svc.urls) {
          const u = getUpstream(service, url);
          sampleRps(u, now);

          const open = isCircuitOpen(u, now);
          if (!open) healthy += 1;

          totalHttp += u.inflightHttp;
          totalSse += u.inflightSse;
          totalWs += u.inflightWs;

          const latency = u.ewmaLatencyMs ?? u.lastLatencyMs;
          if (latency !== null) {
            latencySum += latency;
            latencyCount += 1;
          }

          requestsTotal += u.requestsTotal;
          errorsTotal += u.errorsTotal;
          rpsSum += u.rps;

          upstreamDetails.push({
            url: u.url,
            healthy: !open,
            circuitOpenUntilMs: open ? u.circuitOpenUntilMs : null,
            inflight: { http: u.inflightHttp, sse: u.inflightSse, ws: u.inflightWs },
            requestsTotal: u.requestsTotal,
            errorsTotal: u.errorsTotal,
            rps: u.rps,
            latency: { ewmaMs: u.ewmaLatencyMs, lastMs: u.lastLatencyMs }
          });
        }

        const avgLatencyMs = latencyCount > 0 ? latencySum / latencyCount : null;
        const errorRate = requestsTotal > 0 ? errorsTotal / requestsTotal : 0;

        servicesOut[service] = {
          upstreams: svc.urls.length,
          healthy,
          avgLatencyMs,
          rps: rpsSum,
          errorRate,
          upstreamDetails
        };
      }

      return {
        nowMs: now,
        uptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        env: app.config.nodeEnv,
        services: servicesOut,
        connections: {
          http: totalHttp,
          sse: totalSse,
          ws: totalWs
        }
      };
    }
  };

  app.decorate('gatewayState', state);
};

export default fp(gatewayStatePlugin, { name: 'gatewayState' });
