// The SINGLE shared entry point for turning calculateMatrixOdds' output
// into the final, live WW $ every user-facing consumer shows -- Field
// tab, Pace Map, Odds tab's Edge$/SP display (all via app/races/page.js's
// `results`) and Value Bets (lib/valueBets.js) all call this instead of
// calculateMatrixOdds directly, so there is exactly one place calibration
// is applied and no way for two surfaces to disagree. (Movers and the
// Odds tab's Best column never had a model price at all -- pure live
// market prices -- so they're unaffected either way.)
//
// Deliberately NOT used by lib/raceFeatureSnapshots.js (Phase 1's
// training-data capture) or lib/calibrationSample.js/lib/trustSample.js/
// lib/raceGenomeSample.js (Phase 2/3/4's own historical re-scoring) --
// those need calculateMatrixOdds' RAW, pre-calibration output by design:
// it's the actual input the calibration curve itself is fit and
// validated against. Routing them through this function would feed
// already-calibrated output back in as if it were raw model output,
// corrupting every future recalibration.
//
// calculateMatrixOdds/PM/blendFirstStarterLivePrices themselves are
// completely unchanged (lib/scoring.js) -- this is a downstream,
// additive wrapper, not a modification to the pricing mechanics.

import { calculateMatrixOdds } from '@/lib/scoring';
import { applyCalibration } from '@/lib/calibrationApply';

// Kill switch: set NEXT_PUBLIC_CALIBRATION_ENABLED=false to revert to
// the pre-calibration (raw) price everywhere calculateLiveOdds is used,
// with no redeploy beyond an env var change. Defaults to enabled.
export const CALIBRATION_ENABLED = process.env.NEXT_PUBLIC_CALIBRATION_ENABLED !== 'false';

export function calculateLiveOdds(sortedHorses, curvePoints) {
  const raw = calculateMatrixOdds(sortedHorses);
  if (!CALIBRATION_ENABLED || !curvePoints?.length) return raw;
  return raw.map(price => applyCalibration(price, curvePoints));
}
