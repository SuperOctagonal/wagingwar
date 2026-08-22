import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { computeBtmStreak } from '@/lib/beatModel';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// All-time Beat the Model leaderboard -- a separate ranking from the
// points-based competition leaderboard, since BTM's scoring is a single
// binary hit/miss per day rather than a multi-race points total, so it
// doesn't fit the existing score-based ranking shape. No usernames here
// (clerk_id only) -- the client resolves display names itself via
// fetchDisplayNames, same pattern as the existing all-time leaderboard.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  try {
    const r = await fetch(
      `${SURL}/rest/v1/btm_picks?resolved=eq.true&select=clerk_id,comp_date,resolved,won&order=comp_date.desc`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
    const rows = await r.json();

    const byUser = new Map();
    for (const row of rows) {
      if (!byUser.has(row.clerk_id)) byUser.set(row.clerk_id, []);
      byUser.get(row.clerk_id).push(row);
    }

    const today = todayISO();
    const leaderboard = [...byUser.entries()].map(([clerk_id, picks]) => {
      const correct = picks.filter(p => p.won).length;
      const total = picks.length;
      return {
        clerk_id,
        correct,
        total,
        hitPct: total > 0 ? (correct / total) * 100 : 0,
        streak: computeBtmStreak(picks, today),
      };
    });

    leaderboard.sort((a, b) => b.streak - a.streak || b.hitPct - a.hitPct || b.correct - a.correct);

    return NextResponse.json({ ok: true, leaderboard: leaderboard.slice(0, 50) });
  } catch (err) {
    console.error('[beat-model/leaderboard] error:', err.message);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 502 });
  }
}
