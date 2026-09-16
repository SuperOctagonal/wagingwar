// Builds the (calibrated model probability, live market probability,
// actual outcome) sample the Trust Engine's blend-ratio search
// (lib/trustBlend.js) is fit against. Unlike Phase 2's calibration
// sample, this needs a REAL live market price per runner, which only
// exists from odds_snapshot's actual coverage window (2026-09-03
// onward, confirmed via direct query -- much shorter than race_cards'
// own ~10-week retention), so this sample is necessarily smaller than
// Phase 2's.
//
// Re-scores race_cards deterministically (same method as
// lib/calibrationSample.js) to get the RAW, unblended model price for
// every runner including first starters -- deliberately NOT reading
// race_feature_snapshots.ww_price for this, since that field already has
// the live first-starter blend baked in for starts=0 runners (9e9c70c),
// which would contaminate a from-scratch measurement of what that blend
// ratio *should* be. Market price reuses fetchMarketMoveFlags()
// (lib/marketMoves.js) per race -- the exact same "current best price"
// helper every other live-price surface in the app already uses, applied
// here to historical dates (it's a pure date-parameterised function, not
// today-only).

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calculateMatrixOdds } from '@/lib/scoring';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';
import { interpolateCurve } from '@/lib/isotonic';
import { normResultName } from '@/lib/raceResults';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
}

function mapTrackCond(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('heavy')) return 'heavy';
  if (s.includes('soft') || s.includes('slow')) return 'soft';
  if (s.includes('synth')) return 'synthetic';
  return 'good';
}

const NUM_DRAWS = 15;

export async function buildTrustSample({ startDate, endDate, calibrationCurve = null }) {
  const [cardsRes, resultsRes] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,form_data`, headers()),
    fetchAllRows(`${SURL}/rest/v1/race_results?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,finish_pos,track_cond`, headers()),
  ]);
  if (!cardsRes.ok) return [];
  const cardRows = cardsRes.rows.filter(row => isKnownAuVenue(row.venue));
  const resultRows = resultsRes.ok ? resultsRes.rows : [];

  const resultsIndex = new Map();
  const raceCondIndex = new Map();
  for (const r of resultRows) {
    const normV = normaliseVenue(r.venue);
    const raceKey = `${r.date}||${normV}||${r.race_num}`;
    resultsIndex.set(`${raceKey}||${normResultName(r.horse_name)}`, r);
    if (!raceCondIndex.has(raceKey)) raceCondIndex.set(raceKey, r.track_cond || '');
  }

  const races = {};
  for (const row of cardRows) {
    const normV = normaliseVenue(row.venue);
    const key = `${row.date}||${normV}||${row.race_num}`;
    if (!races[key]) races[key] = { date: row.date, venue: normV, raceNum: String(row.race_num), horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  }

  const weights = getDefaultWeights();

  const perRace = await Promise.all(Object.keys(races).map(async raceKey => {
    const { date, venue, raceNum, horses } = races[raceKey];
    const active = horses.filter(h => !h.scratched);
    if (active.length < 2) return [];

    const trackCond = mapTrackCond(raceCondIndex.get(raceKey));
    const scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...h, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    const sums = new Array(scored.length).fill(0);
    for (let d = 0; d < NUM_DRAWS; d++) {
      calculateMatrixOdds(scored).forEach((o, i) => { sums[i] += o; });
    }

    // Historical market price -- fetchMarketMoveFlags works for any past
    // date (odds_snapshot is date-scoped, not "today"-scoped), same
    // helper Movers/OddsTable/Value Bets/Phase 1 all already use.
    const flags = await fetchMarketMoveFlags({ venue, raceNum, date });

    return scored.map((h, i) => {
      const res = resultsIndex.get(`${raceKey}||${normResultName(h.name)}`);
      if (!res || res.finish_pos == null) return null;
      const rawPrice = sums[i] / NUM_DRAWS;
      const rawProb = 1 / rawPrice;
      const calProb = calibrationCurve?.length ? interpolateCurve(calibrationCurve, rawProb) : rawProb;
      const marketPrice = flags[nameKey(h.name)]?.current;
      const marketProb = marketPrice > 0 ? 1 / marketPrice : null;
      return {
        date, venue, raceNum, name: h.name,
        starts: h.starts != null ? Number(h.starts) : null,
        rawProb, calProb, marketPrice: marketPrice ?? null, marketProb,
        won: Number(res.finish_pos) === 1,
      };
    }).filter(Boolean);
  }));

  return perRace.flat();
}
