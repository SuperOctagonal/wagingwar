// Steamer/drifter detection -- shared by every live-price surface (the
// /odds page and Races page's Odds tab, both via components/OddsTable.js;
// the Field tab and Pace Map tab in app/races/page.js) so the comparison
// logic exists in exactly one place and all four surfaces agree.
//
// "Best price" for a runner = the highest price across all bookmakers in a
// given odds_snapshot batch (same max-across-bookmakers calculation
// OddsTable already uses to bold the best cell per row).
//
// Two independent flags per runner, each requiring a >=15% move in either
// direction to fire:
//   - open:   current best vs. today's FIRST snapshot (the day's "open"
//             price) -- always the day's first batch, never a prior day's.
//   - recent: current best vs. the snapshot nearest 45 minutes ago, only
//             counted if a snapshot actually falls in the 30-60 minute-ago
//             window (no snapshot in that window -> no recent flag, not a
//             flag computed against a too-old/too-new stand-in).
//
// A move is a "steamer" (price shortened -- backers piling in, so styled
// with the same green as a winning P&L figure elsewhere in the app) when
// the price went DOWN, and a "drifter" (lengthened) when it went UP, styled
// red to match the same loss convention.

import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const STEAMER_DRIFTER_THRESHOLD = 0.15;
export const STEAMER_COLOR = '#059669';
export const DRIFTER_COLOR = '#dc2626';

// Duplicated from app/races/page.js's own stripCountry -- trivial one-liner,
// kept local so this lib has no dependency on a page file. Strips a trailing
// country-of-origin suffix (e.g. "NAMARA (NZ)" -> "NAMARA") before matching
// odds_snapshot's horse_name against a runner name from race_cards/CSV data.
const stripCountry = n => (n || '').replace(/\s*\([A-Z]{2,4}\)$/i, '').trim();
// Exported so every consumer (OddsTable, RunnerRow, PaceMapView) looks up
// fetchSteamerDrifterFlags()'s result with the exact same key derivation,
// rather than each re-implementing the stripCountry+uppercase convention.
export const nameKey = n => stripCountry(n).toUpperCase();

async function sb(path) {
  if (!SURL || !SKEY) return [];
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// { pct, direction: 'steamer' | 'drifter' } or null if the move is under
// threshold, or either price is missing.
export function computeMoveFlag(current, baseline) {
  if (current == null || baseline == null || baseline === 0) return null;
  const pct = Math.abs(current - baseline) / baseline;
  if (pct < STEAMER_DRIFTER_THRESHOLD) return null;
  return {
    pct: Math.round(pct * 100),
    direction: current < baseline ? 'steamer' : 'drifter',
  };
}

// Highest price across bookmakers per horse, from a list of
// {horse_name, price} rows (one odds_snapshot batch).
function bestPerHorse(rows) {
  const map = {};
  for (const r of rows) {
    const key = nameKey(r.horse_name);
    const p = Number(r.price);
    if (!Number.isFinite(p)) continue;
    if (!(key in map) || p > map[key]) map[key] = p;
  }
  return map;
}

// Returns { [nameKey]: { current, open: flag|null, recent: flag|null } }
// for every runner with a live price in the latest snapshot batch for this
// race. venue must already be normalised (same value passed to OddsTable/
// the odds_snapshot queries elsewhere).
export async function fetchSteamerDrifterFlags({ venue, raceNum, date }) {
  if (!venue || !raceNum || !date) return {};

  // Bug fixed 2026-09-08: this used to fetch every captured_at row for the
  // whole day for this race via a plain, unpaginated fetch (select=
  // captured_at, no limit) and derive open/latest from the first/last of
  // the client-side-deduped list. A single race's full-day row count
  // (batches x bookmakers x runners) can exceed PostgREST's 1000-row
  // default cap on a heavily-polled day (confirmed live: TOWNSVILLE R8
  // alone hit exactly 1000 rows) -- ordered ascending, that silently drops
  // the LATEST timestamps, so "latest" could resolve to a stale mid-day
  // batch instead of the real current one.
  //
  // Tried replacing this with two `order+limit=1` queries (get open/latest
  // directly without fetching the full list) -- that's the pattern already
  // used elsewhere for "get the latest odds_snapshot batch", but confirmed
  // live it causes Postgres to pick a pathological query plan here and hit
  // a statement timeout (57014) on the ASC+LIMIT 1 query specifically, on
  // this same table, for this same race. Reverted to fetching the full
  // timestamp list -- but now via fetchAllRows so it can never silently
  // truncate regardless of how large the day's history gets.
  const base = `${SURL}/rest/v1/odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}`;
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
  const tsResult = await fetchAllRows(`${base}&select=captured_at&order=captured_at.asc`, headers);
  const allTimestamps = [...new Set((tsResult.ok ? tsResult.rows : []).map(r => r.captured_at))];
  if (!allTimestamps.length) return {};

  const openTs = allTimestamps[0];
  const latestTs = allTimestamps[allTimestamps.length - 1];

  // Nearest snapshot to 45 minutes ago, but only if it actually falls within
  // the 30-60 minute-ago window -- a day with sparse polling (or a race that
  // only just started) should show no recent-move flag rather than compare
  // against a snapshot far outside that window.
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const windowEnd = now - 30 * 60 * 1000;
  const target = now - 45 * 60 * 1000;
  let recentTs = null, bestDiff = Infinity;
  for (const ts of allTimestamps) {
    const t = new Date(ts).getTime();
    if (t < windowStart || t > windowEnd) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) { bestDiff = diff; recentTs = ts; }
  }

  const uniqueTs = [...new Set([openTs, latestTs, recentTs].filter(Boolean))];
  const batches = {};
  await Promise.all(uniqueTs.map(async ts => {
    batches[ts] = await sb(
      `odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&captured_at=eq.${encodeURIComponent(ts)}&select=horse_name,price`,
    );
  }));

  const currentBest = bestPerHorse(batches[latestTs] || []);
  const openBest = bestPerHorse(batches[openTs] || []);
  const recentBest = recentTs ? bestPerHorse(batches[recentTs] || []) : {};

  const result = {};
  for (const key of Object.keys(currentBest)) {
    const current = currentBest[key];
    result[key] = {
      current,
      open: computeMoveFlag(current, openBest[key]),
      recent: recentTs ? computeMoveFlag(current, recentBest[key]) : null,
    };
  }
  return result;
}
