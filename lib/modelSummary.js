import { normaliseVenue } from '@/lib/venues';

export function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Groups race_results rows into { "date||venue||raceNum": {date,venue,raceNum,trackCond,dist,runners} }.
// Shared by the Results page's rolling-window Daily Model Summary and the
// homepage's model-stats card -- same shape, same grouping, one
// implementation.
export function groupResultsByDateRace(rows) {
  const g = {};
  (rows || []).forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${row.date}||${norm}||${row.race_num}`;
    if (!g[key]) g[key] = {
      date: row.date, venue: norm, raceNum: row.race_num,
      trackCond: row.track_cond || '', dist: row.dist || '', runners: [],
    };
    if (row.finish_pos) g[key].runners.push({ place: row.finish_pos, name: row.horse_name, sp: row.sp || 0 });
  });
  return g;
}

// Given a map of resulted races (shape above) plus rankDataByRace (the
// server-computed { [venue]: { [raceNum]: {ranks, margin} } } from
// /api/results-ranks / lib/resultsRanks.js), builds the rank-1 pick record
// array -- the model's own top-rated-runner result for every race in the
// window. Shared by the Results page's Daily Model Summary (single-day and
// rolling-window) and the homepage's model-stats card: rank-1 name/margin
// come entirely from the server response, no scoring happens here, so this
// is the one place "did the model's top pick win/place" is decided.
export function buildRank1Records(groupedResults, rankDataByRace, extra = {}) {
  const records = [];
  Object.values(groupedResults).forEach(res => {
    if (!res.runners || !res.runners.length) return;
    const normVenue = normaliseVenue(res.venue);
    const raceRanks = rankDataByRace?.[normVenue]?.[res.raceNum];
    if (!raceRanks || !raceRanks.ranks) return;
    const rank1Norm = Object.keys(raceRanks.ranks).find(k => raceRanks.ranks[k] === 1);
    if (!rank1Norm) return;
    const runner = res.runners.find(r => normName(r.name) === rank1Norm);
    if (!runner || runner.place == null) return;
    records.push({
      venue: res.venue, raceNum: res.raceNum, trackCond: res.trackCond || 'good',
      dist: parseInt(res.dist, 10) || null,
      horse: runner.name, place: runner.place, sp: Number(runner.sp) || 0, margin: raceRanks.margin,
      ...extra,
    });
  });
  return records;
}

// Minimal win/top-3 summary from a rank-1 record set -- just the headline
// numbers the homepage card needs (total races, wins, top-3, the two
// percentages). The Results page's own buildSummaryFromRecords computes a
// much larger breakdown (venue/state/odds/distance/confidence tables) on
// top of the exact same `records` input; this is deliberately not that --
// same record set, same win/place definition (r.place === 1 / <= 3), just
// the subset of arithmetic the homepage card actually shows.
export function summarizeRank1Records(records) {
  if (!records.length) return null;
  const total = records.length;
  const wins = records.filter(r => r.place === 1).length;
  const top3 = records.filter(r => r.place >= 1 && r.place <= 3).length;
  return { total, wins, top3, winPct: wins / total, top3Pct: top3 / total };
}
