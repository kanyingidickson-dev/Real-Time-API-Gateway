import type { UpstreamsConfig } from '../config/index.js';

export type UpstreamSelector = {
  pick: (service: string) => string | null;
  list: (service: string) => string[] | null;
};

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function createUpstreamSelector(upstreams: UpstreamsConfig): UpstreamSelector {
  const indices = new Map<string, number>();
  const normalized: UpstreamsConfig = {};

  for (const [service, urls] of Object.entries(upstreams)) {
    normalized[service] = urls.map(normalizeBaseUrl);
  }

  return {
    list(service) {
      return normalized[service] ?? null;
    },
    pick(service) {
      const urls = normalized[service];
      if (!urls || urls.length === 0) return null;

      const current = indices.get(service) ?? 0;
      const picked = urls[current % urls.length];
      indices.set(service, (current + 1) % urls.length);
      return picked;
    }
  };
}
