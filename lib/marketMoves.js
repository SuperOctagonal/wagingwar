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
import { fetchResultsByRunner, resultKey } from '@/lib/raceResults';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const MARKET_MOVE_THRESHOLD = 0.15;
// Minimum distinct bookmakers a batch must have before it's trusted as the
// day's "open" baseline -- a race's very first poll can catch PuntersEdge's
// feed mid-populate, with only one bookmaker having posted a price yet.
// Confirmed live: WELLINGTON R5's actual first batch had exactly one row
// (Sportsbet, $1.40 for a horse every other bookmaker had at ~$31-51 within
// a couple of polls) -- using that single-bookmaker snapshot as "open"
// produced a nonsensical +3543% move. A real market with only 1-2
// bookmakers reporting isn't representative enough to compare against.
export const MIN_OPEN_BOOKMAKERS = 3;
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
  // Selecting bookmaker alongside captured_at (barely more payload than
  // captured_at alone) lets openTs be chosen by actual bookmaker coverage
  // per batch, computed from this one paginated fetch, rather than a
  // second round trip per candidate timestamp.
  const tsResult = await fetchAllRows(`${base}&select=captured_at,bookmaker&order=captured_at.asc`, sbHeaders());
  const tsRows = tsResult.ok ? tsResult.rows : [];
  const allTimestamps = [...new Set(tsRows.map(r => r.captured_at))];
  if (!allTimestamps.length) return {};

  const bookmakersByTs = new Map();
  for (const r of tsRows) {
    if (!bookmakersByTs.has(r.captured_at)) bookmakersByTs.set(r.captured_at, new Set());
    bookmakersByTs.get(r.captured_at).add(r.bookmaker);
  }
  // Earliest batch that actually has enough bookmakers reporting to be a
  // trustworthy "open" -- falls back to the true first timestamp if no
  // batch ever reaches the threshold (e.g. a very thinly-covered race all
  // day), so this never returns nothing rather than a slightly-less-ideal
  // baseline.
  const openTs = allTimestamps.find(ts => (bookmakersByTs.get(ts)?.size || 0) >= MIN_OPEN_BOOKMAKERS) ?? allTimestamps[0];
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
  const [scheduleRows, resultByRunner] = await Promise.all([
    sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`),
    // Result/Margin/SP lookup -- shared join (lib/raceResults.js), the
    // same one the Value Bets tab uses, rather than a second copy.
    fetchResultsByRunner(date),
  ]);
  // Deliberately NOT excluding races that have already jumped (previously
  // done here via hasRaceJumped) -- a resulted race's mover still appears
  // based on its final firming/drifting move (current/open prices are
  // odds_snapshot's own last-polled batches before jump, unchanged by
  // this), with Result/Margin/SP added below as outcome context.
  const races = [...new Map(scheduleRows.map(r => [`${r.venue}||${r.race_num}`, { venue: r.venue, raceNum: String(r.race_num), postTime: r.post_time }])).values()];
  if (!races.length) return [];

  const perRace = await Promise.all(races.map(async ({ venue, raceNum, postTime }) => {
    const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
    return { venue, raceNum, postTime, flags };
  }));

  const movers = [];
  for (const { venue, raceNum, postTime, flags } of perRace) {
    for (const [key, entry] of Object.entries(flags)) {
      if (!entry.move) continue;
      // key is already the nameKey (stripped-country, uppercased) form,
      // not necessarily the exact race_results.horse_name spelling -- but
      // resultKey() normalises the same way (upper + strips non-
      // alphanumerics), so matching against it here is safe even though
      // this isn't literally the raw horse name.
      const result = resultByRunner[resultKey(venue, raceNum, key)] || null;
      movers.push({
        horseKey: key,
        venue,
        raceNum,
        postTime,
        openPrice: entry.open,
        currentPrice: entry.current,
        pct: entry.move.pct,
        direction: entry.move.direction,
        finishPos: result?.finishPos ?? null,
        margin: result?.margin ?? null,
        sp: result?.sp ?? null,
      });
    }
  }
  return movers;
}
