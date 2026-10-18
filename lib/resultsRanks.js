import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normaliseVenue, filterAuMeetings } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Public data, server-only caller (/api/results-ranks) -- service key for
// consistency with the rest of the server data layer.
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Shared by app/api/results-ranks/route.js and the homepage's model-stats
// computation (app/page.js) -- same scoring, same AU-only filtering, same
// { [venue]: { [raceNum]: {ranks, margin} } } shape, so there is exactly
// one place that computes a day's rank-1 picks, not two implementations
// that could drift.
export async function computeRanksForDate(date) {
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  const [cardsResult, scrRes, meetingsRes] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, headers),
    fetch(`${SURL}/rest/v1/scratchings?date=eq.${date}&select=venue,race_num,horse_name`, { headers }),
    fetch(`${SURL}/rest/v1/today_meetings?date=eq.${date}&select=venue,track_condition,condition_override`, { headers }),
  ]);

  if (!cardsResult.ok) return null;
  // Defense-in-depth: this reads straight from race_cards, independent of
  // the CSV-import path's own NZ exclusion, so an NZ (or otherwise
  // unrecognised) row that reaches the table by any means would still get
  // scored and ranked here. filterAuMeetings (blocklist), not
  // isKnownAuVenue (allowlist) -- an unlisted genuine AU venue must still
  // get scored/ranked, only a known NZ venue is excluded.
  const cardRows = filterAuMeetings(cardsResult.rows);
  const scrRows = scrRes.ok ? await scrRes.json() : [];
  const meetingsRows = meetingsRes.ok ? await meetingsRes.json() : [];

  // Same bucketing as the Races page so scoring uses the real per-venue
  // condition instead of always assuming Good.
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
    const margin = scored.length >= 2 ? scored[0].total - scored[1].total : null;

    if (!result[venue]) result[venue] = {};
    result[venue][raceNum] = { ranks, margin };
  });

  return result;
}
