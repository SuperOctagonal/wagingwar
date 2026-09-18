// How well-tested is a given runner's WW $ actually? Built specifically for
// Value Bets, where a huge-looking edge % on a thin-data runner has caused
// real confusion (see the 2026-09-18 edge-finding investigation's "Biggest
// Misses" section: the model's worst errors cluster heavily in first-starter
// sprints, not in well-sampled experienced-runner prices). Two tiers only,
// deliberately -- a 5-tier system isn't justified by how blunt these signals
// are, and a coarser signal is easier for a user to act on at a glance.
//
// Inputs, in order of how much weight each carries:
// 1. First starter (starts === 0) -- always a genuinely thin-data case (no
//    result history at all; DebutPromise in lib/scoring.js is a floor
//    heuristic, not real signal), independent of what price it lands on.
// 2. First starter AND a sprint (<1400m) -- the single worst blind spot the
//    investigation found (21 of the top-30 biggest misses were sprints,
//    overwhelmingly first-starters/maidens). Same "limited" outcome as (1)
//    on its own, called out separately only so callers that DO have
//    distance (Field tab) can flag it, and callers that don't (Value Bets'
//    server-side pipeline, which has no race distance available -- see
//    below) still get a correct answer from (1) alone.
// 3. Calibration-curve price-bucket sample size (score_calibration_curve's
//    oos_metrics.buckets, already computed and stored by Phase 2's
//    recalibration job) -- how many historical runners the ACTIVE curve was
//    validated against at this runner's own calibrated price range. Below
//    MIN_BUCKET_N, the curve itself is working off a thin sample at that
//    price, regardless of the runner's own starts count.
// 4. Extreme model-vs-market disagreement (market price at least
//    EXTREME_EDGE_RATIO x the calibrated model price) -- added 2026-09-18
//    after DRAGON PORT (Thoroughbred Park R6: 2 starts, both unplaced,
//    WW $13.70 vs market $81) landed in a well-sampled $10-20 price bucket
//    (n=3,887) and so tripped none of triggers 1-3, despite a ~5.9x market/
//    model disagreement that's itself the outlier signal -- a price
//    bucket's AGGREGATE sample size being large doesn't mean any one
//    runner landing at an extreme, rarely-seen disagreement ratio within
//    that bucket is trustworthy. Independent of triggers 1-3: a runner can
//    trip this one alone even with plenty of starts and a well-sampled
//    bucket.
//
// NOT included: field size. Considered, but the investigation's own field-
// size slice (Part 3 of the edge-finding report) showed the market-vs-model
// gap narrowing, not widening, in small fields -- there's no clean, already-
// validated basis for treating small fields as "less confident" on their
// own, so it's left out rather than added speculatively.
//
// dist is optional: Field tab has it (buildRaces captures race-level
// distance from the CSV), lib/valueBets.js's server-side pipeline currently
// doesn't (race_cards/form_data has no per-race distance field) -- callers
// without it still get a correct, slightly less granular answer via the
// starts===0 check alone.

export const MIN_BUCKET_N = 300;
// Market price at least this many times the calibrated model price (e.g.
// 2 => market $80 vs model $40 or worse) trips the extreme-disagreement
// trigger below, regardless of starts/bucket sample size. Roughly
// corresponds to a 100%+ edge by computeValueEdge's (market-model)/model
// formula -- DRAGON PORT's real 5.9x ratio was comfortably past this.
export const EXTREME_EDGE_RATIO = 2;

// oos_metrics.buckets[].bucket labels are price-range strings, e.g. "<$2",
// "$2-3", "$150+" -- parsed once here rather than re-parsed per lookup.
function bucketRange(label) {
  if (label.startsWith('<$')) return [0, parseFloat(label.slice(2))];
  if (label.endsWith('+')) return [parseFloat(label.slice(1, -1)), Infinity];
  const [lo, hi] = label.replace('$', '').split('-').map(Number);
  return [lo, hi];
}

function findBucket(buckets, price) {
  for (const b of buckets) {
    const [lo, hi] = bucketRange(b.bucket);
    if (price >= lo && price <= hi) return b;
  }
  return null;
}

// Returns 'limited' | 'well-tested'. marketPrice is optional -- both
// current callers (Field tab, Value Bets) already have it in scope for
// their own edge calculations, so passing it through costs nothing.
export function getConfidenceTier({ starts, dist, calPrice, oosMetrics, marketPrice }) {
  if (Number(starts) === 0) return 'limited';

  if (marketPrice > 0 && calPrice > 0 && marketPrice / calPrice >= EXTREME_EDGE_RATIO) return 'limited';

  const distNum = dist != null ? parseInt(String(dist).replace(/\D/g, ''), 10) : null;
  if (distNum != null && isFinite(distNum) && distNum < 1400 && Number(starts) <= 1) {
    // A horse with exactly one prior start is barely more tested than a
    // true debutant, and the investigation's sprint blind spot wasn't
    // starts===0-exclusive -- kept as a narrow, explicit extra case rather
    // than lowering the starts===0 check itself.
    return 'limited';
  }

  const buckets = oosMetrics?.buckets;
  if (buckets?.length && calPrice > 0) {
    const bucket = findBucket(buckets, calPrice);
    if (bucket && bucket.n < MIN_BUCKET_N) return 'limited';
  }

  return 'well-tested';
}
