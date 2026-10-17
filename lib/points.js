// Shared config only -- no browser-callable write path lives here anymore.
// All points are now awarded server-side via lib/awardPointsServer.js
// (service key, reference_id-deduped), from inside the specific route that
// verified the action actually happened.
//
// max: cap on NUMBER of actions per period (existing behavior).
// maxPoints: cap on TOTAL POINTS earned from this action per period -- the
// action itself keeps working past the cap, it just stops earning points,
// vs. max which blocks the Nth+1 action outright. Use one or the other,
// not both. period defaults to 'day' when omitted (all pre-existing entries).
export const LIMITS = {
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
export function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = d.getDay(); // 0 = Sunday
    const sinceMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - sinceMonday);
  }
  return d;
}
