// Shared server-side helper for the Results-page aggregate cards
// (/api/results-score-bands, /api/results-exotics). Both need the same
// thing: every resulted race in a date window, each active runner's
// computed system score/rank, and the actual finishing order — built once
// here so the join/scoring logic (race_cards + race_results + scratchings +
// today_meetings, scored via lib/scoring.js) can't drift between the two
// routes.
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// "Last N distinct racing days with resulted data, ending on `end`" — same
// window definition the client's rolling 7-day/30-day trend already uses,
// so a race-free calendar date never silently shrinks the window.
export async function resolveWindowDates(end, days, headers) {
  if (!days) return [end];
  const result = await fetchAllRows(
    `${SURL}/rest/v1/race_results?select=date&date=lte.${end}&order=date.desc`,
    headers,
  );
  if (!result.ok) return [end];
  const distinct = [...new Set(result.rows.map(r => r.date))].sort().reverse();
  return distinct.slice(0, days);
}

// Returns { ok, startDate, races } where races is an array of:
//   { date, venue, raceNum, trackCond,
//     rankedNames: [normName, ...] sorted best-to-worst by system score,
//     finishers: [{ place, name (normName), sp }, ...] sorted by place }
// Only includes races that have BOTH a scoreable card and a resulted finish
// order. `finishers` includes every placed runner race_results has (not
// just top 3/4) since callers need up to 4th for First 4 hit-rates.
export async function fetchRankedResultedRaces(end, windowKey) {
  if (!SURL || !SKEY) return { ok: false, races: [], startDate: end };
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
  const days = windowKey === '7d' ? 7 : windowKey === '30d' ? 30 : 0;

  const dates = await resolveWindowDates(end, days, headers);
  if (!dates.length) return { ok: true, races: [], startDate: end };
  const startDate = dates[dates.length - 1];
  const dateSet = new Set(dates);

  const [cardsResult, resultsResult, scrResult, meetingsResult, scheduleResult] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?select=date,venue,race_num,form_data&date=gte.${startDate}&date=lte.${end}`, headers),
    fetchAllRows(`${SURL}/rest/v1/race_results?select=date,venue,race_num,finish_pos,horse_name,sp&date=gte.${startDate}&date=lte.${end}`, headers),
    fetchAllRows(`${SURL}/rest/v1/scratchings?select=date,venue,race_num,horse_name&date=gte.${startDate}&date=lte.${end}`, headers),
    fetchAllRows(`${SURL}/rest/v1/today_meetings?select=date,venue,track_condition,condition_override&date=gte.${startDate}&date=lte.${end}`, headers),
    fetchAllRows(`${SURL}/rest/v1/race_schedule?select=date,venue,race_num&date=gte.${startDate}&date=lte.${end}`, headers),
  ]);
  if (!cardsResult.ok || !resultsResult.ok) return { ok: false, races: [], startDate };

  const cardRows = cardsResult.rows.filter(r => dateSet.has(r.date) && isKnownAuVenue(r.venue));
  const resultRows = resultsResult.rows.filter(r => dateSet.has(r.date));
  const scrRows = scrResult.ok ? scrResult.rows : [];
  const meetingsRows = meetingsResult.ok ? meetingsResult.rows : [];
  const scheduleRows = scheduleResult.ok ? scheduleResult.rows : [];

  const trackCondByKey = {};
  meetingsRows.forEach(r => {
    const norm = normaliseVenue(r.venue);
    const effective = (r.condition_override || r.track_condition || '').toLowerCase();
    if (!effective) return;
    trackCondByKey[`${r.date}||${norm}`] = effective.includes('heavy') ? 'heavy'
      : effective.includes('soft') || effective.includes('slow') ? 'soft'
      : effective.includes('synth') ? 'synthetic'
      : 'good';
  });

  // Meeting length per date+venue, preferring the scheduled card (correct
  // even if the last race hasn't resulted yet) and falling back to the max
  // resulted race_num for dates before race_schedule existed (2026-06-30+).
  const meetingLength = {}; // `${date}||${venue}` -> max race_num
  scheduleRows.forEach(r => {
    const norm = normaliseVenue(r.venue);
    const key = `${r.date}||${norm}`;
    const n = parseInt(r.race_num, 10);
    if (!isNaN(n)) meetingLength[key] = Math.max(meetingLength[key] || 0, n);
  });
  resultRows.forEach(r => {
    const norm = normaliseVenue(r.venue);
    const key = `${r.date}||${norm}`;
    if (meetingLength[key] != null) return; // schedule already covers this meeting
    const n = parseInt(r.race_num, 10);
    if (!isNaN(n)) meetingLength[key] = Math.max(meetingLength[key] || 0, n);
  });

  const races = {};
  cardRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${row.date}||${norm}||${row.race_num}`;
    if (!races[key]) races[key] = { date: row.date, venue: norm, raceNum: row.race_num, horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  });

  const resultsByRace = {};
  resultRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${row.date}||${norm}||${row.race_num}`;
    if (!resultsByRace[key]) resultsByRace[key] = [];
    if (row.finish_pos != null) {
      resultsByRace[key].push({ place: row.finish_pos, name: normName(row.horse_name), sp: Number(row.sp) || 0 });
    }
  });

  // Indexed once by date||venue||race_num instead of filtering the full
  // scrRows array inside the races loop below -- at 30-day scale that
  // filter ran per race (~1,500 races x ~4,200 scratchings rows, since
  // every race rescanned every scratching in the whole window), which was
  // the actual cause of the Exotic Bet Hit Rates card hanging.
  const scrNamesByKey = {};
  scrRows.forEach(r => {
    const key = `${r.date}||${normaliseVenue(r.venue)}||${r.race_num}`;
    if (!scrNamesByKey[key]) scrNamesByKey[key] = new Set();
    scrNamesByKey[key].add(normName(r.horse_name || ''));
  });

  const weights = getDefaultWeights();
  const out = [];

  Object.entries(races).forEach(([key, { date, venue, raceNum, horses }]) => {
    const finishers = resultsByRace[key];
    if (!finishers || !finishers.length) return;

    const dbScrNames = scrNamesByKey[`${date}||${venue}||${raceNum}`] || new Set();
    const active = horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (!active.length) return;

    const trackCond = trackCondByKey[`${date}||${venue}`] || 'good';
    const scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const total = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { name: normName(h.name), total };
    }).sort((a, b) => b.total - a.total);

    out.push({
      date, venue, raceNum,
      trackCond,
      meetingLength: meetingLength[`${date}||${venue}`] || null,
      rankedNames: scored.map(s => s.name),
      scoresByName: Object.fromEntries(scored.map(s => [s.name, s.total])),
      finishers: finishers.slice().sort((a, b) => a.place - b.place),
    });
  });

  return { ok: true, races: out, startDate };
}
