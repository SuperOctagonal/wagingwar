// Finds, per context bucket, the blend ratio between calibrated model
// probability and live market probability that minimizes prediction
// error against actual outcomes -- a generalisation of the hardcoded
// FIRST_STARTER_LIVE_WEIGHT (0.8) in lib/scoring.js's
// blendFirstStarterLivePrices. `liveWeight` uses the same convention as
// that constant: 0 = pure model, 1 = pure market, 0.8 = today's live
// first-starter setting.

const MIN_TEST_N = 100; // below this, a bucket's result isn't reported as viable (too thin to trust)

function brierAt(points, liveWeight) {
  const sum = points.reduce((a, p) => {
    const pred = liveWeight * p.marketProb + (1 - liveWeight) * p.calProb;
    return a + (pred - (p.won ? 1 : 0)) ** 2;
  }, 0);
  return sum / points.length;
}

// Grid search over liveWeight in [0, 1] (step 0.05) for the ratio
// minimizing Brier score on `points`.
function gridSearchBlend(points) {
  let best = null;
  for (let w = 0; w <= 100; w += 5) {
    const liveWeight = w / 100;
    const brier = brierAt(points, liveWeight);
    if (!best || brier < best.brier) best = { liveWeight, brier };
  }
  return best;
}

// Out-of-sample validation, same date-split discipline as Phase 2's
// validateOutOfSample: fit the optimal ratio on the train half's dates,
// then score that SAME ratio (not refit) against the test half, next to
// the two baselines (pure model, pure market) and -- when supplied --
// the currently-live ratio, so a caller can see whether the learned
// value would actually have done better than what's live today.
export function fitAndValidateBlend(sample, { splitFraction = 0.5, currentLiveWeight = null } = {}) {
  const points = sample.filter(s => s.marketProb != null && s.calProb != null && s.calProb > 0);
  const dates = [...new Set(points.map(s => s.date))].sort();
  if (dates.length < 4) return { viable: false, reason: 'insufficient date spread', n: points.length };

  const splitDate = dates[Math.floor(dates.length * splitFraction)];
  const train = points.filter(s => s.date < splitDate);
  const test = points.filter(s => s.date >= splitDate);
  if (train.length < MIN_TEST_N || test.length < MIN_TEST_N) {
    return { viable: false, reason: 'sample too thin to trust', trainN: train.length, testN: test.length };
  }

  const fitted = gridSearchBlend(train);
  const testAtOptimal = brierAt(test, fitted.liveWeight);
  const testPureModel = brierAt(test, 0);
  const testPureMarket = brierAt(test, 1);
  const testAtCurrent = currentLiveWeight != null ? brierAt(test, currentLiveWeight) : null;

  return {
    viable: true,
    splitDate,
    trainN: train.length,
    testN: test.length,
    learnedLiveWeight: fitted.liveWeight,
    trainBrier: fitted.brier,
    testBrierAtLearned: testAtOptimal,
    testBrierPureModel: testPureModel,
    testBrierPureMarket: testPureMarket,
    testBrierAtCurrentLive: testAtCurrent,
    // Whether the learned ratio actually beats what's currently live
    // (only meaningful when currentLiveWeight was supplied) -- Part B's
    // explicit "is 80/20 close to correct" gate.
    learnedBeatsCurrent: testAtCurrent != null ? testAtOptimal < testAtCurrent : null,
  };
}

export { MIN_TEST_N };
