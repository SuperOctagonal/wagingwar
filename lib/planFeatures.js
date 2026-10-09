// Single source of truth for which plan unlocks which feature. Both server
// routes (value-bets, market-movers, today-csv, race-cards) and every
// client gate should import hasFeature()/FEATURE_MIN_PLAN from here rather
// than re-deriving a tier comparison locally.
//
// sectionals has no implemented feature behind it yet (app/races/page.js's
// VIEW_TABS entry is a locked coming-soon placeholder) -- included here so
// the table is complete and ready the day it ships, not because anything
// currently reads it.
export const PLAN_RANK = { free: 0, lite: 1, pro: 2 };

export const FEATURE_MIN_PLAN = {
  value_bets:    'lite',
  movers:        'lite',
  live_odds:     'lite',
  full_scores:   'lite',
  pace_map:      'pro',
  blackbook:     'pro',
  bet_tracker:   'pro',
  community_post:'pro',
  sectionals:    'pro',
};

// plan: 'free'|'lite'|'pro'|null|undefined (treated as 'free' -- fail
// closed, same convention as the rest of this app's gating). An unknown
// feature key fails closed too (returns false) rather than throwing, so a
// typo'd feature name can't accidentally unlock something.
export function hasFeature(plan, feature) {
  const minPlan = FEATURE_MIN_PLAN[feature];
  if (!minPlan) return false;
  const planRank = PLAN_RANK[plan] ?? PLAN_RANK.free;
  return planRank >= PLAN_RANK[minPlan];
}
