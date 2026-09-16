// Phase 1 of the self-learning scoring project: a permanent, ever-growing
// per-runner snapshot of each race's full scoring context, the model's
// output, and the live market price at capture time, written to
// race_feature_snapshots. Pure data capture -- read by no live-facing
// page/route, and this module never touches race_cards/odds_snapshot/
// race_results, only reads them. finish_pos/margin/sp are deliberately
// NOT duplicated into the snapshot -- join against race_results by (date,
// venue, race_num, horse_name) at analysis time instead, the same
// convention already used by the Value Bets/Movers Result columns
// (lib/raceResults.js).
//
// Capture timing: piggybacked onto app/api/puntersedge-refs/route.js's
// existing POST handler -- the only already-scheduled (external cron,
// roughly every 15-30min based on observed odds_snapshot captured_at
// deltas) periodic trigger anywhere in this codebase. There's no existing
// per-race "just jumped" mechanism to hook into instead, and standing up
// a *second* externally-scheduled cron purely for this is infrastructure
// this change can't provision from inside the app. Within that periodic
// call, captureRaceFeatureSnapshots() filters to races that have JUST
// jumped (hasRaceJumped()) and don't already have any snapshot rows for
// today, so each race is captured exactly once, at the first opportunity
// after lock-in -- not on every page load, and not hours early.

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calculateMatrixOdds, blendFirstStarterLivePrices, calcPaceMap, pointsForPlace } from '@/lib/scoring';
import { hasRaceJumped } from '@/lib/raceTime';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

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

