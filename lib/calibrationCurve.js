// Fits and validates the isotonic calibration curve (lib/isotonic.js) that
// maps raw model-implied win probability -> a calibrated probability,
// from a (modelProb, won) sample (lib/calibrationSample.js).

import { fitIsotonic, interpolateCurve, equalFrequencyBins } from '@/lib/isotonic';

const PRICE_BUCKETS = [
  ['<$2', 0, 2], ['$2-3', 2, 3], ['$3-5', 3, 5], ['$5-10', 5, 10], ['$10-20', 10, 20],
  ['$20-30', 20, 30], ['$30-50', 30, 50], ['$50-75', 50, 75], ['$75-150', 75, 150], ['$150+', 150, Infinity],
];
function bucketForPrice(price) {
  for (const [label, lo, hi] of PRICE_BUCKETS) if (price >= lo && price < hi) return label;
  return null;
}

function brierScore(points) {
  if (!points.length) return null;
  const sum = points.reduce((a, p) => a + (p.pred - (p.won ? 1 : 0)) ** 2, 0);
  return sum / points.length;
}

// Fits the deployable curve -- bins the (already-sorted) sample by
// equal-frequency price bins, then runs PAVA. Sorting/binning happens
// here so callers (fit-for-storage vs fit-on-train-for-validation) share
// one implementation.
export function fitCurve(sample, { numBins = 150 } = {}) {
  const points = sample.map(s => ({ x: s.modelProb, y: s.won ? 1 : 0 })).sort((a, b) => a.x - b.x);
  const bins = equalFrequencyBins(points, numBins);
  return fitIsotonic(bins);
}

function bucketReport(sample, curve) {
  const byBucket = {};
  PRICE_BUCKETS.forEach(([label]) => { byBucket[label] = { n: 0, wins: 0, sumRaw: 0, sumCal: 0 }; });
  for (const s of sample) {
    const price = 1 / s.modelProb;
    const label = bucketForPrice(price);
    if (!label) continue;
    const b = byBucket[label];
    b.n++;
    if (s.won) b.wins++;
    b.sumRaw += s.modelProb;
    b.sumCal += interpolateCurve(curve, s.modelProb);
  }
  return PRICE_BUCKETS.map(([label]) => {
    const b = byBucket[label];
    if (!b.n) return { bucket: label, n: 0 };
    const actual = b.wins / b.n;
    const rawAvg = b.sumRaw / b.n;
    const calAvg = b.sumCal / b.n;
    return {
      bucket: label, n: b.n, actualWinRate: actual,
      rawModelProb: rawAvg, rawRatio: rawAvg > 0 ? actual / rawAvg : null,
      calModelProb: calAvg, calRatio: calAvg > 0 ? actual / calAvg : null,
    };
  });
}

// Out-of-sample validation: split by date (first half trains, second half
// tests -- same methodology as the earlier one-off investigation), fit
// the curve on train only, score both raw and calibrated probabilities
// against test. Returns Brier scores (lower is better -- the single
// scalar "did this genuinely improve" gate) plus the full bucket table
// for a human-readable before/after.
export function validateOutOfSample(sample, { splitFraction = 0.5, numBins = 150 } = {}) {
  const dates = [...new Set(sample.map(s => s.date))].sort();
  if (dates.length < 4) return null; // too little date spread to split meaningfully
  const splitIdx = Math.floor(dates.length * splitFraction);
  const splitDate = dates[splitIdx];
  const train = sample.filter(s => s.date < splitDate);
  const test = sample.filter(s => s.date >= splitDate);
  if (!train.length || !test.length) return null;

  const trainCurve = fitCurve(train, { numBins });

  const rawBrier = brierScore(test.map(s => ({ pred: s.modelProb, won: s.won })));
  const calBrier = brierScore(test.map(s => ({ pred: interpolateCurve(trainCurve, s.modelProb), won: s.won })));

  return {
    splitDate,
    trainDates: dates.filter(d => d < splitDate).length,
    testDates: dates.filter(d => d >= splitDate).length,
    trainN: train.length,
    testN: test.length,
    rawBrier,
    calBrier,
    improved: calBrier < rawBrier,
    improvementPct: rawBrier > 0 ? ((rawBrier - calBrier) / rawBrier) * 100 : null,
    buckets: bucketReport(test, trainCurve),
  };
}
