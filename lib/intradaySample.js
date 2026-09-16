// Builds, per historical meeting (venue+date), the race-by-race sequence
// (ordered by post_time, same as it would have unfolded live) needed to
// retroactively validate Intraday Track DNA (lib/intradayTrackDna.js):
// each runner's PRE-race predicted running-style role (calcPaceMap, using
// real BP/espd from race_cards.form_data -- not reconstructed) and
// whether they won.

import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { calcPaceMap } from '@/lib/scoring';
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

// Returns [{ venue, date, races: [{ raceNum, postTime, runners: [{name, role, won}] }] }]
// sorted by postTime within each meeting.
export async function buildIntradaySample({ startDate, endDate }) {
  const [cardsRes, resultsRows, scheduleRows] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,form_data`, headers()),
    fetchAllRows(`${SURL}/rest/v1/race_results?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,horse_name,finish_pos,track_cond`, headers()),
    sb(`race_schedule?date=gte.${startDate}&date=lte.${endDate}&select=date,venue,race_num,post_time`),
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
  const postTimeIndex = new Map();
  scheduleRows.forEach(r => {
    postTimeIndex.set(`${r.date}||${normaliseVenue(r.venue)}||${r.race_num}`, r.post_time);
  });

  const races = {};
  for (const row of cardRows) {
    const normV = normaliseVenue(row.venue);
    const key = `${row.date}||${normV}||${row.race_num}`;
    if (!races[key]) races[key] = { date: row.date, venue: normV, raceNum: String(row.race_num), horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  }

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
        meta[`${normaliseVenue(rc.venue)}||${rc.num}`] = { dist: +((rc.dist || '').replace(/\D/g, '')) || 1200 };
      });
      csvMetaByDate[date] = meta;
    } catch { /* metadata-only */ }
  }));

  const meetings = {};
  for (const raceKey of Object.keys(races)) {
    const { date, venue, raceNum, horses } = races[raceKey];
    const active = horses.filter(h => !h.scratched);
    if (active.length < 2) continue;

    const trackCond = mapTrackCond(raceCondIndex.get(raceKey));
    const dist = csvMetaByDate[date]?.[`${venue}||${raceNum}`]?.dist ?? 1200;
    const postTime = postTimeIndex.get(raceKey) || '';

    const runners = [];
    for (const h of active) {
      const res = resultsIndex.get(`${raceKey}||${normResultName(h.name)}`);
      if (!res || res.finish_pos == null) continue;
      const { role } = calcPaceMap(h, venue, dist, trackCond);
      runners.push({ name: h.name, role, won: Number(res.finish_pos) === 1 });
    }
    if (runners.length < 2 || !runners.some(r => r.won)) continue;

    const mKey = `${venue}||${date}`;
    if (!meetings[mKey]) meetings[mKey] = { venue, date, races: [] };
    meetings[mKey].races.push({ raceNum, postTime, runners });
  }

  // Race number order, not a parse of the postTime string ("12.15 pm"
  // doesn't sort lexicographically into chronological order) -- races at
  // an AU meeting run in numbered sequence essentially without
  // exception, so this is the reliable ordering.
  return Object.values(meetings).map(m => ({
    ...m,
    races: m.races.sort((a, b) => +a.raceNum - +b.raceNum),
  }));
}
