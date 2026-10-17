import 'server-only';

// Service-key Supabase access -- server-only (the 'server-only' import
// above makes any accidental import from a client component a build
// error). SUPABASE_SERVICE_KEY is never a NEXT_PUBLIC_ var, so it's never
// bundled into client JS, unlike the anon key every server route here is
// replacing.
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Raw fetch wrapper returning { ok, status, data } -- callers that need to
// tell "no row matched" (for the id+clerk_id ownership check every PATCH/
// DELETE route below does) from "request failed" use `status`/`ok`
// directly rather than sbAdmin's collapsed null-on-either case.
export async function sbAdminRaw(path, opts = {}) {
  if (!SURL || !SKEY) return { ok: false, status: 500, data: null };
  const headers = {
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
    'Content-Type': 'application/json',
    ...(opts.prefer ? { Prefer: opts.prefer } : {}),
  };
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return { ok: true, status: 204, data: null };
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// Convenience wrapper matching the shape most call sites actually want
// (just the data, or null on any failure) -- same ergonomics as the old
// client-side sbFetch helpers these routes replace.
export async function sbAdmin(path, opts = {}) {
  const { ok, data } = await sbAdminRaw(path, opts);
  return ok ? data : null;
}
