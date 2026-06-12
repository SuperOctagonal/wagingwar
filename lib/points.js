import { sbFetch } from './supabase';

const LIMITS = {
  community_post:  { max: 10,  pts: 10 },
  community_reply: { max: 20,  pts: 5  },
  bet_logged:      { max: 10,  pts: 5  },
  win_logged:      { max: 10,  pts: 15 },
  blackbook_save:  { max: 5,   pts: 2  },
  blackbook_win:   { max: null, pts: 20 },
  upvote_received: { max: null, pts: 10 },
};

export async function awardPoints(clerk_id, action_type, action_detail = null) {
  if (!clerk_id) return;
  const cfg = LIMITS[action_type];
  if (!cfg) return;

  let points_earned = cfg.pts;
  let daily_limit_hit = false;

  if (cfg.max !== null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await sbFetch(
      `points_log?clerk_id=eq.${clerk_id}&action_type=eq.${action_type}&created_at=gte.${encodeURIComponent(today.toISOString())}&select=id`
    );
    if ((rows?.length ?? 0) >= cfg.max) {
      points_earned = 0;
      daily_limit_hit = true;
    }
  }

  await sbFetch('points_log', {
    method: 'POST',
    body: { clerk_id, action_type, action_detail, points_earned, daily_limit_hit },
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
