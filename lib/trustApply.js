// Pure, additive blend of a calibrated model price (Phase 2) with a live
// market price, using a learned liveWeight (lib/trustBlend.js's
// convention: 0 = pure model, 1 = pure market). Never touches
// calculateMatrixOdds/PM/blendFirstStarterLivePrices -- this is a
// separate, downstream, display-only computation, currently wired into
// exactly one place: the admin-only preview in app/races/page.js.
export function applyTrustBlend(calibratedPrice, marketPrice, liveWeight) {
  if (!(calibratedPrice > 0)) return calibratedPrice;
  if (!(marketPrice > 0) || liveWeight == null) return calibratedPrice;
  const calProb = 1 / calibratedPrice;
  const marketProb = 1 / marketPrice;
  const blendedProb = liveWeight * marketProb + (1 - liveWeight) * calProb;
  if (!(blendedProb > 0)) return calibratedPrice;
  return 1 / blendedProb;
}

// Picks the most specific viable+active bucket for a runner, falling
// back to a broader bucket when the specific one wasn't viable enough to
// trust (e.g. "experienced_long" had only 52 samples and was never
// activated) -- `buckets` is the array returned by /api/trust-blend-ratios
// (all currently-active rows, one per bucket_key).
export function pickTrustBucket(buckets, { starts, price }) {
  if (!buckets?.length) return null;
  const byKey = Object.fromEntries(buckets.map(b => [b.bucket_key, b]));
  if (starts === 0) return byKey.first_starter || null;
  if (price == null) return byKey.experienced_all || null;
  const band = price < 5 ? 'experienced_favourite' : price < 20 ? 'experienced_mid' : 'experienced_long';
  return byKey[band] || byKey.experienced_all || null;
}
