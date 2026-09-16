// Pool Adjacent Violators Algorithm (PAVA) -- fits a monotonic
// (non-decreasing) step function to a set of (x, y) points, minimizing
// squared error. Used by lib/calibrationCurve.js to map raw model-implied
// win probability -> calibrated probability without inventing discrete
// bucket boundaries (the earlier one-off calibration investigation used
// hand-picked price buckets; this replaces that with a proper smoother).
//
// Standard PAVA via stack-based block merging: points must already be
// sorted by x ascending. Each point may carry a weight (defaults to 1) --
// used here to weight each bin by how many runners it represents.
export function fitIsotonic(points) {
  const stack = [];
  for (const p of points) {
    let block = { xMin: p.x, xMax: p.x, sumY: p.y * (p.w ?? 1), sumW: p.w ?? 1 };
    stack.push(block);
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      const below = stack[stack.length - 2];
      if (below.sumY / below.sumW <= top.sumY / top.sumW) break;
      stack.pop();
      stack.pop();
      stack.push({
        xMin: below.xMin, xMax: top.xMax,
        sumY: below.sumY + top.sumY, sumW: below.sumW + top.sumW,
      });
    }
  }
  return stack.map(b => ({ x: (b.xMin + b.xMax) / 2, y: b.sumY / b.sumW }));
}

// Piecewise-linear query against a monotonic curve (the output of
// fitIsotonic, or any array of {x,y} knots sorted by x ascending) --
// linear interpolation between knots, clamped flat beyond the first/last
// knot. This is what turns PAVA's step function into something smooth
// (no discontinuities at bucket/block boundaries) when applied at
// arbitrary query points.
export function interpolateCurve(curve, x) {
  if (!curve.length) return x;
  if (x <= curve[0].x) return curve[0].y;
  if (x >= curve[curve.length - 1].x) return curve[curve.length - 1].y;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return curve[curve.length - 1].y;
}

// Bins pre-sorted-by-x points into `numBins` equal-frequency groups
// (roughly equal count per bin, not equal-width in x) and returns one
// {x, y, w} per bin -- (mean x, mean y, count) -- for fitIsotonic to fit
// against, rather than every individual raw point. Equal-frequency
// (quantile) binning keeps resolution where the data is dense (most
// runners cluster at short-to-mid prices) instead of wasting bins on the
// sparse tail the way equal-width probability bins would.
export function equalFrequencyBins(sortedPoints, numBins) {
  const n = sortedPoints.length;
  if (!n) return [];
  const bins = [];
  const size = Math.max(1, Math.floor(n / numBins));
  for (let i = 0; i < n; i += size) {
    const chunk = sortedPoints.slice(i, i + size);
    if (!chunk.length) continue;
    const sumX = chunk.reduce((a, p) => a + p.x, 0);
    const sumY = chunk.reduce((a, p) => a + p.y, 0);
    bins.push({ x: sumX / chunk.length, y: sumY / chunk.length, w: chunk.length });
  }
  return bins;
}
