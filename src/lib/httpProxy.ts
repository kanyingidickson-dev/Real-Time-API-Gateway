/**
 * Low-level HTTP proxy helper.
 *
 * - Forwards method/headers/body to an upstream URL using `fetch`
 * - Propagates `x-request-id` and standard `x-forwarded-*` headers
 * - Streams upstream responses back to the client (including SSE)
 * - Optionally buffers small GET responses so higher layers can cache safely
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { applyResponseHeaders, filterRequestHeaders } from './headers.js';

export type ProxyResult = {
  statusCode: number;
  upstreamMs?: number;
  cached?: {
    headers: Record<string, string | string[]>;
    body: Buffer;
  };
};

function buildRequestBody(req: FastifyRequest): BodyInit | undefined {
  const body = (req as unknown as { body?: unknown }).body;
  if (body === undefined || body === null) return undefined;

  if (Buffer.isBuffer(body)) return body as unknown as BodyInit;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return body as unknown as BodyInit;

  if (typeof body === 'object') {
    return JSON.stringify(body);
  }

  return String(body);
}

function appendForwardedHeaders(
  req: FastifyRequest,
  headers: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = { ...headers };

  // Request tracing: ensure an ID exists on the upstream hop.
  if (!out['x-request-id'] && !out['X-Request-Id'] && typeof req.id === 'string') {
    out['x-request-id'] = req.id;
  }

  // Standard forwarding headers (the gateway is commonly deployed behind another proxy as well).
  const remote = req.ip ?? req.socket.remoteAddress ?? '';
  const prevFor = out['x-forwarded-for'] ?? out['X-Forwarded-For'];
  if (remote) {
    out['x-forwarded-for'] = prevFor ? `${prevFor}, ${remote}` : remote;
  }

  if (!out['x-forwarded-proto'] && !out['X-Forwarded-Proto']) {
    out['x-forwarded-proto'] = req.protocol;
  }

  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  if (host && !out['x-forwarded-host'] && !out['X-Forwarded-Host']) {
    out['x-forwarded-host'] = host;
  }

  const port = req.socket.localPort ? String(req.socket.localPort) : '';
  if (port && !out['x-forwarded-port'] && !out['X-Forwarded-Port']) {
    out['x-forwarded-port'] = port;
  }

  return out;
}

export async function proxyHttp(
  req: FastifyRequest,
  reply: FastifyReply,
  targetUrl: URL,
  timeoutMs: number,
  cacheMaxBodyBytes?: number
): Promise<ProxyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestStart = process.hrtime.bigint();
  let upstreamMs: number | undefined;

  try {
    const headers = appendForwardedHeaders(
      req,
      filterRequestHeaders(req.headers as Record<string, string | string[] | undefined>)
    );

    const method = req.method;
    const hasBody = method !== 'GET' && method !== 'HEAD';

    const parsedBody = (req as unknown as { body?: unknown }).body;
    const body = hasBody
      ? parsedBody === undefined
        ? (req.raw as unknown as BodyInit)
        : buildRequestBody(req)
      : undefined;

    const useDuplex = hasBody && parsedBody === undefined;

    if (hasBody && body && (typeof body === 'string' || Buffer.isBuffer(body))) {
      const ct = headers['content-type'] ?? headers['Content-Type'];
      const inferredJson = typeof parsedBody === 'object' && parsedBody !== null && !Buffer.isBuffer(parsedBody);
      if (!ct && inferredJson) {
        headers['content-type'] = 'application/json; charset=utf-8';
      }
    }

    let upstreamRes: Response;
    try {
      const init: RequestInit & { duplex?: 'half' } = {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal
      };

      if (useDuplex) {
        init.duplex = 'half';
      }

      upstreamRes = await fetch(targetUrl, init);
      upstreamMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
    } catch (err) {
      upstreamMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
      if (controller.signal.aborted) {
        reply.code(504);
        reply.send({ error: 'upstream_timeout', message: 'Upstream request timed out' });
        return { statusCode: 504, upstreamMs };
      }

      reply.code(502);
      reply.send({ error: 'upstream_unavailable', message: 'Failed to reach upstream' });
      req.log.warn({ err }, 'upstream request failed');
      return { statusCode: 502, upstreamMs };
    }

    const contentType = upstreamRes.headers.get('content-type') ?? 'application/octet-stream';
    const cacheControl = upstreamRes.headers.get('cache-control') ?? '';
    const isEventStream = contentType.includes('text/event-stream');

    if (!upstreamRes.body || method === 'HEAD') {
      reply.code(upstreamRes.status);
      applyResponseHeaders(reply, upstreamRes.headers);
      if (typeof req.id === 'string') reply.header('x-request-id', req.id);
      reply.send();
      return { statusCode: upstreamRes.status, upstreamMs };
    }

    const lengthHeader = upstreamRes.headers.get('content-length');
    const contentLength = lengthHeader ? Number(lengthHeader) : null;

    const canBufferForCache =
      cacheMaxBodyBytes !== undefined &&
      method === 'GET' &&
      !isEventStream &&
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength <= cacheMaxBodyBytes &&
      !cacheControl.toLowerCase().includes('no-store') &&
      !cacheControl.toLowerCase().includes('private');

    // Caching is intentionally conservative: only buffer responses with a known (and small)
    // content-length to avoid unbounded memory growth.
    if (canBufferForCache) {
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      reply.code(upstreamRes.status);
      applyResponseHeaders(reply, upstreamRes.headers);
      if (typeof req.id === 'string') reply.header('x-request-id', req.id);
      reply.send(buf);
      return {
        statusCode: upstreamRes.status,
        upstreamMs,
        cached: {
          headers: {
            'content-type': contentType
          },
          body: buf
        }
      };
    }

    // Streaming path: we hijack the Fastify reply and pipe bytes directly to the raw socket.
    reply.hijack();
    reply.raw.statusCode = upstreamRes.status;
    applyResponseHeaders(
      { header: (key, value) => reply.raw.setHeader(key, value) },
      upstreamRes.headers
    );
    if (typeof req.id === 'string') reply.raw.setHeader('x-request-id', req.id);
    const stream = Readable.fromWeb(upstreamRes.body as unknown as NodeReadableStream<Uint8Array>);
    try {
      await pipeline(stream, reply.raw);
    } catch (err) {
      req.log.warn({ err }, 'upstream response stream failed');
    }

    return { statusCode: upstreamRes.status, upstreamMs };
  } finally {
    clearTimeout(timeout);
  }
}
