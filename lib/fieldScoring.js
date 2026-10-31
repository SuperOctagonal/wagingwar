// One race's model ranking, shared by the Races page Field tab
// (app/races/page.js) and Top 3 at a glance (lib/topThree.js) so the two
// can never rank a race differently. Extracted from the Races page's own
// scoring block, unchanged:
//
//   1. barriers renumbered 1, 2, 3... in original BP order across the live
//      (non-scratched) field -- barrier is a scoring factor, so a
//      scratching re-ranks the rest of the field;
//   2. every runner scored with scoreGroup per group, sorted by the total;
//   3. starts=0 runners blended with their live market price when one
//      exists (blendFirstStarterLivePrices);
//   4. WW $ from the calibrated pricing (calculateLiveOdds);
//   5. systemRank = model rank.
//
// Pure functions, no fetching -- safe on both client and server.

import { scoreGroup, GRP_KEYS, blendFirstStarterLivePrices } from '@/lib/scoring';
import { calculateLiveOdds } from '@/lib/livePricing';

// today_meetings track_condition / condition_override text ("Soft 6",
// "Heavy 10", "Synthetic") -> the scoring key, or null when blank.
export function trackCondKey(raw) {
  const tcl = (raw || '').toLowerCase();
  if (!tcl) return null;
  return tcl.includes('heavy') ? 'heavy'
    : tcl.includes('soft') || tcl.includes('slow') ? 'soft'
    : tcl.includes('synth') ? 'synthetic'
    : 'good';
}

// Live field with barriers renumbered 1..n in original BP order.
export function renumberBarriers(active) {
  const byOrigBP = [...active].sort((a, b) => (+a['BP'] || 99) - (+b['BP'] || 99));
  const barrierMap = new Map(byOrigBP.map((h, i) => [h.name, i + 1]));
  return active.map(h => ({ ...h, 'BP': barrierMap.get(h.name) ?? +h['BP'] ?? 99 }));
}

// Scores and prices an already-renumbered live field. Returns a new array,
// model order, each runner with grpScores, totalFromGroups, myOdds and
// systemRank. liveFlags: fetchMarketMoveFlags() output for the race ({}
// when none); nameKeyFn: lib/marketMoves.js nameKey; curvePoints: the
// active calibration curve's points, or null.
export function scoreField(field, { trackCond = 'good', weights, liveFlags = {}, nameKeyFn, curvePoints = null }) {
  let res = field.map(h => {
    const grpScores = {};
    GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
    const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
    return { ...h, grpScores, totalFromGroups };
  }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);
  res = blendFirstStarterLivePrices(res, liveFlags, nameKeyFn, curvePoints);
  const oddsArr = calculateLiveOdds(res, curvePoints);
  res.forEach((r, i) => { r.myOdds = oddsArr[i]; r.systemRank = i + 1; });
  return res;
}
