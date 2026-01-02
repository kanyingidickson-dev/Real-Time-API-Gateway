# Real-Time API Gateway

A high-concurrency Node.js API gateway built for low-latency delivery and long-lived connections.

## Requirements

- Node.js 20+ (see `package.json` `engines`)
- npm

## Quickstart

```bash
npm install
cp .env.example .env
npm run dev
```

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Configuration

Configuration is provided through environment variables and validated on startup. Invalid configuration fails fast.

See `.env.example` for the full list.

### `UPSTREAMS`

`UPSTREAMS` must be valid JSON. It maps service names to one or more upstream base URLs.

Example:

```env
UPSTREAMS={"users":["http://localhost:3001"],"billing":["http://localhost:3002","http://localhost:3003"]}
```

### Authentication

- If `AUTH_REQUIRED=true`, `JWT_SECRET` is required and must be at least 32 characters.
- If `AUTH_REQUIRED` is not set, it defaults to `true` in `NODE_ENV=production`, otherwise `false`.

## Endpoints

### Proxy routes

- `ANY /api/:service/*`
  - Proxies HTTP requests to one of the configured upstreams for `:service`.
- `GET|HEAD /sse/:service/*`
  - Proxies streaming/SSE-style responses.

### WebSocket bridge

- `GET /ws/:service?path=/some/ws/path` (WebSocket upgrade)
  - Bridges an incoming WebSocket connection to the upstream WebSocket URL.
  - The `path` query parameter selects the upstream WebSocket path (default `/`).

### Operational endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `GET /_pressure` (exposed by `@fastify/under-pressure`)

## Testing

```bash
npm test
```

### Docker

```bash
docker build -t real-time-api-gateway .
docker run --rm -p 8080:8080 --env-file .env real-time-api-gateway

```
