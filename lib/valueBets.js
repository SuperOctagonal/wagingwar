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

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calculateMatrixOdds, computeValueEdge } from '@/lib/scoring';

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
  const [cardsResult, scrRows, meetingsRows, scheduleRows] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, headers()),
    sb(`scratchings?date=eq.${date}&select=venue,race_num,horse_name`),
    sb(`today_meetings?date=eq.${date}&select=venue,track_condition,condition_override`),
    sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`),
  ]);
  if (!cardsResult.ok) return [];
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
  const bets = [];

  Object.values(races).forEach(({ venue, raceNum, horses }) => {
    const dbScrNames = new Set(
      scrRows
        .filter(r => normaliseVenue(r.venue) === venue && String(r.race_num) === raceNum)
        .map(r => normName(r.horse_name || ''))
    );
    const active = horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (active.length < 2) return; // calculateMatrixOdds needs a real field to rank against

    const trackCond = trackCondByVenue[venue] || 'good';
    const scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...h, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    const oddsArr = calculateMatrixOdds(scored);
    scored.forEach((h, i) => {
      const myOdds = oddsArr[i];
      const marketPrice = h.rawOdds;
      const edge = computeValueEdge(marketPrice, myOdds);
      if (!edge || edge.pct < VALUE_EDGE_THRESHOLD) return;
      bets.push({
        horseKey: (h.name || '').toUpperCase(),
        venue,
        raceNum,
        postTime: postTimeByRace[`${venue}||${raceNum}`] || null,
        wwPrice: myOdds,
        marketPrice,
        pct: Math.round(edge.pct),
      });
    });
  });

  return bets;
}
