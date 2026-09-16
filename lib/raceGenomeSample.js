// Builds the per-race context vector + per-runner (group scores, outcome)
// sample that Race Genome Matching (lib/raceGenome.js) is fit and
// validated against. Reuses the same re-score method as Phase 2/3
// (scoreGroup/GRP_KEYS, deterministic) and the same CSV-for-distance/
// class trick as Phase 1's capture module (race-level distance/class
// isn't stored anywhere in Supabase pre-result).

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normResultName } from '@/lib/raceResults';

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

function mapTrackCond(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('heavy')) return 'heavy';
  if (s.includes('soft') || s.includes('slow')) return 'soft';
  if (s.includes('synth')) return 'synthetic';
  return 'good';
}

// Extracts a numeric class rating from strings like "BM60", "3YB-64",
// "R-56" (the last number in the string) -- null (e.g. "MAIDEN",
// "GROUP1" carries no comparable numeric rating) is a genuinely distinct
// context, not a missing value to impute.
function classRating(cls) {
  if (!cls) return null;
  const m = String(cls).match(/(\d+)(?!.*\d)/);
  return m ? +m[1] : null;
}

// Returns { races: [{ raceKey, date, venue, raceNum, distance, trackCond,
// classRating, fieldSize, runners: [{name, form, speed, cond, conn, won}] }] }
export async function buildRaceGenomeSample({ startDate, endDate }) {
  const [cardsRes, resultsRows] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,form_data`, headers()),
    fetchAllRows(`${SURL}/rest/v1/race_results?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,finish_pos,track_cond`, headers()),
  ]);
  if (!cardsRes.ok) return [];
  const cardRows = cardsRes.rows.filter(row => isKnownAuVenue(row.venue));
  const resultRows = resultsRows.ok ? resultsRows.rows : [];

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

  // Distance/class metadata: one CSV fetch per distinct date in range
  // (not per race) -- the day's own CSV is the only source, same as
  // Phase 1's capture module.
  const dates = [...new Set(Object.values(races).map(r => r.date))];
  const csvMetaByDate = {};
  await Promise.all(dates.map(async date => {
    const text = await fetch(`${SURL}/storage/v1/object/wizard-csv/${date}.csv`, { headers: headers() }).then(r => r.ok ? r.text() : null).catch(() => null);
    if (!text) return;
    try {
      const venuesWithCards = new Set(Object.values(races).filter(r => r.date === date).map(r => r.venue));
      const { allRaces: csvRaces } = buildRaces(parseCSV(text), venuesWithCards);
      const meta = {};
      Object.values(csvRaces).forEach(rc => {
        meta[`${normaliseVenue(rc.venue)}||${rc.num}`] = { dist: +((rc.dist || '').replace(/\D/g, '')) || null, cls: rc.cls || null };
      });
      csvMetaByDate[date] = meta;
    } catch { /* metadata-only */ }
  }));

  const weights = getDefaultWeights();
  const out = [];

  for (const raceKey of Object.keys(races)) {
    const { date, venue, raceNum, horses } = races[raceKey];
    const active = horses.filter(h => !h.scratched);
    if (active.length < 2) continue;

    const trackCond = mapTrackCond(raceCondIndex.get(raceKey));
    const meta = csvMetaByDate[date]?.[`${venue}||${raceNum}`] || {};

    const runners = [];
    for (const h of active) {
      const res = resultsIndex.get(`${raceKey}||${normResultName(h.name)}`);
      if (!res || res.finish_pos == null) continue;
      const grp = {};
      GRP_KEYS.forEach(gk => { grp[gk] = scoreGroup(h, gk, weights, trackCond).total; });
      runners.push({ name: h.name, form: grp.form, speed: grp.speed, cond: grp.cond, conn: grp.conn, won: Number(res.finish_pos) === 1 });
    }
    if (runners.length < 2) continue;

    out.push({
      raceKey, date, venue, raceNum,
      distance: meta.dist ?? null,
      trackCond,
      classRating: classRating(meta.cls),
      fieldSize: active.length,
      runners,
    });
  }
  return out;
}
