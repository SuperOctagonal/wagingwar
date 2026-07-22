// Free-tier field allowlist for race card / horse data. Server-side gate for
// /api/today-csv and /api/race-cards — this is the actual security boundary;
// client-side isPro checks (races/page.js) are UI-only and were never a real
// gate on their own.
//
// Determined by reading lib/scoring.js's FACTORS/GRP_KEYS (the exact scoring
// inputs) plus every field races/page.js's RunnerRow/MobileRunnerCard read
// WITHOUT an isPro check (career record, Last 4, Pace column, class-change
// badge) — those are currently-working free-tier display, not scoring leaks,
// so they stay. Deep stats only reachable via the (currently ungated, not
// fixed here) hover popup / "Form detail" layer — jockey/trainer splits,
// course/distance breakdowns, pedigree, full run history — are deliberately
// NOT included; those are genuine Pro-tier content, not basic race info.

// Keys as they appear on the PARSED horse object (lib/csvParser.js buildRaces()
// output / race_cards.form_data) — used to filter JSON in /api/race-cards.
export const FREE_HORSE_FIELDS = [
  'name', 'tab', 'jname', 'trainer', 'scratched', 'BP', 'Weight', 'age', 'sex',
  'form', 'allowance', 'odds', 'rawOdds',
  'starts', 'wins', 'seconds', 'thirds', 'lastFin', 'courseStarts', 'espd', 'classChange',
];

// Canonical HEADER_ALIASES keys (lib/csvParser.js) — used to filter raw CSV
// columns in /api/today-csv before parsing ever happens client-side. Race-level
// columns (not per-horse) always pass through regardless of tier.
export const FREE_RACE_LEVEL_HEADER_KEYS = [
  'raceNum', 'raceName', 'distance', 'cls', 'prize', 'time', 'date', 'venue', 'state',
];

export const FREE_HORSE_HEADER_KEYS = [
  'horse', 'tab', 'Jockey', 'Trainer', 'scratched', 'BP', 'Weight', 'age', 'sex',
  'Form', 'Allowance', 'odds',
  'Starts', 'Wins', 'Seconds', 'Thirds', 'Places',
  'Last Finish pos', 'Last-1 Finish pos', 'Last-2 Finish pos', 'Last-3 Finish pos',
  'Last Finish Position', 'Last-1 Finish Position', 'Last-2 Finish Position', 'Last-3 Finish Position',
  'Espd', 'Class Change',
];

export function stripHorseFields(horse) {
  if (!horse || typeof horse !== 'object') return horse;
  const out = {};
  for (const k of FREE_HORSE_FIELDS) {
    if (k in horse) out[k] = horse[k];
  }
  return out;
}
