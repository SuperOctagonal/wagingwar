import { NextResponse } from 'next/server';
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Deliberately NOT Pro-gated, and not login-gated either — post-race ranks
// are proof of model performance, meant to be visible to every visitor
// (see Results-page rank-badge unlock, and /results being public in
// middleware.js). Scores server-side against the FULL (unstripped)
// race_cards data and returns only the computed rank/margin per race —
// never the raw scoring-input fields, so this is safe to expose to
// anyone: there is nothing in the response that could be used to
// reconstruct a real ranking, unlike the raw /api/race-cards or
// /api/today-csv payloads (both of which remain login+Pro-gated).
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  const [cardsResult, scrRes, meetingsRes] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, headers),
    fetch(`${SURL}/rest/v1/scratchings?date=eq.${date}&select=venue,race_num,horse_name`, { headers }),
    fetch(`${SURL}/rest/v1/today_meetings?date=eq.${date}&select=venue,track_condition,condition_override`, { headers }),
  ]);

  if (!cardsResult.ok) return NextResponse.json({ error: `Supabase ${cardsResult.status}` }, { status: 502 });
  // Defense-in-depth: this route reads straight from race_cards, independent
  // of the CSV-import path's isKnownAuVenue() exclusion, so a non-AU (or
  // otherwise unrecognised) row that reaches the table by any means -- a
  // stale write from before that fix, a manual edit, a future import bug --
  // would still get scored and ranked here. Filter again at read time rather
  // than trusting whatever's already in the table.
  const cardRows = cardsResult.rows.filter(row => isKnownAuVenue(row.venue));
  const scrRows = scrRes.ok ? await scrRes.json() : [];
  const meetingsRows = meetingsRes.ok ? await meetingsRes.json() : [];

  // Same bucketing as the Races page (app/races/page.js) so scoring uses the
  // real per-venue condition instead of always assuming Good -- a hardcoded
  // 'good' here silently reorders every non-Good race's ranks relative to
  // the live Races page, since trackCondWin factors score off softWin/
  // heavyWin/goodWin depending on this value (see getRawAndMetric in
  // lib/scoring.js).
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

  // Group into per-race horse arrays, same shape the client used to build
  // from the (now-stripped-for-free) /api/race-cards response.
  const races = {}; // key: `${venue}||${raceNum}` -> { venue, raceNum, horses: [] }
  cardRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${norm}||${row.race_num}`;
    if (!races[key]) races[key] = { venue: norm, raceNum: row.race_num, horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  });

  const weights = getDefaultWeights();
  const result = {};

  Object.values(races).forEach(({ venue, raceNum, horses }) => {
    const dbScrNames = new Set(
      scrRows
        .filter(r => normaliseVenue(r.venue) === venue && String(r.race_num) === String(raceNum))
        .map(r => normName(r.horse_name || ''))
    );
    const active = horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (!active.length) return;

    const trackCond = trackCondByVenue[venue] || 'good';
    const scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const total = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { name: h.name, total };
    }).sort((a, b) => b.total - a.total);

    const ranks = {};
    scored.forEach((h, i) => { ranks[normName(h.name)] = i + 1; });
    // race_cards doesn't store distance/class per row (that's a race_results
    // field the caller already has from its own results fetch) — only ranks
    // and the rank1-vs-rank2 score gap are this route's job.
    const margin = scored.length >= 2 ? scored[0].total - scored[1].total : null;

    if (!result[venue]) result[venue] = {};
    result[venue][raceNum] = { ranks, margin };
  });

  return NextResponse.json(result);
}
