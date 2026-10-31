// Same-course turf/synthetic pairs: synthetic name -> turf name. When a
// meeting moves surface (e.g. 30 Oct 2026 Pakenham ran on the turf but the
// EveryRace CSV said "Pakenham Synthetic"), the CSV-sourced rows and the
// Racing Australia-sourced rows split across the two names. The results'
// own track conditions say which surface actually raced.
//
// Mirrors SURFACE_PAIRS / resolve_surface_venue() in the backend's
// venues.py, which runs the reconciliation after each results scrape
// (reconcile_surface_venues() in worker.py) -- kept in sync manually, no
// shared source. Plain .mjs so tests/surfaceVenue.test.mjs runs under
// node --test; re-exported from lib/venues.js.
export const SURFACE_PAIRS = {
  'PAKENHAM SYNTHETIC': 'PAKENHAM',
  'BALLARAT SYNTHETIC': 'BALLARAT',
  'GOLD COAST POLY': 'GOLD COAST',
  'SUNSHINE COAST POLY': 'SUNSHINE COAST',
};

// 'synthetic' / 'turf' for a race_results.track_cond value, or null when
// blank. "Synthetic", "Poly", "Polytrack" -> synthetic; a turf rating
// ("Good 4", "Soft 6", "Heavy 10") -> turf.
export function trackSurface(trackCond) {
  const c = String(trackCond ?? '').trim().toLowerCase();
  if (!c) return null;
  return c.includes('synth') || c.includes('poly') ? 'synthetic' : 'turf';
}

// The venue name a meeting's rows belong under, for a name in a
// SURFACE_PAIRS pair. sameDayResults maps venue -> array of
// race_results.track_cond values for that date.
//
// Results under exactly one of the pair's names, all on the synthetic ->
// the synthetic name; all on turf -> the turf name. Mixed surfaces, no
// results, or results under both names (two genuine meetings) -> name
// unchanged. A name not in a pair is returned unchanged.
export function resolveSurfaceVenue(name, sameDayResults) {
  const key = String(name ?? '').toUpperCase();
  let synthetic;
  let turf;
  if (key in SURFACE_PAIRS) {
    synthetic = key;
    turf = SURFACE_PAIRS[key];
  } else {
    synthetic = Object.keys(SURFACE_PAIRS).find(s => SURFACE_PAIRS[s] === key);
    if (!synthetic) return name;
    turf = key;
  }
  const results = Object.fromEntries(
    Object.entries(sameDayResults || {}).map(([v, conds]) => [v.toUpperCase(), conds]),
  );
  const withResults = [synthetic, turf].filter(v => results[v]?.length);
  if (withResults.length !== 1) return name;
  const surfaces = new Set(results[withResults[0]].map(trackSurface).filter(Boolean));
  if (surfaces.size !== 1) return name;
  return surfaces.has('synthetic') ? synthetic : turf;
}
