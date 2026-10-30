import { createTtlCache } from '@/lib/ttlCache.mjs';

// Shared in-process cache for wizard-csv/{date}.csv Supabase Storage reads.
//
// Confirmed 2026-10-02 via a Supabase egress-quota warning: this one file
// was being re-fetched independently by 6 separate call sites with no
// caching at all -- 463 fetches of today's file alone in 24h, ~450KB each,
// ~208MB for a single file in one day. None of those call sites need a
// byte-fresh read on every single call -- today's CSV changes at most a
// few times an hour as scratchings/odds get re-synced, nowhere near the
// rate it was actually being fetched at.
//
// Works because this app runs as a persistent Node process on Render (the
// worker-style API routes and lib/*Sample.js jobs all run in the same
// long-lived process, not per-request serverless) -- a plain module-level
// Map genuinely persists across requests/calls here, unlike on a platform
// that spins up a fresh instance per request.
//
// Deliberately does NOT catch fetch()'s own exceptions (network errors,
// DNS failures, etc.) -- every caller already has its own try/catch or
// .catch() around the original raw fetch, so this preserves each site's
// existing failure behavior exactly rather than silently swallowing
// something a caller was relying on seeing.
// date -> CSV text (~0.4-1.7 MB each). Expired entries are removed and at
// most 4 dates are held -- previously every date ever requested stayed in
// memory for the life of the process.
const TTL_MS = 2 * 60 * 1000; // 2 min, same cadence as other polling (e.g. PUNTERSEDGE_REFS_INTERVAL_MINUTES)
const cache = createTtlCache({ ttlMs: TTL_MS, max: 4 });

// headers: the caller's own already-built Supabase auth headers object
// (anon or service key, whichever that call site already used) -- the
// cache key is just the date, since the file's content is identical
// regardless of which valid key fetched it (Storage access is bucket-
// level, not row-level RLS that could differ per key).
export async function getWizardCsv(SURL, headers, date) {
  const hit = cache.get(date);
  if (hit != null) return hit;

  const res = await fetch(`${SURL}/storage/v1/object/wizard-csv/${date}.csv`, { headers });
  const text = res.ok ? await res.text() : null;
  // Only a successful, non-empty fetch overwrites the cache -- a transient
  // failure (or the file genuinely not existing yet) never gets cached as
  // if it were a permanent "no file" result; it just retries on the next
  // call once the TTL-less miss path is hit again.
  if (text != null) cache.set(date, text);
  return text;
}
