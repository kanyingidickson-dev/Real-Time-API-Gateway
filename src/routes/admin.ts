import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Real-Time API Gateway</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1220;
      --panel: #0f172a;
      --panel2: #111c33;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --border: rgba(148, 163, 184, 0.15);
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
      --accent: #60a5fa;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: radial-gradient(1200px 800px at 10% 0%, rgba(96, 165, 250, 0.15), transparent 55%),
                  radial-gradient(900px 700px at 90% 10%, rgba(34, 197, 94, 0.08), transparent 55%),
                  var(--bg);
      color: var(--text);
    }

    header {
      padding: 24px 20px 12px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      backdrop-filter: blur(10px);
      background: rgba(11, 18, 32, 0.85);
      z-index: 10;
    }

    header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
      letter-spacing: 0.2px;
    }

    header .sub {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      align-items: center;
    }

    .pill {
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.5);
      padding: 4px 10px;
      border-radius: 999px;
    }

    main {
      padding: 18px 20px 32px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 14px;
    }

    .card {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.6));
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      overflow: hidden;
    }

    .card h2 {
      margin: 0 0 10px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat .v {
      font-size: 22px;
      font-weight: 650;
    }

    .stat .k {
      font-size: 12px;
      color: var(--muted);
    }

    .row {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }

    .good { color: var(--good); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th, td {
      text-align: left;
      padding: 10px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(17, 24, 39, 0.55);
      font-size: 12px;
      color: var(--muted);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      display: inline-block;
      background: var(--muted);
    }

    .dot.good { background: var(--good); }
    .dot.warn { background: var(--warn); }
    .dot.bad { background: var(--bad); }

    .muted { color: var(--muted); }

    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-12 { grid-column: span 12; }

    @media (max-width: 900px) {
      .span-4, .span-6 { grid-column: span 12; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Real-Time API Gateway</h1>
    <div class="sub">
      <span class="pill" id="env"></span>
      <span class="pill" id="uptime"></span>
      <span class="pill mono" id="node"></span>
      <span class="pill" id="last"></span>
    </div>
  </header>

  <main>
    <div class="grid">
      <div class="card span-4">
        <h2>Traffic</h2>
        <div class="row">
          <div class="stat">
            <div class="v" id="rps">-</div>
            <div class="k">req/s (sum)</div>
          </div>
          <div class="stat">
            <div class="v" id="errors">-</div>
            <div class="k">error rate</div>
          </div>
        </div>
      </div>

      <div class="card span-4">
        <h2>Connections</h2>
        <div class="row">
          <div class="stat">
            <div class="v" id="httpConn">-</div>
            <div class="k">HTTP</div>
          </div>
          <div class="stat">
            <div class="v" id="sseConn">-</div>
            <div class="k">SSE</div>
          </div>
          <div class="stat">
            <div class="v" id="wsConn">-</div>
            <div class="k">WebSocket</div>
          </div>
        </div>
      </div>

      <div class="card span-4">
        <h2>Health</h2>
        <div class="row">
          <div class="stat">
            <div class="v" id="services">-</div>
            <div class="k">services configured</div>
          </div>
          <div class="stat">
            <div class="v" id="healthy">-</div>
            <div class="k">healthy upstreams</div>
          </div>
        </div>
      </div>

      <div class="card span-12">
        <h2>Upstreams</h2>
        <div class="muted" style="margin-bottom: 10px; font-size: 12px;">Auto-refresh every 1s from <span class="mono">/admin/stats</span></div>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Upstreams</th>
              <th>Healthy</th>
              <th>Avg Latency</th>
              <th>Req/s</th>
              <th>Error Rate</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="servicesTable"></tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    function fmtMs(v) {
      if (v === null || v === undefined) return '-';
      const n = Number(v);
      if (!Number.isFinite(n)) return '-';
      if (n < 1) return n.toFixed(2) + 'ms';
      if (n < 1000) return Math.round(n) + 'ms';
      return (n / 1000).toFixed(2) + 's';
    }

    function fmtPct(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '-';
      return (n * 100).toFixed(2) + '%';
    }

    function fmtNum(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '-';
      if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
      return n.toFixed(1);
    }

    function uptime(v) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      const s = n % 60;
      const m = Math.floor(n / 60) % 60;
      const h = Math.floor(n / 3600);
      return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
    }

    function healthBadge(healthy, total) {
      if (total === 0) return '<span class="badge"><span class="dot bad"></span>0/0</span>';
      if (healthy === total) return '<span class="badge"><span class="dot good"></span>' + healthy + '/' + total + '</span>';
      if (healthy === 0) return '<span class="badge"><span class="dot bad"></span>0/' + total + '</span>';
      return '<span class="badge"><span class="dot warn"></span>' + healthy + '/' + total + '</span>';
    }

    function errClass(errorRate) {
      const n = Number(errorRate);
      if (!Number.isFinite(n)) return 'muted';
      if (n < 0.01) return 'good';
      if (n < 0.05) return 'warn';
      return 'bad';
    }

    function sumErrorRates(services) {
      let requests = 0;
      let errors = 0;
      for (const s of Object.values(services)) {
        for (const u of s.upstreamDetails) {
          requests += u.requestsTotal;
          errors += u.errorsTotal;
        }
      }
      return requests > 0 ? errors / requests : 0;
    }

    async function refresh() {
      const start = performance.now();
      const res = await fetch('/admin/stats', { cache: 'no-store' });
      const data = await res.json();

      document.getElementById('env').textContent = 'env: ' + data.env;
      document.getElementById('node').textContent = data.nodeVersion;
      document.getElementById('uptime').textContent = 'uptime: ' + uptime(data.uptimeSeconds);
      document.getElementById('last').textContent = 'updated: ' + new Date(data.nowMs).toLocaleTimeString();

      const services = data.services || {};
      const serviceNames = Object.keys(services);

      let totalHealthy = 0;
      let totalUpstreams = 0;
      let totalRps = 0;

      for (const s of Object.values(services)) {
        totalUpstreams += s.upstreams;
        totalHealthy += s.healthy;
        totalRps += s.rps;
      }

      document.getElementById('services').textContent = String(serviceNames.length);
      document.getElementById('healthy').textContent = totalHealthy + '/' + totalUpstreams;
      document.getElementById('rps').textContent = fmtNum(totalRps);

      const er = sumErrorRates(services);
      const erEl = document.getElementById('errors');
      erEl.textContent = fmtPct(er);
      erEl.className = 'v ' + errClass(er);

      document.getElementById('httpConn').textContent = String(data.connections?.http ?? '-');
      document.getElementById('sseConn').textContent = String(data.connections?.sse ?? '-');
      document.getElementById('wsConn').textContent = String(data.connections?.ws ?? '-');

      const tbody = document.getElementById('servicesTable');
      tbody.innerHTML = '';

      serviceNames.sort().forEach((name) => {
        const s = services[name];
        const tr = document.createElement('tr');

        const details = (s.upstreamDetails || []).map((u) => {
          const dotClass = u.healthy ? 'good' : (u.circuitOpenUntilMs ? 'bad' : 'warn');
          const status = u.healthy ? 'healthy' : (u.circuitOpenUntilMs ? 'circuit-open' : 'degraded');
          const latency = u.latency?.ewmaMs ?? u.latency?.lastMs;
          const extra = u.circuitOpenUntilMs ? ' until ' + new Date(u.circuitOpenUntilMs).toLocaleTimeString() : '';
          return '<div class="badge" style="margin: 2px 6px 2px 0;">'
            + '<span class="dot ' + dotClass + '"></span>'
            + '<span class="mono">' + u.url + '</span>'
            + '<span class="muted">(' + status + ', ' + fmtMs(latency) + ', inflight ' + (u.inflight?.http + u.inflight?.sse + u.inflight?.ws) + extra + ')</span>'
            + '</div>';
        }).join('');

        tr.innerHTML = ''
          + '<td class="mono">' + name + '</td>'
          + '<td>' + s.upstreams + '</td>'
          + '<td>' + healthBadge(s.healthy, s.upstreams) + '</td>'
          + '<td>' + fmtMs(s.avgLatencyMs) + '</td>'
          + '<td>' + fmtNum(s.rps) + '</td>'
          + '<td class="' + errClass(s.errorRate) + '">' + fmtPct(s.errorRate) + '</td>'
          + '<td>' + (details || '<span class="muted">-</span>') + '</td>';

        tbody.appendChild(tr);
      });

      const elapsed = performance.now() - start;
      if (elapsed > 750) {
        document.getElementById('last').textContent += ' (slow: ' + Math.round(elapsed) + 'ms)';
      }
    }

    refresh().catch((err) => {
      document.getElementById('last').textContent = 'error: ' + (err && err.message ? err.message : String(err));
    });

    setInterval(() => {
      refresh().catch(() => void 0);
    }, 1000);
  </script>
</body>
</html>`;

const adminRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = app.config.authRequired
    ? [async (req: FastifyRequest) => app.authenticate(req)]
    : undefined;

  app.get('/admin', { config: { rateLimit: false }, preHandler }, async (_req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    return dashboardHtml;
  });

  app.get('/admin/stats', { config: { rateLimit: false }, preHandler }, async () => {
    return app.gatewayState.snapshot();
  });
};

export default adminRoutes;
