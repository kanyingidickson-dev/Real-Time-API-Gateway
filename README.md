# Real-Time API Gateway

A high-concurrency Node.js API gateway built for low-latency delivery and long-lived connections.

## Quickstart

```bash
npm install
cp .env.example .env
npm run dev
```

### Basic configuration

`UPSTREAMS` is a JSON object mapping service names to a list of base URLs.

Example:

```env
UPSTREAMS={"users":["http://localhost:3001"],"billing":["http://localhost:3002","http://localhost:3003"]}
```

## Phase 1 - Project Foundation

### Problem statement
Modern systems often need a single, hardened edge layer that can:

- Route requests to internal services reliably.
- Enforce authentication/authorization consistently.
- Protect upstreams using rate limits and backpressure.
- Support real-time delivery (thousands of concurrent connections) with predictable latency.
- Provide observability (logs, metrics, health checks) as a first-class capability.

This repository provides a production-oriented gateway implementation optimized for concurrency and operational clarity.

### Non-goals
- This is not a full service mesh.
- This is not a full API management product (developer portal, API monetization, etc.).
- This is not an identity provider.
- This does not attempt to replace upstream service-level resilience (timeouts, retries, circuit breakers) but provides safe defaults at the edge.

### Target use cases
- Low-latency fan-out to internal services.
- WebSocket edge termination and bridging to upstream WebSocket services.
- SSE endpoints for one-way streaming updates.
- Centralized auth, rate limiting, and request normalization.

### Real-time transport choice
This project supports both:

- WebSockets for bidirectional, low-latency messaging.
- SSE for simple, one-way streaming to browsers and clients that benefit from HTTP semantics.

WebSockets are the default for high-frequency, bidirectional real-time use cases. SSE is provided as a pragmatic alternative for server-to-client streaming when bidirectionality is not required.

### High-level architecture diagram (text)

Client

- HTTP requests
- WebSocket connections
- SSE connections


---

Gateway (this project)

- Routing layer
- AuthN/AuthZ
- Rate limiting
- Observability (logs/metrics/health)
- Upstream selection (basic load balancing)


---

Upstream services

- REST/HTTP services
- WebSocket services
- Event producers

## Phase 2 - Repository Setup

### Tech choices
- Node.js (latest LTS)
- TypeScript for maintainability and safer refactoring
- Fastify for high throughput and low overhead
- prom-client for metrics

### Folder structure
- `src/` application code
- `src/config/` env parsing and validation
- `src/plugins/` Fastify plugins (jwt, rate limit, metrics)
- `src/routes/` HTTP routes and real-time routes
- `src/lib/` shared utilities (upstream selection)

### Configuration strategy
Runtime configuration comes from environment variables and is validated on startup. Invalid configuration fails fast.

### Environment variables
See `.env.example`.

## Phase 3 - Core Gateway Implementation
Implemented in `src/app.ts` and `src/index.ts`.

## Phase 4 - Scalability & Performance
- Keep per-request allocations low.
- Prefer streaming proxying for large responses.
- Avoid blocking operations on the event loop.

## Phase 5 - Security & Reliability
- JWT auth
- Rate limiting
- Timeouts and safe defaults

## Phase 6 - Observability
- Structured logging
- Prometheus metrics at `/metrics`
- Health endpoints: `/healthz`, `/readyz`

### Operational endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `GET /_pressure` (exposed by `@fastify/under-pressure`)

## Phase 7 - Testing & Quality
- Unit and integration tests with Vitest

```bash
npm run test
```

## Phase 8 - Deployment & Production Readiness
- Dockerfile and runtime configuration
- Recommended scaling strategy and checklist

### Gateway endpoints

- `ANY /api/:service/*`
  - Proxies HTTP requests to one of the configured upstreams for `:service`.
- `GET /ws/:service?path=/some/ws/path`
  - Bridges an incoming WebSocket connection to an upstream WebSocket endpoint.
- `GET /sse/:service/*`
  - Proxies SSE / streaming HTTP responses.

### Docker

```bash
docker build -t real-time-api-gateway .
docker run --rm -p 8080:8080 --env-file .env real-time-api-gateway

```
