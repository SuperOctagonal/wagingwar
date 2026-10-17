import 'server-only';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { LIMITS, periodStart } from '@/lib/points';

// Server-only counterpart to lib/points.js's awardPoints -- same limits
// table, same points_log/user_profiles writes, but via the service key
// (never the anon key, so it keeps working once anon write access to
// these tables is revoked) and with real reference_id dedup: every call
// site now passes a stable id for the thing that earned the points (a
// bet id, a blackbook row id, a post/reply id, a vote target), and this
// checks points_log for an existing (clerk_id, action_type, reference_id)
// row before awarding again -- so a route that's retried, or a client
// that double-fires an effect, can never double-award the same event.
// Client code must never call this directly (it isn't importable from a
// client bundle anyway, per 'server-only') -- it only ever runs as a side
// effect inside an already-auth-checked server route.
export async function awardPointsServer(clerk_id, action_type, { referenceId = null, detail = null } = {}) {
  if (!clerk_id) return;
  const cfg = LIMITS[action_type];
  if (!cfg) return;

  if (referenceId != null) {
    const { data: existing } = await sbAdminRaw(
      `points_log?clerk_id=eq.${encodeURIComponent(clerk_id)}&action_type=eq.${encodeURIComponent(action_type)}&reference_id=eq.${encodeURIComponent(referenceId)}&select=id&limit=1`,
    );
    if (existing && existing.length) return; // already awarded for this exact event
  }

  let points_earned = cfg.pts;
  const start = periodStart(cfg.period || 'day');

  if (cfg.maxPoints != null) {
    const { data: rows } = await sbAdminRaw(
      `points_log?clerk_id=eq.${encodeURIComponent(clerk_id)}&action_type=eq.${encodeURIComponent(action_type)}&created_at=gte.${encodeURIComponent(start.toISOString())}&select=points`,
    );
    const earnedSoFar = (rows || []).reduce((s, r) => s + (r.points || 0), 0);
    if (earnedSoFar >= cfg.maxPoints) points_earned = 0;
    else if (earnedSoFar + points_earned > cfg.maxPoints) points_earned = cfg.maxPoints - earnedSoFar;
  } else if (cfg.max != null) {
    const { data: rows } = await sbAdminRaw(
      `points_log?clerk_id=eq.${encodeURIComponent(clerk_id)}&action_type=eq.${encodeURIComponent(action_type)}&created_at=gte.${encodeURIComponent(start.toISOString())}&select=id`,
    );
    if ((rows?.length ?? 0) >= cfg.max) points_earned = 0;
  }

  await sbAdminRaw('points_log', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      clerk_id,
      points: points_earned,
      category: action_type,
      reason: detail || action_type,
      action_type,
      action_detail: detail,
      reference_id: referenceId,
    },
  });

  if (points_earned > 0) {
    const { data: prof } = await sbAdminRaw(`user_profiles?clerk_id=eq.${encodeURIComponent(clerk_id)}&select=points`);
    const cur = prof?.[0]?.points ?? 0;
    await sbAdminRaw(`user_profiles?clerk_id=eq.${encodeURIComponent(clerk_id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { points: cur + points_earned },
    });
  }
}
