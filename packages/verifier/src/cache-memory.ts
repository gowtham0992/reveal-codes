import type { CacheStore } from "./deps";

type Entry = Readonly<{ value: unknown; expiresAtMs: number }>;

/**
 * In-memory CacheStore. An entry is returned only while `now()` is strictly
 * before its expiry; an unparseable expiry is never stored.
 */
export function createMemoryCacheStore(opts: Readonly<{ now: () => Date }>): CacheStore {
  const entries = new Map<string, Entry>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined || opts.now().getTime() >= entry.expiresAtMs) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(entry.value);
    },
    set(key, value, expiresAt) {
      const expiresAtMs = Date.parse(expiresAt);
      if (!Number.isNaN(expiresAtMs)) entries.set(key, { value, expiresAtMs });
      return Promise.resolve();
    },
    delete(key) {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}
