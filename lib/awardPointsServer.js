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
    await incrementUserPoints(clerk_id, points_earned);
  }
}

// Read-then-write on a shared counter is a lost-update race: two awards
// firing close together (e.g. a bet logged and a blackbook save in the
// same request burst) can both read the same "cur" before either write
// lands, so one PATCH clobbers the other and a point award silently
// vanishes from the total (confirmed live, 2026-10-18 -- ProfileRail
// briefly showed stale lower totals before settling on the correct sum).
// No DB-side atomic increment is available here, so this instead uses
// optimistic concurrency: the PATCH is conditioned on points still
// equalling what was just read (points=eq.<cur>), so a losing writer gets
// back zero updated rows instead of silently overwriting, and retries
// against the new value. Converges in at most a few iterations under the
// kind of light concurrency a single user's own actions produce.
async function incrementUserPoints(clerk_id, delta, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { data: prof } = await sbAdminRaw(`user_profiles?clerk_id=eq.${encodeURIComponent(clerk_id)}&select=points`);
    if (!prof || !prof.length) return; // no profile row yet -- nothing to increment
    const cur = prof[0].points ?? 0;
    const { ok, data } = await sbAdminRaw(
      `user_profiles?clerk_id=eq.${encodeURIComponent(clerk_id)}&points=eq.${cur}`,
      { method: 'PATCH', prefer: 'return=representation', body: { points: cur + delta } },
    );
    if (ok && data && data.length) return; // won the race
    // Someone else updated points between our read and write -- retry.
  }
}
