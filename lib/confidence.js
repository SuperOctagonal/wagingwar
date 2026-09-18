// How well-tested is a given runner's WW $ actually? Built specifically for
// Value Bets, where a huge-looking edge % on a thin-data runner has caused
// real confusion (see the 2026-09-18 edge-finding investigation's "Biggest
// Misses" section: the model's worst errors cluster heavily in first-starter
// sprints, not in well-sampled experienced-runner prices).
//
// Two INDEPENDENT flags, not one combined tier -- originally this was a
// single 'limited'/'well-tested' tier, but DAWN ON ME (16 starts, 9-4-2-1)
// and FINE VINTAGE (43 starts, 29-10-2-2) both got labelled "Limited data"
// for tripping trigger 4 below, which is flatly wrong messaging for a
// runner with dozens of starts -- "we don't have much history on this
// horse" and "this horse has plenty of history but the model and market
// strongly disagree on it" are different situations that call for
// different copy, so they're now reported as two separate booleans a
// caller can label (and show together) independently.
//
// thinData -- true if ANY of:
// 1. First starter (starts === 0) -- always a genuinely thin-data case (no
//    result history at all; DebutPromise in lib/scoring.js is a floor
//    heuristic, not real signal), independent of what price it lands on.
// 2. First starter AND a sprint (<1400m) -- the single worst blind spot the
//    investigation found (21 of the top-30 biggest misses were sprints,
//    overwhelmingly first-starters/maidens). Same outcome as (1) on its
//    own, called out separately only so callers that DO have distance
//    (Field tab) can flag it, and callers that don't (Value Bets' server-
//    side pipeline, which has no race distance available -- see below)
//    still get a correct answer from (1) alone.
// 3. Calibration-curve price-bucket sample size (score_calibration_curve's
//    oos_metrics.buckets, already computed and stored by Phase 2's
//    recalibration job) -- how many historical runners the ACTIVE curve was
//    validated against at this runner's own calibrated price range. Below
//    MIN_BUCKET_N, the curve itself is working off a thin sample at that
//    price, regardless of the runner's own starts count.
//
// disagreement -- true if:
// 4. Extreme model-vs-market disagreement (market price at least
//    EXTREME_EDGE_RATIO x the calibrated model price) -- added 2026-09-18
//    after DRAGON PORT (Thoroughbred Park R6: 2 starts, both unplaced,
//    WW $13.70 vs market $81) landed in a well-sampled $10-20 price bucket
//    (n=3,887) and so tripped none of the thinData triggers, despite a
//    ~5.9x market/model disagreement that's itself the outlier signal -- a
//    price bucket's AGGREGATE sample size being large doesn't mean any one
//    runner landing at an extreme, rarely-seen disagreement ratio within
//    that bucket is trustworthy. Fully independent of thinData: a runner
//    with plenty of starts and a well-sampled bucket can still trip this
//    one alone (as DAWN ON ME/FINE VINTAGE both did), and a runner can trip
//    both at once (e.g. a first starter the market also strongly disagrees
//    with) -- callers should show both flags' labels when both are true,
//    not silently pick one.
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
// without it still get a correct, slightly less granular thinData answer
// via the starts===0 check alone.

export const MIN_BUCKET_N = 300;
// Market price at least this many times the calibrated model price (e.g.
// 2 => market $80 vs model $40 or worse) trips the disagreement flag below,
// regardless of starts/bucket sample size. Roughly corresponds to a 100%+
// edge by computeValueEdge's (market-model)/model formula -- DRAGON PORT's
// real 5.9x ratio was comfortably past this.
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

// Returns { thinData: boolean, disagreement: boolean }. marketPrice is
// optional -- both current callers (Field tab, Value Bets) already have it
// in scope for their own edge calculations, so passing it through costs
// nothing.
export function getConfidenceFlags({ starts, dist, calPrice, oosMetrics, marketPrice }) {
  let thinData = false;

  if (Number(starts) === 0) {
    thinData = true;
  } else {
    const distNum = dist != null ? parseInt(String(dist).replace(/\D/g, ''), 10) : null;
    if (distNum != null && isFinite(distNum) && distNum < 1400 && Number(starts) <= 1) {
      // A horse with exactly one prior start is barely more tested than a
      // true debutant, and the investigation's sprint blind spot wasn't
      // starts===0-exclusive -- kept as a narrow, explicit extra case
      // rather than lowering the starts===0 check itself.
      thinData = true;
    } else {
      const buckets = oosMetrics?.buckets;
      if (buckets?.length && calPrice > 0) {
        const bucket = findBucket(buckets, calPrice);
        if (bucket && bucket.n < MIN_BUCKET_N) thinData = true;
      }
    }
  }

  const disagreement = marketPrice > 0 && calPrice > 0 && marketPrice / calPrice >= EXTREME_EDGE_RATIO;

  return { thinData, disagreement };
}
