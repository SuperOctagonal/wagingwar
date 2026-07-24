// Shared odds-band bucketing — single source of truth for the boundaries
// used by Insights' ROI-by-Odds-Band heatmap, BetFilterPanel's Odds band
// filter, and the /api/insights/filtered-bets route's oddsBand param.
export const ODDS_BANDS = [
  { key: '2-4',  label: '$2-4',  lo: 2,  hi: 4 },
  { key: '4-8',  label: '$4-8',  lo: 4,  hi: 8 },
  { key: '8-15', label: '$8-15', lo: 8,  hi: 15 },
  { key: '15+',  label: '$15+',  lo: 15, hi: null },
];

export function oddsBucket(o) {
  const n = +o;
  for (const b of ODDS_BANDS) {
    if (b.hi == null || n < b.hi) return b.label;
  }
  return ODDS_BANDS[ODDS_BANDS.length - 1].label;
}
