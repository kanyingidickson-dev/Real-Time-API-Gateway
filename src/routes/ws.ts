import type { FastifyPluginAsync } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { createUpstreamSelector } from '../lib/upstreams.js';

const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket);

  const upstreams = createUpstreamSelector(app.config.upstreams);

  app.get(
    '/ws/:service',
    { websocket: true },
    async (socket: WebSocket, req) => {
      await app.authenticate(req);

      app.metrics.websocketConnections.inc();

      const service = (req.params as { service: string }).service;
      const base = upstreams.pick(service);
      if (!base) {
        socket.close(1008, 'unknown_service');
        app.metrics.websocketConnections.dec();
        return;
      }

      const incoming = new URL(req.raw.url ?? '', 'http://localhost');
      const path = incoming.searchParams.get('path') ?? '/';

      const baseUrl = new URL(base);
      const wsBase = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const target = new URL(path, `${wsBase}//${baseUrl.host}`);

      const upstream = new WebSocket(target.toString(), {
        headers: {
          ...(typeof req.headers.authorization === 'string' ? { authorization: req.headers.authorization } : {})
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
      };

      upstream.on('close', () => {
        cleanup();
        closeBoth(1000, 'upstream_closed');
      });

      upstream.on('error', () => {
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
