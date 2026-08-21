import { NextResponse } from 'next/server';
import { fetchRankedResultedRaces } from '@/lib/serverResultsData';

// Minimum resulted starts a band needs before its win%/ROI is shown — a
// single lucky/unlucky race in a rarely-hit band would otherwise produce a
// misleading 100%/0%.
const MIN_SAMPLE = 10;

// 20-point bands. The spec's example numbers (300-330 etc.) assumed a much
// higher score ceiling than the live model actually produces — measured
// directly against 2026-08-20's race_cards (320 runners, default weights):
// min 5.7, median 38.5, p90 50.4, p99 59.6, max 62.6. Theoretical ceiling
// with every factor maxed at default weights is ~81. Calibrated to that
// real range instead: three 20-point bands plus an open top band, rather
// than the originally-assumed 100-340 range which would put ~100% of
// scores in a single "<100" bucket (confirmed — that's exactly what
// happened before this recalibration).
const BAND_FLOORS = [60, 40, 20];

function bandLabel(score) {
  for (const floor of BAND_FLOORS) {
    if (score >= floor) return floor === BAND_FLOORS[0] ? `${floor}+` : `${floor}-${floor + 19}`;
  }
  return '<20';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const end = searchParams.get('date');
  const windowParam = searchParams.get('window') || 'today'; // 'today' | '7d' | '30d'
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const { ok, races, startDate } = await fetchRankedResultedRaces(end, windowParam);
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  // Every runner (not just the model's rank-1 pick) gets bucketed by its own
  // score — this re-cuts the same resulted-race pool the Rank 1 Strike Rate
  // card uses, by score range instead of rank.
  const bandTally = {};
  races.forEach(({ rankedNames, scoresByName, finishers }) => {
    const placeByName = {};
    finishers.forEach(f => { placeByName[f.name] = f; });

    rankedNames.forEach(name => {
      const f = placeByName[name];
      if (!f) return; // scratched post-scoring / name mismatch
      const label = bandLabel(scoresByName[name]);
      if (!bandTally[label]) bandTally[label] = { starts: 0, wins: 0, pnl: 0 };
      bandTally[label].starts++;
      if (f.place === 1) {
        bandTally[label].wins++;
        bandTally[label].pnl += f.sp - 1;
      } else {
        bandTally[label].pnl -= 1;
      }
    });
  });

  const orderedLabels = [...BAND_FLOORS.map(f => f === BAND_FLOORS[0] ? `${f}+` : `${f}-${f + 19}`), '<20'];
  const bands = orderedLabels
    .filter(label => bandTally[label])
    .map(label => {
      const t = bandTally[label];
      const insufficientData = t.starts < MIN_SAMPLE;
      return {
        label,
        starts: t.starts,
        wins: t.wins,
        winPct: insufficientData ? null : t.wins / t.starts,
        roiPct: insufficientData ? null : (t.pnl / t.starts) * 100,
        insufficientData,
      };
    });

  return NextResponse.json({ bands, dateRange: { start: startDate, end } });
}
