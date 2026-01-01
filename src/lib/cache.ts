import { LRUCache } from 'lru-cache';

export type CacheEntry = {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
  createdAtMs: number;
  ttlMs: number;
};

export type ResponseCache = {
  get: (key: string) => CacheEntry | undefined;
  set: (key: string, entry: CacheEntry) => void;
};

export function createResponseCache(): ResponseCache {
  const cache = new LRUCache<string, CacheEntry>({
    max: 500
  });

  return {
    get(key) {
      const entry = cache.get(key);
      if (!entry) return undefined;

      const age = Date.now() - entry.createdAtMs;
      if (age > entry.ttlMs) {
        cache.delete(key);
        return undefined;
      }

      return entry;
    },
    set(key, entry) {
      cache.set(key, entry);
    }
  };
}
