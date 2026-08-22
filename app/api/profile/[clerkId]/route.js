import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { punterFallback } from '@/lib/punterFallback';
import { computeBtmStreak } from '@/lib/beatModel';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

async function sb(path) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) return null;
  return res.json();
}

// GET /api/profile/[clerkId] -- the public profile data set, explicitly
// scoped: cosmetics/badges, tier+points, login streak, Track Dash best
// score, and Beat the Model record (correct/total/hitPct/streak, computed
// the same way the BTM leaderboard does). Deliberately excludes anything
// from bet_log/My Bets/Insights -- that data has no public exposure
// anywhere else in this app and this route doesn't change that boundary.
// Requires the VIEWER to be signed in (same as every other route in this
// app), but the data returned describes the [clerkId] in the URL, not the
// caller.
export async function GET(req, { params }) {
  const { userId: viewerId } = await auth();
  if (!viewerId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { clerkId } = await params;
  if (!clerkId) return NextResponse.json({ error: 'Missing clerkId' }, { status: 400 });

  const client = await clerkClient();
  let displayName;
  try {
    const user = await client.users.getUser(clerkId);
    displayName = user?.username || punterFallback(clerkId);
  } catch {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const [cosmeticsRows, profileRows, creditsRows, trackDashRows, btmRows] = await Promise.all([
    sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(clerkId)}&select=item_id,equipped,cosmetic_items(category,name,tier,style)`),
    sb(`user_profiles?clerk_id=eq.${encodeURIComponent(clerkId)}&select=points`),
    sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=login_streak`),
    sb(`puzzle_scores?clerk_id=eq.${encodeURIComponent(clerkId)}&game_type=eq.track_dash&select=score&order=score.desc&limit=1`),
    sb(`btm_picks?clerk_id=eq.${encodeURIComponent(clerkId)}&resolved=eq.true&select=comp_date,resolved,won&order=comp_date.desc`),
  ]);

  const equipped = { border: null, flair: null };
  const badges = [];
  for (const row of cosmeticsRows || []) {
    const item = row.cosmetic_items;
    if (!item) continue;
    if (item.category === 'badge') {
      badges.push({ id: row.item_id, name: item.name, tier: item.tier, style: item.style });
    } else if (row.equipped) {
      const entry = { id: row.item_id, name: item.name, tier: item.tier, style: item.style };
      if (item.category === 'border') equipped.border = entry;
      if (item.category === 'flair') equipped.flair = entry;
    }
  }

  const btm = btmRows || [];
  const btmCorrect = btm.filter(r => r.won).length;
  const beatModel = {
    total: btm.length,
    correct: btmCorrect,
    hitPct: btm.length > 0 ? (btmCorrect / btm.length) * 100 : null,
    streak: computeBtmStreak(btm, todayISO()),
  };

  return NextResponse.json({
    clerkId,
    displayName,
    equipped,
    badges,
    points: profileRows?.[0]?.points || 0,
    loginStreak: creditsRows?.[0]?.login_streak || 0,
    trackDashBest: trackDashRows?.[0]?.score ?? null,
    beatModel,
  });
}
