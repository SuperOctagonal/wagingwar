import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { fetchAllTodayValueBets } from '@/lib/valueBets';

// Pro-gated -- same server-side pattern as every other Pro gate (e.g.
// /api/insights/summary, /api/market-movers): auth() for the signed-in
// user, then check their Clerk publicMetadata.plan.
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

  const bets = await fetchAllTodayValueBets(date);
  return NextResponse.json({ date, bets });
}
