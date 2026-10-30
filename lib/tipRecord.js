import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { createTtlCache } from '@/lib/ttlCache.mjs';
import { singleFlight } from '@/lib/singleFlight.mjs';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Backs GET /api/tip-record. Reads the tip_results view (service key only
// -- anon/authenticated have no grant on it, see the migration) and shapes
// it into the compact row format the public Tip Record page consumes.
//
// The settlement rule lives in the view, in one place
// (supabase/migrations/20261030010000_tip_results_settlement_rule.sql):
// `settled` (horse started -- finishing position, FF or BD -- and has an
// SP) and `excluded_reason` (no_sp / abandoned / scratched / no_result).
// This file only reads those columns.

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

export function isSettled(row) {
  return row.settled === true;
}

// Excluded-reason keys, in the order the public page lists them.
export const EXCLUDED_REASONS = ['abandoned', 'scratched', 'no_sp', 'no_result'];

function edgePct(marketPrice, wwPrice) {
  if (marketPrice == null || wwPrice == null || wwPrice === 0) return null;
  return Math.round((marketPrice / wwPrice - 1) * 1000) / 10;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// Every rank-1 tip row from the tip_results view (settled or not), or null
// on failure. Shared by fetchTipRecord (public page) and the admin Tip
// Record health panel (lib/adminTipHealth.js).
export async function fetchTipRows() {
  if (!SURL || !SKEY) return null;
  // fetchAllRows, not sbAdminRaw -- tip_results has well over 1,000 rank-1
  // rows, past PostgREST's default 1000-row page cap, which a single fetch
  // would silently truncate (the exact class of bug fixed elsewhere in
  // this codebase).
  const { ok, rows } = await fetchAllRows(
    `${SURL}/rest/v1/tip_results?select=${TIP_COLUMNS}&order=date.asc,race_num.asc`,
    HEADERS,
  );
  return ok ? rows : null;
}

// Only the columns the public record and the admin Tip Record panel use
// (not select=*).
const TIP_COLUMNS = [
  'date', 'venue', 'state', 'race_num', 'horse_name', 'total_score', 'ww_price', 'market_price',
  'field_size', 'field_rank', 'captured_at', 'finish_pos', 'sp', 'result_status', 'dead_heat_winners',
  'settled', 'excluded_reason',
].join(',');

// The public record (GET /api/tip-record) is rebuilt at most every 10
// minutes per server process; concurrent misses share one rebuild. The
// admin panel calls fetchTipRows() directly and always reads fresh rows.
const RECORD_TTL_MS = 10 * 60 * 1000;
const recordCache = createTtlCache({ ttlMs: RECORD_TTL_MS, max: 1 });
const buildTipRecordOnce = singleFlight(buildTipRecord);

export async function fetchTipRecord() {
  const hit = recordCache.get('record');
  if (hit) return hit;
  const record = await buildTipRecordOnce();
  if (record) recordCache.set('record', record);
  return record;
}

async function buildTipRecord() {
  const data = await fetchTipRows();
  if (!data) return null;

  const today = todayISO();
  const settledRows = [];
  const excluded = { total: 0, ...Object.fromEntries(EXCLUDED_REASONS.map(k => [k, 0])) };
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
        r.finish_pos,          // null for FF/BD (started, didn't finish) -- a loss
        r.field_size,
        edgePct(r.market_price, r.ww_price),
        r.field_rank,
        r.dead_heat_winners || 1,
        r.result_status || null, // 'FF' / 'BD' when finish_pos is null
      ]);
    } else if (r.date < today) {
      // Rank-1 tip from a past date that never settled -- a race that
      // hasn't run yet (today or later) is "pending", not excluded, so
      // only past-dated unsettled rows count here.
      excluded.total++;
      excluded[r.excluded_reason || 'no_result']++;
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
