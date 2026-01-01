const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

export function filterRequestHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;

    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;
    if (lower === 'host') continue;

    if (Array.isArray(value)) out[key] = value.join(',');
    else out[key] = value;
  }
  return out;
}

export function applyResponseHeaders(
  reply: { header: (key: string, value: string | string[]) => void },
  headers: Headers
): void {
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (hopByHopHeaders.has(lower)) continue;

    if (lower === 'set-cookie') continue;
    reply.header(key, value);
  }

  const setCookies = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }
}
