import { sbFetch } from './supabase';

// max: cap on NUMBER of actions per period (existing behavior).
// maxPoints: cap on TOTAL POINTS earned from this action per period -- the
// action itself keeps working past the cap, it just stops earning points,
// vs. max which blocks the Nth+1 action outright. Use one or the other,
// not both. period defaults to 'day' when omitted (all pre-existing entries).
const LIMITS = {
  community_post:    { max: 10,  pts: 10, period: 'day' },
  community_reply:   { max: 20,  pts: 5,  period: 'day' },
  bet_logged:        { max: 10,  pts: 5,  period: 'day' },
  win_logged:        { max: 10,  pts: 15, period: 'day' },
  blackbook_save:    { max: 5,   pts: 2,  period: 'day' },
  blackbook_win:     { max: null, pts: 20, period: 'day' },
  upvote_received:   { max: null, pts: 10, period: 'day' },
  battle_card_share: { pts: 50, maxPoints: 150, period: 'week' },
  bet_card_share:    { pts: 15, maxPoints: 90,  period: 'week' },
  beat_model_participate: { pts: 10, max: 1, period: 'day' },
  beat_model_correct:     { pts: 40, max: 1, period: 'day' },
};

// Start-of-period cutoff. Plain local Date, not AEST-aware -- matches the
// precision of the daily cutoff this replaces (which was already just
// today.setHours(0,0,0,0) with no timezone handling), so this doesn't mix
// a more-correct week boundary with a less-correct day boundary.
function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = d.getDay(); // 0 = Sunday
    const sinceMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - sinceMonday);
  }
  return d;
}

export async function awardPoints(clerk_id, action_type, action_detail = null) {
  if (!clerk_id) return;
  const cfg = LIMITS[action_type];
  if (!cfg) return;

  let points_earned = cfg.pts;
  const start = periodStart(cfg.period || 'day');

  if (cfg.maxPoints != null) {
    // Points-sum cap: award nothing further once the period's total from
    // this action hits the cap, action itself still "succeeds".
    const rows = await sbFetch(
      `points_log?clerk_id=eq.${clerk_id}&action_type=eq.${action_type}&created_at=gte.${encodeURIComponent(start.toISOString())}&select=points`
    );
    const earnedSoFar = (rows || []).reduce((s, r) => s + (r.points || 0), 0);
    if (earnedSoFar >= cfg.maxPoints) points_earned = 0;
    else if (earnedSoFar + points_earned > cfg.maxPoints) points_earned = cfg.maxPoints - earnedSoFar;
  } else if (cfg.max != null) {
    // Count cap (unchanged behavior): max number of actions per period.
    const rows = await sbFetch(
      `points_log?clerk_id=eq.${clerk_id}&action_type=eq.${action_type}&created_at=gte.${encodeURIComponent(start.toISOString())}&select=id`
    );
    if ((rows?.length ?? 0) >= cfg.max) points_earned = 0;
  }

  // Real points_log schema is {points, reason, category, reference_id,
  // action_type, action_detail} -- NOT {points_earned, daily_limit_hit},
  // which don't exist as columns. The old write shape 400'd silently on
  // every call (sbFetch swallows the error), so no action_type-scoped cap
  // has ever actually been enforced -- user_profiles.points still got
  // incremented correctly below regardless, since that PATCH doesn't
  // depend on the log write succeeding.
  await sbFetch('points_log', {
    method: 'POST',
    body: {
      clerk_id,
      points: points_earned,
      category: action_type,
      reason: action_detail || action_type,
      action_type,
      action_detail,
    },
    prefer: 'return=minimal',
  });

  if (points_earned > 0) {
    const prof = await sbFetch(`user_profiles?clerk_id=eq.${clerk_id}&select=points`);
    const cur = prof?.[0]?.points ?? 0;
    await sbFetch(`user_profiles?clerk_id=eq.${clerk_id}`, {
      method: 'PATCH',
      body: { points: cur + points_earned },
      prefer: 'return=minimal',
    });
  }
}
