import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { fetchAllTodayMarketMoves } from '@/lib/marketMoves';

// Pro-gated (same server-side pattern as every other Pro gate in the
// codebase, e.g. /api/insights/summary) -- Market Movers spans every
// runner across all of today's races, not just the currently-selected one,
// so it needs its own route rather than riding on the Races page's existing
// admin-only live-price feature.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const movers = await fetchAllTodayMarketMoves(date);
  return NextResponse.json({ date, movers });
}
