import 'server-only';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Backs GET /api/tip-record. Reads the tip_results view (service key only
// -- anon/authenticated have no grant on it, see the migration) and shapes
// it into the compact row format the public Tip Record page consumes.
//
// "Settled" = finish_pos > 0 and sp is not null (matches the view's own
// definition, applied here rather than in the view itself, since the view
// deliberately returns every rank-1 row -- settled or not -- so other
// future consumers aren't forced into this route's specific cut).

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

function isSettled(row) {
  return row.finish_pos > 0 && row.sp != null;
}

function edgePct(marketPrice, wwPrice) {
  if (marketPrice == null || wwPrice == null || wwPrice === 0) return null;
  return Math.round((marketPrice / wwPrice - 1) * 1000) / 10;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

// Strips the trailing (NZ)/(IRE)/(GB) country suffix -- same regex the
// view itself uses -- so a scratched runner's name matches regardless of
// which side (scratchings vs. the view's already-cleaned horse_name) still
// carries it.
function cleanName(n) {
  return (n || '').replace(/\s*\([A-Za-z]{2,3}\)\s*$/, '').toUpperCase();
}

export async function fetchTipRecord() {
  if (!SURL || !SKEY) return null;
  // fetchAllRows, not sbAdminRaw -- tip_results currently has 1,519 rank-1
  // rows, already past PostgREST's default 1000-row page cap, which
  // sbAdminRaw's single fetch would silently truncate (the exact
  // class of bug fixed elsewhere in this codebase).
  const { ok, rows: data } = await fetchAllRows(
    `${SURL}/rest/v1/tip_results?select=*&order=date.asc,race_num.asc`,
    { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  );
  if (!ok) return null;

  const today = todayISO();
  const settledRows = [];
  const excludedRows = [];
  let resultsTo = null;

  for (const r of data) {
    if (isSettled(r)) {
      if (!resultsTo || r.date > resultsTo) resultsTo = r.date;
      settledRows.push([
        r.date,
        r.venue,
        r.state,
        Number(r.race_num),
        r.horse_name,
        r.total_score != null ? Math.round(Number(r.total_score) * 10) / 10 : null,
        round2(r.ww_price != null ? Number(r.ww_price) : null),
        round2(r.market_price != null ? Number(r.market_price) : null),
        Number(r.sp),
        r.finish_pos,
        r.field_size,
        edgePct(r.market_price, r.ww_price),
        r.field_rank,
        r.dead_heat_winners || 1,
      ]);
    } else if (r.date < today) {
      // Rank-1 tip from a past date that never settled -- a race that
      // hasn't run yet (today or later) is "pending", not excluded, so
      // only past-dated unsettled rows count here.
      excludedRows.push(r);
    }
  }

  const excluded = { total: excludedRows.length, abandoned: 0, scratched: 0, no_result: 0 };
  if (excludedRows.length) {
    const dates = [...new Set(excludedRows.map(r => r.date))];
    const [{ data: meetings }, { data: scratchings }] = await Promise.all([
      sbAdminRaw(`today_meetings?date=in.(${dates.join(',')})&select=date,venue,is_abandoned`),
      sbAdminRaw(`scratchings?date=in.(${dates.join(',')})&select=date,venue,race_num,horse_name`),
    ]);
    const abandonedSet = new Set(
      (meetings || []).filter(m => m.is_abandoned).map(m => `${m.date}||${m.venue.toUpperCase()}`),
    );
    const scratchedSet = new Set(
      (scratchings || []).map(s => `${s.date}||${s.venue.toUpperCase()}||${s.race_num}||${cleanName(s.horse_name)}`),
    );
    for (const r of excludedRows) {
      if (abandonedSet.has(`${r.date}||${r.venue.toUpperCase()}`)) excluded.abandoned++;
      else if (scratchedSet.has(`${r.date}||${r.venue.toUpperCase()}||${r.race_num}||${cleanName(r.horse_name)}`)) excluded.scratched++;
      else excluded.no_result++;
    }
  }

  return {
    rows: settledRows,
    meta: {
      results_to: resultsTo,
      settled: settledRows.length,
      excluded,
    },
  };
}
