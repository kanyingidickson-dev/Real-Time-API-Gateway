/**
 * WebSocket bridge route.
 *
 * Bridges an incoming client WS to an upstream WS endpoint and applies:
 * - auth (when enabled)
 * - request tracing (`x-request-id` forwarded on the upstream handshake)
 * - buffering + backpressure guards to avoid unbounded memory growth
 */
import type { FastifyPluginAsync } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';

const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket);

  app.get(
    '/ws/:service',
    { websocket: true },
    async (socket: WebSocket, req) => {
      await app.authenticate(req);

      app.metrics.websocketConnections.inc();

      const service = (req.params as { service: string }).service;
      const base = app.gatewayState.pick(service);
      if (!base) {
        socket.close(1008, 'unknown_service');
        app.metrics.websocketConnections.dec();
        return;
      }

      const wsCtx = app.gatewayState.beginWebSocket(service, base);

      const incoming = new URL(req.raw.url ?? '', 'http://localhost');
      const path = incoming.searchParams.get('path') ?? '/';

      const baseUrl = new URL(base);
      const wsBase = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const target = new URL(path, `${wsBase}//${baseUrl.host}`);

      const upstream = new WebSocket(target.toString(), {
        headers: {
          ...(typeof req.headers.authorization === 'string' ? { authorization: req.headers.authorization } : {}),
          // Useful for correlating WS handshake and subsequent traffic with upstream logs.
          ...(typeof req.id === 'string' ? { 'x-request-id': req.id } : {})
        }
      });

      const closeBoth = (code: number, reason: string) => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
          try {
            socket.close(code, reason);
          } catch {
            void 0;
          }
        }
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CLOSING) {
          try {
            upstream.close(code, reason);
          } catch {
            void 0;
          }
        }
      };

      const pingInterval = setInterval(() => {
        try {
          if (socket.readyState === WebSocket.OPEN) socket.ping();
        } catch {
          void 0;
        }
      }, app.config.websocket.pingIntervalMs);

      const sizeOf = (data: WebSocket.RawData): number => {
        if (typeof data === 'string') return Buffer.byteLength(data);
        if (Buffer.isBuffer(data)) return data.length;
        if (data instanceof ArrayBuffer) return data.byteLength;
        if (Array.isArray(data)) return data.reduce((acc, part) => acc + part.length, 0);
        return 0;
      };

      const pending: WebSocket.RawData[] = [];
      let pendingBytes = 0;

      // Buffer client messages until the upstream is open (so early client messages aren't lost).
      // We cap buffered bytes to prevent unbounded memory usage under slow upstreams.

      const flushPending = () => {
        if (upstream.readyState !== WebSocket.OPEN) return;

        while (pending.length > 0) {
          if (upstream.bufferedAmount > app.config.websocket.maxBufferedBytes) {
            closeBoth(1013, 'backpressure');
            return;
          }

          const msg = pending.shift();
          if (!msg) break;
          pendingBytes -= sizeOf(msg);
          upstream.send(msg);
        }
      };

      socket.on('message', (data: WebSocket.RawData) => {
        if (upstream.readyState !== WebSocket.OPEN) {
          const nextBytes = pendingBytes + sizeOf(data);
          if (nextBytes > app.config.websocket.maxBufferedBytes) {
            closeBoth(1013, 'backpressure');
            return;
          }

          pending.push(data);
          pendingBytes = nextBytes;
          return;
        }

        if (upstream.bufferedAmount > app.config.websocket.maxBufferedBytes) {
          closeBoth(1013, 'backpressure');
          return;
        }

        upstream.send(data);
      });

      upstream.on('open', flushPending);

      upstream.on('message', (data: WebSocket.RawData) => {
        if (socket.readyState !== WebSocket.OPEN) return;

        if (socket.bufferedAmount > app.config.websocket.maxBufferedBytes) {
          closeBoth(1013, 'backpressure');
          return;
        }

        socket.send(data);
      });

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(pingInterval);
        app.metrics.websocketConnections.dec();
        wsCtx.close();
      };

      upstream.on('close', () => {
        cleanup();
        closeBoth(1000, 'upstream_closed');
      });

      upstream.on('open', () => {
        wsCtx.markUpstreamOpen();
      });

      upstream.on('error', () => {
        wsCtx.markUpstreamError();
        cleanup();
        closeBoth(1011, 'upstream_error');
      });

      socket.on('close', () => {
        cleanup();
        closeBoth(1000, 'client_closed');
      });
    }
  );
};

export default wsRoutes;
