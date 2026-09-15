// Market move detection ("Firming"/"Drifting") -- shared by every live-price
// surface (the /odds page and Races page's Odds tab, both via
// components/OddsTable.js; the Field tab, Pace Map tab, race-header summary
// pills, and the Movers tab, all in app/races/page.js) so the comparison
// logic exists in exactly one place and every surface agrees.
//
// Renamed 2026-09-15 from steamer/drifter -> firming/drifting, and
// simplified: previously computed two independent flags per runner (an
// "open" move and a separate "recent" 30-60-minute move) -- the recent
// comparison is now removed entirely. Only one comparison remains: current
// best price vs. today's first snapshot for that race (the "open" price).
//
// "Best price" for a runner = the highest price across all bookmakers in a
// given odds_snapshot batch (same max-across-bookmakers calculation
// OddsTable already uses to bold the best cell per row).
//
// A move is "firming" (price shortened -- backers piling in, so styled with
// the same green as a winning P&L figure elsewhere in the app) when the
// price went DOWN, and "drifting" (lengthened) when it went UP, styled red
// to match the same loss convention. >=15% move required either way.

import { fetchAllRows } from '@/lib/fetchAllRows';
import { hasRaceJumped } from '@/lib/raceTime';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const MARKET_MOVE_THRESHOLD = 0.15;
export const FIRMING_COLOR = '#059669';
export const DRIFTING_COLOR = '#dc2626';

// Duplicated from app/races/page.js's own stripCountry -- trivial one-liner,
// kept local so this lib has no dependency on a page file. Strips a trailing
// country-of-origin suffix (e.g. "NAMARA (NZ)" -> "NAMARA") before matching
// odds_snapshot's horse_name against a runner name from race_cards/CSV data.
const stripCountry = n => (n || '').replace(/\s*\([A-Z]{2,4}\)$/i, '').trim();
// Exported so every consumer (OddsTable, RunnerRow, PaceMapView, MoversView)
// looks up fetchMarketMoveFlags()'s result with the exact same key
// derivation, rather than each re-implementing the convention.
export const nameKey = n => stripCountry(n).toUpperCase();

function sbHeaders() {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
}

async function sb(path) {
  if (!SURL || !SKEY) return [];
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: sbHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// { pct, direction: 'firming' | 'drifting' } or null if the move is under
// threshold, or either price is missing.
export function computeMoveFlag(current, baseline) {
  if (current == null || baseline == null || baseline === 0) return null;
  const pct = Math.abs(current - baseline) / baseline;
  if (pct < MARKET_MOVE_THRESHOLD) return null;
  return {
    pct: Math.round(pct * 100),
    direction: current < baseline ? 'firming' : 'drifting',
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

// Returns { [nameKey]: { current, open, move: flag|null } } for every runner
// with a live price in the latest snapshot batch for this race. venue must
// already be normalised (same value passed to OddsTable/the odds_snapshot
// queries elsewhere).
export async function fetchMarketMoveFlags({ venue, raceNum, date }) {
  if (!venue || !raceNum || !date) return {};

  // Fetches the full list of this race's captured_at timestamps for the day
  // via fetchAllRows (paginated) rather than a single unbounded fetch --
  // a single race's full-day row count (batches x bookmakers x runners) can
  // exceed PostgREST's 1000-row default cap on a heavily-polled day
  // (confirmed live: a single race hit exactly 1000 rows on this query
  // alone), which would silently drop the LATEST timestamps and resolve
  // "current" to a stale mid-day batch. A tried alternative -- two
  // `order+limit=1` queries instead of fetching the full list -- hit a
  // Postgres statement timeout (57014) on this same table, so this stays
  // the paginated-full-fetch approach.
  const base = `${SURL}/rest/v1/odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}`;
  const tsResult = await fetchAllRows(`${base}&select=captured_at&order=captured_at.asc`, sbHeaders());
  const allTimestamps = [...new Set((tsResult.ok ? tsResult.rows : []).map(r => r.captured_at))];
  if (!allTimestamps.length) return {};

  const openTs = allTimestamps[0];
  const latestTs = allTimestamps[allTimestamps.length - 1];

  const uniqueTs = [...new Set([openTs, latestTs])];
  const batches = {};
  await Promise.all(uniqueTs.map(async ts => {
    batches[ts] = await sb(
      `odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&captured_at=eq.${encodeURIComponent(ts)}&select=horse_name,price`,
    );
  }));

  const currentBest = bestPerHorse(batches[latestTs] || []);
  const openBest = bestPerHorse(batches[openTs] || []);

  const result = {};
  for (const key of Object.keys(currentBest)) {
    const current = currentBest[key];
    const open = openBest[key] ?? null;
    result[key] = { current, open, move: computeMoveFlag(current, open) };
  }
  return result;
}

// Every runner across ALL of today's races currently qualifying as a firmer
// or drifter -- backs the Movers tab. Batched, not one-fetch-per-race-times-
// two-round-trips-of-guessing: race_schedule already holds the day's full,
// authoritative (venue, race_num) list (small -- one row per race, not per
// odds poll), so that's queried once to know which races exist, then each
// race's own fetchMarketMoveFlags() call runs concurrently via Promise.all
// rather than sequentially. This still means one Supabase round trip per
// race (fetchMarketMoveFlags's own queries), but keeps it to a single
// concurrent batch from one server-side API call rather than the client
// firing N separate requests, and each per-race call is itself now small
// and fast post the pagination fix above.
export async function fetchAllTodayMarketMoves(date) {
  const scheduleRows = await sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`);
  const races = [...new Map(scheduleRows.map(r => [`${r.venue}||${r.race_num}`, { venue: r.venue, raceNum: String(r.race_num), postTime: r.post_time }])).values()]
    // Excludes races that have already jumped -- reuses hasRaceJumped()
    // (lib/raceTime.js), the same timezone-aware jump-time check already
    // used by the bet-logging jump-time gate, rather than a second
    // approximate implementation. Once a race jumps, PuntersEdge stops
    // updating it, so its last odds_snapshot batch is a frozen, stale
    // market rather than a genuine live one. Filtered here (before
    // fetchMarketMoveFlags ever runs), not just at display time, so the
    // batch never wastes work on a closed market.
    .filter(r => !hasRaceJumped(date, r.postTime));
  if (!races.length) return [];

  const perRace = await Promise.all(races.map(async ({ venue, raceNum, postTime }) => {
    const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
    return { venue, raceNum, postTime, flags };
  }));

  const movers = [];
  for (const { venue, raceNum, postTime, flags } of perRace) {
    for (const [key, entry] of Object.entries(flags)) {
      if (!entry.move) continue;
      movers.push({
        horseKey: key,
        venue,
        raceNum,
        postTime,
        openPrice: entry.open,
        currentPrice: entry.current,
        pct: entry.move.pct,
        direction: entry.move.direction,
      });
    }
  }
  return movers;
}
