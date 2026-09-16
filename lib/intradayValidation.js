// Retroactive validation for Intraday Track DNA: for each historical
// meeting, replays its race-by-race sequence (lib/intradaySample.js) as
// it would have unfolded live -- at race i, only races 0..i-1's actual
// results are known -- and compares a uniform-baseline prediction against
// the same baseline adjusted by lib/intradayTrackDna.js's role ratios.
//
// Deliberately isolates the role-timing signal from Phase 2/3's full
// model (a flat 1/fieldSize baseline, not the calibrated model price) --
// this tests the specific, narrow hypothesis Part B makes (does a
// meeting's own early-race pace bias predict its later winners) rather
// than entangling it with everything else already validated separately.

import { computeIntradayRoleAdjustment, applyIntradayAdjustment } from '@/lib/intradayTrackDna';

function brier(points) {
  if (!points.length) return null;
  return points.reduce((a, p) => a + (p.pred - (p.won ? 1 : 0)) ** 2, 0) / points.length;
}

export function validateIntradayTrackDna(meetings) {
  const baselinePoints = [];
  const adjustedPoints = [];
  let gatedRaces = 0, adjustedRaces = 0, totalRaces = 0;

  for (const meeting of meetings) {
    const resultedSoFar = [];
    for (const race of meeting.races) {
      const n = race.runners.length;
      if (!n) continue;
      totalRaces++;

      const adjustment = computeIntradayRoleAdjustment(resultedSoFar);
      race.runners.forEach(r => baselinePoints.push({ pred: 1 / n, won: r.won }));

      if (adjustment.applied) {
        adjustedRaces++;
        const raw = race.runners.map(r => 1 / applyIntradayAdjustment(1 / (1 / n), r.role, adjustment));
        // applyIntradayAdjustment works in price-space; feeding it a
        // price of 1/(1/n) = n keeps this consistent with how it's used
        // for real prices elsewhere, then convert back to probability.
        const probs = raw.map(price => 1 / price);
        const sum = probs.reduce((a, b) => a + b, 0);
        race.runners.forEach((r, i) => adjustedPoints.push({ pred: probs[i] / sum, won: r.won }));
      } else {
        gatedRaces++;
        race.runners.forEach(r => adjustedPoints.push({ pred: 1 / n, won: r.won }));
      }

      const winner = race.runners.find(r => r.won);
      if (winner) resultedSoFar.push({ winnerRole: winner.role });
    }
  }

  const baselineBrier = brier(baselinePoints);
  const adjustedBrier = brier(adjustedPoints);
  return {
    totalRaces, gatedRaces, adjustedRaces,
    totalRunners: baselinePoints.length,
    baselineBrier, adjustedBrier,
    improved: adjustedBrier < baselineBrier,
    improvementPct: baselineBrier > 0 ? ((baselineBrier - adjustedBrier) / baselineBrier) * 100 : null,
  };
}