export async function captureRaceFeatureSnapshots(date) {
  const summary = { date, racesEligible: 0, racesAlreadyCaptured: 0, racesCaptured: 0, rowsWritten: 0, errors: [] };
  if (!SURL || !SKEY) { summary.errors.push('Supabase service env vars not set'); return summary; }

  const [scheduleRows, alreadyCaptured, cardsResult, scrRows, meetingsRows, resultRows, csvText] = await Promise.all([
    sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`),
    sb(`race_feature_snapshots?date=eq.${date}&select=venue,race_num`),
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, headers()),
    sb(`scratchings?date=eq.${date}&select=venue,race_num,horse_name`),
    sb(`today_meetings?date=eq.${date}&select=venue,track_condition,condition_override`),
    sb(`race_results?date=eq.${date}&select=venue,race_num,horse_name,finish_pos`),
    fetch(`${SURL}/storage/v1/object/wizard-csv/${date}.csv`, { headers: headers() }).then(r => r.ok ? r.text() : null).catch(() => null),
  ]);

  // Idempotency: a race with ANY existing snapshot row today is treated as
  // already captured (rows for a race are only ever written together, in
  // one batch, at the end of this function -- see the final insert below
  // -- so a partial per-race capture can't happen; either a race's rows
  // all landed, or none did and it's retried next poll).
  const capturedKeys = new Set(alreadyCaptured.map(r => `${normaliseVenue(r.venue)}||${r.race_num}`));

  const races = [...new Map(
    scheduleRows.map(r => [`${normaliseVenue(r.venue)}||${r.race_num}`, { venue: normaliseVenue(r.venue), raceNum: String(r.race_num), postTime: r.post_time }])
  ).values()];
  const eligible = races.filter(r => hasRaceJumped(date, r.postTime) && !capturedKeys.has(`${r.venue}||${r.raceNum}`));
  summary.racesEligible = eligible.length;
  summary.racesAlreadyCaptured = races.length - eligible.length;
  if (!eligible.length) return summary;

  if (!cardsResult.ok) { summary.errors.push(`race_cards fetch ${cardsResult.status}`); return summary; }
  const cardRows = cardsResult.rows.filter(row => isKnownAuVenue(row.venue));

  const trackCondByVenue = {};
  meetingsRows.forEach(r => {
    const norm = normaliseVenue(r.venue);
    const effectiveCond = (r.condition_override || r.track_condition || '').toLowerCase();
    if (effectiveCond) trackCondByVenue[norm] = mapTrackCond(effectiveCond);
  });

  const raceMap = {};
  cardRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${norm}||${row.race_num}`;
    if (!raceMap[key]) raceMap[key] = { venue: norm, raceNum: String(row.race_num), horses: [] };
    if (row.form_data) raceMap[key].horses.push(row.form_data);
  });

  // Race-level distance/class isn't stored anywhere in Supabase before a
  // race is resulted (race_results only gets a row once scraped) -- the
  // day's own CSV is the only source, the same one race_cards.form_data
  // was itself built from. Parsed once here purely for this metadata;
  // runner scoring below still reads race_cards.form_data, exactly like
  // the live Field tab/Value Bets/Movers pipelines, not a fresh re-score
  // straight from the CSV.
  const venuesWithCards = new Set(Object.values(raceMap).map(r => r.venue));
  const csvRaceMeta = {};
  if (csvText) {
    try {
      const { allRaces: csvRaces } = buildRaces(parseCSV(csvText), venuesWithCards);
      Object.values(csvRaces).forEach(rc => {
        csvRaceMeta[`${normaliseVenue(rc.venue)}||${rc.num}`] = { dist: rc.dist || null, cls: rc.cls || null };
      });
    } catch { /* metadata-only -- a parse failure here shouldn't block capture */ }
  }

  // Meeting-wide Pace Bias points -- same algorithm/shape as the Races
  // page's own paceBiasPoints useMemo (app/races/page.js): every already-
  // resulted race at this venue today, top-3 finishers' pre-race predicted
  // role earns pointsForPlace(). Reuses calcPaceMap/pointsForPlace from
  // lib/scoring.js rather than a second implementation. Computed once per
  // venue, cached, not recomputed per runner.
  const paceBiasByVenue = {};
  function paceBiasForVenue(venue) {
    if (paceBiasByVenue[venue]) return paceBiasByVenue[venue];
    const roles = { Leader: 0, Presser: 0, Midfield: 0, Closer: 0, Backmarker: 0 };
    const trackCond = trackCondByVenue[venue] || 'good';
    resultRows
      .filter(r => normaliseVenue(r.venue) === venue && r.finish_pos >= 1 && r.finish_pos <= 3)
      .forEach(r => {
        const key = `${venue}||${String(r.race_num)}`;
        const rc = raceMap[key];
        if (!rc) return;
        const horse = rc.horses.find(h => normName(h.name) === normName(r.horse_name));
        if (!horse) return;
        const dist = +((csvRaceMeta[key]?.dist || '').replace(/\D/g, '')) || 0;
        const { role } = calcPaceMap(horse, venue, dist, trackCond);
        if (role in roles) roles[role] += pointsForPlace(r.finish_pos);
      });
    paceBiasByVenue[venue] = roles;
    return roles;
  }

  const weights = getDefaultWeights();

  const perRace = await Promise.all(eligible.map(async ({ venue, raceNum }) => {
    const key = `${venue}||${raceNum}`;
    const rc = raceMap[key];
    if (!rc || !rc.horses.length) return [];

    const dbScrNames = new Set(
      scrRows.filter(r => normaliseVenue(r.venue) === venue && String(r.race_num) === raceNum).map(r => normName(r.horse_name || ''))
    );
    const active = rc.horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (active.length < 2) return []; // calculateMatrixOdds needs a real field to rank against

    const trackCond = trackCondByVenue[venue] || 'good';
    let scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...h, grpScores, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
    // Same blend the live Field tab/Value Bets pipeline applies (9e9c70c)
    // -- must run before calculateMatrixOdds so the captured rank/price
    // matches exactly what a user would have seen at this moment.
    scored = blendFirstStarterLivePrices(scored, flags, nameKey);

    const oddsArr = calculateMatrixOdds(scored);
    const meta = csvRaceMeta[key] || {};
    const paceBias = paceBiasForVenue(venue);

    return scored.map((h, i) => {
      const marketPrice = flags[nameKey(h.name)]?.current ?? null;
      // Same condition blendFirstStarterLivePrices itself gates on --
      // whether this specific runner actually got blended, not just
      // whether the race had any first starter with a live price.
      const blendApplied = Number(h.starts) === 0 && flags?.[nameKey(h.name)]?.current > 0;
      return {
        date, venue, race_num: raceNum, horse_name: h.name,
        distance: meta.dist || null,
        track_cond: trackCond,
        class: meta.cls || null,
        field_size: active.length,
        today_pace_bias: paceBias,
        form_score: h.grpScores.form.total,
        speed_score: h.grpScores.speed.total,
        cond_score: h.grpScores.cond.total,
        conn_score: h.grpScores.conn.total,
        total_score: h.totalFromGroups,
        ww_price: oddsArr[i],
        field_rank: i + 1,
        market_price: marketPrice,
        starts: h.starts != null ? Number(h.starts) : null,
        first_starter_live_blend_applied: blendApplied,
      };
    });
  }));

  const rowsToInsert = perRace.flat();
  summary.racesCaptured = perRace.filter(r => r.length).length;

  if (rowsToInsert.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/race_feature_snapshots?on_conflict=date,venue,race_num,horse_name`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rowsToInsert),
      });
      if (!r.ok) {
        summary.errors.push(`race_feature_snapshots insert ${r.status}: ${await r.text()}`);
      } else {
        summary.rowsWritten = rowsToInsert.length;
      }
    } catch (err) {
      summary.errors.push(`race_feature_snapshots insert network error: ${err.message}`);
    }
  }

  return summary;
}
