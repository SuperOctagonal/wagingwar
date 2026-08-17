import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';
import { findBattleCardStats } from '@/lib/edgeZone';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Lightweight qualification check -- same stats as /api/battle-card, but
// returns JSON instead of rendering a PNG, so My Bets can decide whether to
// show the share button or the locked state without paying for an image
// render (font fetch + Satori) on every page load.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const res = await fetch(
    `${SURL}/rest/v1/bet_log?clerk_id=eq.${encodeURIComponent(userId)}&select=*&order=date.asc`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
  );
  const bets = res.ok ? await res.json() : [];
  const stats = findBattleCardStats(bets, { minSample: 10, normaliseVenueFn: normaliseVenue });

  return NextResponse.json({ qualifies: stats.qualifies });
}
