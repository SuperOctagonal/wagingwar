import { NextResponse } from 'next/server';
import { fetchRankedResultedRaces } from '@/lib/serverResultsData';

// Same floor as Score Bands — a metric with fewer than this many computable
// races shows "insufficient data" instead of a real (and easily misleading
// on a small n) percentage.
const MIN_SAMPLE = 10;

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every(x => s.has(x));
}

// Every exotic hit-rate is "would betting the model's own ranked
// selections have hit this bet type", using rankedNames (best-to-worst
// system score) against the actual finish order. Returns { metricKey:
// true/false/null } — null means this race's field was too small to even
// attempt that bet (e.g. a 3-horse field can't run a First 4).
function raceMetrics(rankedNames, finishers) {
  const byPlace = {};
  finishers.forEach(f => { byPlace[f.place] = f.name; });
  const p1 = byPlace[1], p2 = byPlace[2], p3 = byPlace[3], p4 = byPlace[4];
  const r = rankedNames;

  const m = {};
  m.win = p1 != null ? r[0] === p1 : null;
  m.anyTop2Win = (p1 != null && r.length >= 2) ? (p1 === r[0] || p1 === r[1]) : (p1 != null ? r[0] === p1 : null);
  m.exacta = (p1 != null && p2 != null && r.length >= 2) ? (r[0] === p1 && r[1] === p2) : null;
  m.quinella = (p1 != null && p2 != null && r.length >= 2) ? sameSet([r[0], r[1]], [p1, p2]) : null;
  m.trifectaExact = (p1 != null && p2 != null && p3 != null && r.length >= 3) ? (r[0] === p1 && r[1] === p2 && r[2] === p3) : null;
  m.triBox3 = (p1 != null && p2 != null && p3 != null && r.length >= 3) ? sameSet(r.slice(0, 3), [p1, p2, p3]) : null;
  m.triBox4 = (p1 != null && p2 != null && p3 != null && r.length >= 4) ? [p1, p2, p3].every(n => r.slice(0, 4).includes(n)) : null;
  m.triBox5 = (p1 != null && p2 != null && p3 != null && r.length >= 5) ? [p1, p2, p3].every(n => r.slice(0, 5).includes(n)) : null;
  m.first4Exact = (p1 != null && p2 != null && p3 != null && p4 != null && r.length >= 4) ? (r[0] === p1 && r[1] === p2 && r[2] === p3 && r[3] === p4) : null;
  m.first4Box4 = (p1 != null && p2 != null && p3 != null && p4 != null && r.length >= 4) ? sameSet(r.slice(0, 4), [p1, p2, p3, p4]) : null;
  m.first4Box5 = (p1 != null && p2 != null && p3 != null && p4 != null && r.length >= 5) ? [p1, p2, p3, p4].every(n => r.slice(0, 5).includes(n)) : null;
  m.first4Box6 = (p1 != null && p2 != null && p3 != null && p4 != null && r.length >= 6) ? [p1, p2, p3, p4].every(n => r.slice(0, 6).includes(n)) : null;
  return m;
}

const METRIC_KEYS = [
  'win', 'anyTop2Win', 'exacta', 'quinella',
  'trifectaExact', 'triBox3', 'triBox4', 'triBox5',
  'first4Exact', 'first4Box4', 'first4Box5', 'first4Box6',
];

function newTally() {
  const t = { races: 0 };
  METRIC_KEYS.forEach(k => { t[k] = { hits: 0, computable: 0 }; });
  return t;
}

function addToTally(tally, metrics) {
  tally.races++;
  METRIC_KEYS.forEach(k => {
    if (metrics[k] == null) return;
    tally[k].computable++;
    if (metrics[k]) tally[k].hits++;
  });
}

function tallyToRow(label, tally) {
  const row = { label, races: tally.races };
  METRIC_KEYS.forEach(k => {
    const { hits, computable } = tally[k];
    const insufficientData = computable < MIN_SAMPLE;
    row[k] = insufficientData ? null : hits / computable;
    row[`${k}_insufficientData`] = insufficientData;
    row[`${k}_computable`] = computable;
  });
  return row;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const end = searchParams.get('date');
  const windowParam = searchParams.get('window') || 'today';
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const { ok, races, startDate } = await fetchRankedResultedRaces(end, windowParam);
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  const byTrack = {};
  // "First 4" / "last 4" races of a meeting, by race number within that
  // specific card (not a fixed race number — meeting length varies).
  // Short meetings (<8 races) can have the two groups overlap; that's the
  // literal, correct reading of "first 4 vs last 4 of THIS meeting" rather
  // than a fixed cutoff.
  const byPosition = { first4: newTally(), last4: newTally() };

  races.forEach(({ venue, raceNum, meetingLength, rankedNames, finishers }) => {
    const metrics = raceMetrics(rankedNames, finishers);

    if (!byTrack[venue]) byTrack[venue] = newTally();
    addToTally(byTrack[venue], metrics);

    if (meetingLength) {
      const n = parseInt(raceNum, 10);
      if (!isNaN(n)) {
        if (n <= 4) addToTally(byPosition.first4, metrics);
        if (n > meetingLength - 4) addToTally(byPosition.last4, metrics);
      }
    }
  });

  const trackRows = Object.entries(byTrack)
    .map(([venue, tally]) => tallyToRow(venue, tally))
    .sort((a, b) => a.label.localeCompare(b.label));

  const positionRows = {
    first4: tallyToRow('First 4 races', byPosition.first4),
    last4: tallyToRow('Last 4 races', byPosition.last4),
  };

  return NextResponse.json({ byTrack: trackRows, byPosition: positionRows, dateRange: { start: startDate, end } });
}
