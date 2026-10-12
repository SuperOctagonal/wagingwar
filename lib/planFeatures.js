// Single source of truth for which plan unlocks which feature. Both server
// routes (value-bets, market-movers, today-csv, race-cards) and every
// client gate should import hasFeature()/FEATURE_MIN_PLAN from here rather
// than re-deriving a tier comparison locally.
//
// sectionals has no implemented feature behind it yet (app/races/page.js's
// VIEW_TABS entry is a locked coming-soon placeholder) -- included here so
// the table is complete and ready the day it ships, not because anything
// currently reads it.
export const PLAN_RANK = { free: 0, pro: 1 };

export const FEATURE_MIN_PLAN = {
  value_bets:    'pro',
  movers:        'pro',
  // Restored to its pre-Lite-work state: live price + the Move column +
  // the Firmer/Drifter chips were open to every signed-in user (any plan)
  // before the Lite rollout gated them to Lite+. Sign-in itself (not this
  // flag) is still the real gate for a signed-out visitor -- see the
  // auth() check in app/api/race-live-prices/route.js.
  live_odds:     'free',
  full_scores:   'pro',
  pace_map:      'pro',
  blackbook:     'pro',
  bet_tracker:   'pro',
  community_post:'pro',
  sectionals:    'pro',
};

// plan: 'free'|'pro'|null|undefined (treated as 'free' -- fail closed, same
// convention as the rest of this app's gating). An unknown feature key
// fails closed too (returns false) rather than throwing, so a typo'd
// feature name can't accidentally unlock something.
export function hasFeature(plan, feature) {
  const minPlan = FEATURE_MIN_PLAN[feature];
  if (!minPlan) return false;
  const planRank = PLAN_RANK[plan] ?? PLAN_RANK.free;
  return planRank >= PLAN_RANK[minPlan];
}
