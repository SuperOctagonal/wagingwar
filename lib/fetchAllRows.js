// PostgREST silently clamps any client-requested `limit` down to the
// project's own db-max-rows ceiling (commonly 1000) — it does NOT error,
// it just returns a partial result set with a normal 200 status, so a
// plain single fetch() against a table that can exceed that ceiling
// (e.g. race_cards on a big multi-venue race day) silently drops
// whatever falls past the cutoff. Page through with offset/limit until
// a page comes back short of a full page.
export async function fetchAllRows(baseUrl, headers, pageSize = 1000) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  let all = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${baseUrl}${sep}offset=${offset}&limit=${pageSize}`, { headers });
    if (!r.ok) return { ok: false, status: r.status, text: await r.text(), rows: all };
    const page = await r.json();
    all = all.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return { ok: true, rows: all };
}
