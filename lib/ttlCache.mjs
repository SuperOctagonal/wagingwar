// Small in-memory cache with a per-entry TTL and a hard size cap, for the
// module-level caches in this persistent Node process (Render), which
// previously only checked freshness on read and never removed anything.
//
// - get(key): the value if present and not expired, else undefined (an
//   expired entry is deleted on the spot). A hit marks the key most
//   recently used.
// - set(key, value, ttlMs?): stores with expiry now + ttl. When the cache
//   goes over `max`, expired entries are swept first, then the least
//   recently used entries are dropped until it's back at `max`.
//
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/ttlCache.test.mjs).
export function createTtlCache({ ttlMs, max }) {
  const entries = new Map(); // key -> { value, expiresAt }
  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) { entries.delete(key); return undefined; }
      entries.delete(key); entries.set(key, e);
      return e.value;
    },
    set(key, value, ttl = ttlMs) {
      const now = Date.now();
      entries.delete(key);
      entries.set(key, { value, expiresAt: now + ttl });
      if (entries.size > max) {
        for (const [k, e] of entries) if (e.expiresAt <= now) entries.delete(k);
        while (entries.size > max) entries.delete(entries.keys().next().value);
      }
    },
    get size() { return entries.size; },
  };
}
