// Builds the (model-implied probability, actual outcome) training sample
// the calibration curve is fit against. Two sources, unioned:
//
// 1. Historical re-score: race_cards (deterministic re-score via
//    scoreGroup/GRP_KEYS/calculateMatrixOdds, exactly the method used in
//    the earlier one-off calibration investigation) joined against
//    race_results. This is the only source available for dates before
//    race_feature_snapshots existed (Phase 1, added 2026-09-16), and
//    currently the much larger sample.
// 2. race_feature_snapshots (Phase 1) joined against race_results, once a
//    snapshot's race has actually resulted. No re-scoring needed here --
//    ww_price was already computed by the live pipeline at capture time,
//    so this is a straight read. As Phase 1 accumulates, more of the
//    training window is covered by real captured snapshots instead of a
//    reconstruction, per the brief ("increasingly supplemented by
//    race_feature_snapshots as it accumulates").
//
// Where both sources cover the same (date, venue, race, horse), the
// snapshot row wins (it's the actual value computed at the actual
// decision moment, not a reconstruction) -- deduped below.

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calculateMatrixOdds } from '@/lib/scoring';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

function mapTrackCond(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('heavy')) return 'heavy';
  if (s.includes('soft') || s.includes('slow')) return 'soft';
  if (s.includes('synth')) return 'synthetic';
  return 'good';
}

// calculateMatrixOdds has its own small built-in jitter -- averaging
// several independent draws per race (same approach the earlier
// calibration investigation used) so a runner's modelProb reflects its
// rank/score, not draw-to-draw noise.
const NUM_DRAWS = 15;

async function reScoreRaceCardsSample(startDate, endDate) {
  const [cardRowsRaw, resultRows] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,form_data`, headers()),
    fetchAllRows(`${SURL}/rest/v1/race_results?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,finish_pos,track_cond`, headers()),
  ]);
  if (!cardRowsRaw.ok) return [];
  const cardRows = cardRowsRaw.rows.filter(row => isKnownAuVenue(row.venue));
  const resultRowsList = resultRows.ok ? resultRows.rows : [];

  const resultsIndex = new Map();
  const raceCondIndex = new Map();
  for (const r of resultRowsList) {
    const normV = normaliseVenue(r.venue);
    const raceKey = `${r.date}||${normV}||${r.race_num}`;
    resultsIndex.set(`${raceKey}||${normName(r.horse_name)}`, r);
    if (!raceCondIndex.has(raceKey)) raceCondIndex.set(raceKey, r.track_cond || '');
  }

  const races = {};
  for (const row of cardRows) {
    const normV = normaliseVenue(row.venue);
    const key = `${row.date}||${normV}||${row.race_num}`;
    if (!races[key]) races[key] = { date: row.date, venue: normV, raceNum: row.race_num, horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  }

  const weights = getDefaultWeights();
  const sample = [];

  for (const raceKey of Object.keys(races)) {
    const { date, venue, raceNum, horses } = races[raceKey];
    const active = horses.filter(h => !h.scratched);
    if (active.length < 2) continue;

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

    scored.forEach((h, i) => {
      const res = resultsIndex.get(`${raceKey}||${normName(h.name)}`);
      if (!res || res.finish_pos == null) return;
      const price = sums[i] / NUM_DRAWS;
      sample.push({
        date, venue, raceNum: String(raceNum), name: h.name,
        modelProb: 1 / price,
        won: Number(res.finish_pos) === 1,
        source: 'rescore',
      });
    });
  }
  return sample;
}

async function snapshotSample(startDate, endDate) {
  const [snapRows, resultRows] = await Promise.all([
    sb(`race_feature_snapshots?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,ww_price`),
    fetchAllRows(`${SURL}/rest/v1/race_results?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,finish_pos`, headers()),
  ]);
  const resultRowsList = resultRows.ok ? resultRows.rows : [];
  const resultsIndex = new Map();
  for (const r of resultRowsList) {
    const key = `${r.date}||${normaliseVenue(r.venue)}||${r.race_num}||${normName(r.horse_name)}`;
    resultsIndex.set(key, r);
  }

  const sample = [];
  for (const row of snapRows) {
    if (row.ww_price == null || row.ww_price <= 0) continue;
    const key = `${row.date}||${normaliseVenue(row.venue)}||${row.race_num}||${normName(row.horse_name)}`;
    const res = resultsIndex.get(key);
    if (!res || res.finish_pos == null) continue;
    sample.push({
      date: row.date, venue: normaliseVenue(row.venue), raceNum: String(row.race_num), name: row.horse_name,
      modelProb: 1 / row.ww_price,
      won: Number(res.finish_pos) === 1,
      source: 'snapshot',
    });
  }
  return sample;
}

export async function buildCalibrationSample({ startDate, endDate }) {
  const [rescored, snapshots] = await Promise.all([
    reScoreRaceCardsSample(startDate, endDate),
    snapshotSample(startDate, endDate),
  ]);

  // Snapshot rows win where both sources cover the same runner -- they're
  // the real captured value, not a reconstruction.
  const snapshotKeys = new Set(snapshots.map(s => `${s.date}||${s.venue}||${s.raceNum}||${normName(s.name)}`));
  const rescoredDeduped = rescored.filter(r => !snapshotKeys.has(`${r.date}||${r.venue}||${r.raceNum}||${normName(r.name)}`));

  return [...rescoredDeduped, ...snapshots];
}
