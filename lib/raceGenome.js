// Race Genome Matching: instead of one global factor-group weighting
// applied to every race, find k historically similar races (by context
// vector: distance, track_cond, class rating, field size) and derive a
// context-specific reweighting of Form/Speed/Conditions/Connections from
// just that neighborhood's actual outcomes.
//
// Similarity metric: weighted Euclidean distance over four dimensions,
// each z-scored against the population's own spread (so no single raw
// unit -- metres vs runner-count vs rating points -- dominates just
// because its numbers are bigger). track_cond is categorical (0 if same,
// 1 if different) and weighted 1.5x relative to the others: going
// changes race dynamics more than a small distance/rating difference
// does, matching how heavily the live scoring pipeline already leans on
// track-condition-specific factor tables (lib/scoring.js's
// Score_Soft/Heavy/Good Win % tiers existing at all). A race with no
// comparable class rating (e.g. "MAIDEN", "GROUP1") is treated as
// maximally distant on that dimension from any race that DOES have a
// rating, rather than imputed to some arbitrary shared value.
//
// Context-specific reweighting: logistic regression (won ~ form + speed
// + cond + conn) fit on just the neighborhood's runners, evaluated as a
// genuine probability (not a raw score sum) so it's directly comparable
// to the global baseline via Brier score -- the same metric Phase 2/3
// already validate with.

function zscoreStats(values) {
  const clean = values.filter(v => v != null);
  if (!clean.length) return { mean: 0, std: 1 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

export function computeContextStats(races) {
  return {
    distance: zscoreStats(races.map(r => r.distance)),
    fieldSize: zscoreStats(races.map(r => r.fieldSize)),
    classRating: zscoreStats(races.map(r => r.classRating)),
  };
}

export function contextDistance(a, b, stats) {
  const dDist = a.distance != null && b.distance != null
    ? (a.distance - b.distance) / stats.distance.std : 2;
  const dField = (a.fieldSize - b.fieldSize) / stats.fieldSize.std;
  const dCond = a.trackCond === b.trackCond ? 0 : 1.5;
  const dClass = a.classRating != null && b.classRating != null
    ? (a.classRating - b.classRating) / stats.classRating.std : 2;
  return Math.sqrt(dDist ** 2 + dField ** 2 + dCond ** 2 + dClass ** 2);
}

// k nearest neighbours of `race` among `candidates` (a different array --
// callers pass only earlier-dated races to avoid lookahead leakage).
export function kNearestRaces(race, candidates, k, stats) {
  return candidates
    .map(c => ({ race: c, dist: contextDistance(race, c, stats) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k)
    .map(x => x.race);
}

// Logistic regression via gradient descent -- 4 features (form, speed,
// cond, conn) + intercept, no external ML library. Small, fast to
// converge (few hundred iterations) at the sample sizes a single
// neighborhood realistically has.
export function fitLogistic(runners, { iterations = 300, lr = 0.05 } = {}) {
  const n = runners.length;
  if (!n) return null;
  // Standardise features within this fit so gradient steps behave
  // consistently regardless of the raw score scale.
  const feats = ['form', 'speed', 'cond', 'conn'];
  const stats = Object.fromEntries(feats.map(f => [f, zscoreStats(runners.map(r => r[f]))]));
  const X = runners.map(r => feats.map(f => ((r[f] ?? stats[f].mean) - stats[f].mean) / stats[f].std));
  const y = runners.map(r => r.won ? 1 : 0);

  let w = [0, 0, 0, 0];
  let b = 0;
  for (let it = 0; it < iterations; it++) {
    const gradW = [0, 0, 0, 0];
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = b + feats.reduce((a, _, j) => a + w[j] * X[i][j], 0);
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - y[i];
      for (let j = 0; j < 4; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    for (let j = 0; j < 4; j++) w[j] -= (lr * gradW[j]) / n;
    b -= (lr * gradB) / n;
  }

  return {
    predict(runner) {
      const x = feats.map(f => ((runner[f] ?? stats[f].mean) - stats[f].mean) / stats[f].std);
      const z = b + feats.reduce((a, _, j) => a + w[j] * x[j], 0);
      return 1 / (1 + Math.exp(-z));
    },
    weights: Object.fromEntries(feats.map((f, j) => [f, w[j]])),
  };
}

function brier(points) {
  if (!points.length) return null;
  return points.reduce((a, p) => a + (p.pred - (p.won ? 1 : 0)) ** 2, 0) / points.length;
}

// Out-of-sample validation: date-split (train/test, same discipline as
// Phase 2/3). The GLOBAL baseline is one logistic regression fit on all
// of train. The GENOME model, for each test race, finds its k nearest
// neighbours among TRAIN races only (no leakage -- every neighbour
// predates the test race) and fits a fresh regression on just that
// neighbourhood. Both are scored (Brier) on the exact same test runners.
export function validateRaceGenome(races, { k = 30, splitFraction = 0.5, minNeighborhoodRunners = 60 } = {}) {
  const dates = [...new Set(races.map(r => r.date))].sort();
  if (dates.length < 4) return { viable: false, reason: 'insufficient date spread' };
  const splitDate = dates[Math.floor(dates.length * splitFraction)];
  const train = races.filter(r => r.date < splitDate);
  const test = races.filter(r => r.date >= splitDate);
  if (!train.length || !test.length) return { viable: false, reason: 'empty train or test split' };

  const stats = computeContextStats(train);

  const trainRunners = train.flatMap(r => r.runners);
  const globalModel = fitLogistic(trainRunners);
  if (!globalModel) return { viable: false, reason: 'global fit failed' };

  const globalPoints = [];
  const genomePoints = [];
  let racesSkippedThinNeighborhood = 0;
  const neighborhoodSizes = [];

  for (const race of test) {
    for (const runner of race.runners) {
      globalPoints.push({ pred: globalModel.predict(runner), won: runner.won });
    }

    const neighbors = kNearestRaces(race, train, k, stats);
    const neighborhoodRunners = neighbors.flatMap(r => r.runners);
    neighborhoodSizes.push(neighborhoodRunners.length);
    if (neighborhoodRunners.length < minNeighborhoodRunners) {
      racesSkippedThinNeighborhood++;
      // Falls back to the global model rather than a regression fit on a
      // neighbourhood too thin to trust -- keeps the comparison honest
      // (a genome "win" can't come from just reusing the global model).
      for (const runner of race.runners) genomePoints.push({ pred: globalModel.predict(runner), won: runner.won });
      continue;
    }
    const localModel = fitLogistic(neighborhoodRunners);
    for (const runner of race.runners) {
      genomePoints.push({ pred: localModel ? localModel.predict(runner) : globalModel.predict(runner), won: runner.won });
    }
  }

  const globalBrier = brier(globalPoints);
  const genomeBrier = brier(genomePoints);

  return {
    viable: true,
    k, splitDate,
    trainRaces: train.length, testRaces: test.length,
    trainRunners: trainRunners.length, testRunners: globalPoints.length,
    racesSkippedThinNeighborhood, avgNeighborhoodSize: neighborhoodSizes.reduce((a, b) => a + b, 0) / (neighborhoodSizes.length || 1),
    globalBrier, genomeBrier,
    genomeBeatsGlobal: genomeBrier < globalBrier,
    improvementPct: globalBrier > 0 ? ((globalBrier - genomeBrier) / globalBrier) * 100 : null,
  };
}
