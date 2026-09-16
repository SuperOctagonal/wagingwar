// Value Bets of the Day -- every runner across all of today's races whose
// model price (WW $) shows a meaningfully better price than the market
// (PRICE $), i.e. the market is offering longer odds than the model thinks
// it should. Backs the Value tab, mirroring the Movers tab's batching
// approach (lib/marketMoves.js's fetchAllTodayMarketMoves) and reusing the
// same server-side scoring pipeline already established in
// app/api/results-ranks/route.js (score every horse with GRP_KEYS/
// scoreGroup, sort by totalFromGroups, derive WW $ via calculateMatrixOdds)
// rather than inventing a second one.
//
// Edge % uses computeValueEdge (lib/scoring.js) -- the exact same formula
// the Field tab's own VALUE column uses, extracted there specifically so
// this tab and the Field tab can never drift onto two different
// calculations. See that function's comment for why the two still won't be
// byte-identical (matrix-odds jitter, default vs. session weights).
//
// Market price (PRICE $) is the real live odds_snapshot "current best
// price" -- fetchMarketMoveFlags() (lib/marketMoves.js), the same helper
// Movers/OddsTable's Best column/the Field tab's live-price column all
// read from. Previously used race_cards.form_data.rawOdds, a static
// per-day CSV-derived estimate (×0.74×jitter, computed once at import
// time) -- that produced edges against a synthetic, sometimes stale,
// price instead of a real one. Runners with no live odds_snapshot price
// yet are skipped rather than falling back to rawOdds.
//
// finishPos/margin/sp are outcome context, populated from race_results
// once a race has actually run (previously already-jumped races were
// excluded from this list entirely -- no longer; a bet's WW$/Price$/Edge
// stay exactly as flagged, these three fields just annotate it once a
// result exists). Never affects whether a bet appears.

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calculateMatrixOdds, blendFirstStarterLivePrices, computeValueEdge } from '@/lib/scoring';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const VALUE_EDGE_THRESHOLD = 30;

function headers() {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
}

async function sb(path) {
  if (!SURL || !SKEY) return [];
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: headers() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function fetchAllTodayValueBets(date) {
  const [cardsResult, scrRows, meetingsRows, scheduleRows, resultRows] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, headers()),
    sb(`scratchings?date=eq.${date}&select=venue,race_num,horse_name`),
    sb(`today_meetings?date=eq.${date}&select=venue,track_condition,condition_override`),
    sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`),
    sb(`race_results?date=eq.${date}&select=venue,race_num,horse_name,finish_pos,margin,sp`),
  ]);
  if (!cardsResult.ok) return [];

  // Result/Margin/SP lookup -- same (date-scoped, venue-normalised,
  // name-normalised) join shape used throughout the app to match
  // race_cards/live data against race_results (e.g. the WW-matrix
  // calibration investigation's historical join). Populated once a race
  // has actually run; a bet with no matching row here just renders blank,
  // it never blocks the bet from appearing.
  const resultByRunner = {};
  resultRows.forEach(r => {
    const key = `${normaliseVenue(r.venue)}||${r.race_num}||${normName(r.horse_name || '')}`;
    resultByRunner[key] = { finishPos: r.finish_pos ?? null, margin: r.margin ?? null, sp: r.sp ?? null };
  });
  const cardRows = cardsResult.rows.filter(row => isKnownAuVenue(row.venue));

  const trackCondByVenue = {};
  meetingsRows.forEach(r => {
    const norm = normaliseVenue(r.venue);
    const effectiveCond = (r.condition_override || r.track_condition || '').toLowerCase();
    if (!effectiveCond) return;
    trackCondByVenue[norm] = effectiveCond.includes('heavy') ? 'heavy'
      : effectiveCond.includes('soft') || effectiveCond.includes('slow') ? 'soft'
      : effectiveCond.includes('synth') ? 'synthetic'
      : 'good';
  });

  const postTimeByRace = {};
  scheduleRows.forEach(r => {
    postTimeByRace[`${normaliseVenue(r.venue)}||${r.race_num}`] = r.post_time;
  });

  // Group into per-race horse arrays -- same shape/approach as
  // app/api/results-ranks/route.js.
  const races = {};
  cardRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${norm}||${row.race_num}`;
    if (!races[key]) races[key] = { venue: norm, raceNum: String(row.race_num), horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  });

  const weights = getDefaultWeights();

  // Batched the same way Movers does (lib/marketMoves.js's
  // fetchAllTodayMarketMoves) -- one fetchMarketMoveFlags() call per race,
  // all races' calls run concurrently via Promise.all, rather than a
  // sequential per-race round trip.
  const perRace = await Promise.all(Object.values(races).map(async ({ venue, raceNum, horses }) => {
    // Deliberately NOT excluding races that have already jumped -- a
    // resulted race's value bet still appears based on its original edge
    // at the time it was flagged (marketPrice is the last live price
    // odds_snapshot polled before the race jumped, unchanged by this),
    // with Result/Margin/SP added below as outcome context alongside it.
    const dbScrNames = new Set(
      scrRows
        .filter(r => normaliseVenue(r.venue) === venue && String(r.race_num) === raceNum)
        .map(r => normName(r.horse_name || ''))
    );
    const active = horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (active.length < 2) return []; // calculateMatrixOdds needs a real field to rank against

    const trackCond = trackCondByVenue[venue] || 'good';
    let scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...h, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    // Real live market price -- same odds_snapshot "current best price"
    // source as the Field tab's live-price column, the Odds tab's Best
    // column, and Movers, via the shared helper, rather than the static
    // CSV-derived rawOdds field (which produced implausible-looking, and
    // sometimes badly stale, edges -- see the rawOdds investigation this
    // session). Fetched before scoring/matrix-odds (not just for the
    // marketPrice column below) since blendFirstStarterLivePrices needs
    // it to run before calculateMatrixOdds assigns final prices.
    const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
    // Blends any starts=0 runner's score with its live market price when
    // one exists (falls back unchanged otherwise) -- same fix as the
    // Field tab's live scoring, so a debutant's WW$ (and therefore its
    // Value Bets edge %) reflects the live market once one exists rather
    // than continuing to compare the market against a model price that
    // never had real signal for it.
    scored = blendFirstStarterLivePrices(scored, flags, nameKey);

    const oddsArr = calculateMatrixOdds(scored);

    const raceBets = [];
    scored.forEach((h, i) => {
      const myOdds = oddsArr[i];
      const marketPrice = flags[nameKey(h.name)]?.current;
      // No live price yet for this runner (race not polled, or too early
      // in the day) -- skip rather than fall back to the synthetic CSV
      // value, since that's exactly the misleading price this fix removes.
      if (marketPrice == null) return;
      const edge = computeValueEdge(marketPrice, myOdds);
      if (!edge || edge.pct < VALUE_EDGE_THRESHOLD) return;
      const result = resultByRunner[`${venue}||${raceNum}||${normName(h.name || '')}`] || null;
      raceBets.push({
        horseKey: (h.name || '').toUpperCase(),
        venue,
        raceNum,
        postTime: postTimeByRace[`${venue}||${raceNum}`] || null,
        wwPrice: myOdds,
        marketPrice,
        pct: Math.round(edge.pct),
        // Blank/pending (null) until the race has actually run -- never
        // blocks the bet from appearing, purely outcome context alongside
        // the original WW$/Price$/Edge at the time it was flagged.
        finishPos: result?.finishPos ?? null,
        margin: result?.margin ?? null,
        sp: result?.sp ?? null,
      });
    });
    return raceBets;
  }));

  return perRace.flat();
}
