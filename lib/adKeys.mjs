// The admin Ads panel's list of ads, built from the data instead of a
// hard-coded list, so a new ad gets its own funnel row and Ad dropdown entry
// as soon as it has a landing, a sign-up or a spend row. Pure (no imports):
// lib/attribution.js feeds it, tests/adKeys.test.mjs covers it.

// Test tags (any utm_content starting "test", any case: testad, testad2...):
// left out of the panel entirely (rows, totals, dropdown).
export const isTestAd = key => typeof key === 'string' && key.toLowerCase().startsWith('test');

// keys: cleaned utm_content values (nulls allowed) from ad_landings,
// signup_attribution and ad_spend. first: keys always listed first, in this
// order, even with no data yet (the landing-page variants). Returns first,
// then every other key seen A-Z, deduped, test tags dropped.
export function adKeys(keys, first = []) {
  const seen = new Set(keys.filter(k => k && !isTestAd(k)));
  const lead = first.filter(k => !isTestAd(k));
  return [...lead, ...[...seen].filter(k => !lead.includes(k)).sort()];
}
