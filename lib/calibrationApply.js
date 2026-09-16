// Pure, additive price remap -- never touches calculateMatrixOdds/PM
// (lib/scoring.js) or any existing scoring mechanics. Takes an
// already-computed price (myOdds, today's live WW$), converts to implied
// probability, remaps through the fitted calibration curve, converts back
// to a price. `curve` is the {x,y}[] knot array stored in
// score_calibration_curve.curve_points (see lib/calibrationCurve.js).
import { interpolateCurve } from '@/lib/isotonic';

export function applyCalibration(price, curve) {
  if (price == null || !(price > 0) || !curve?.length) return price;
  const rawProb = 1 / price;
  const calProb = interpolateCurve(curve, rawProb);
  if (!(calProb > 0)) return price;
  return 1 / calProb;
}
