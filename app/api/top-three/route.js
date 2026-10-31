import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { fetchTopThree } from '@/lib/topThree';

// Top 3 at a glance -- Pro gated, same server-side pattern as the other Pro
// racing data (/api/value-bets, /api/market-movers): auth() for the
// signed-in user, then their Clerk publicMetadata.plan against the shared
// feature table ('full_scores' -- the scores and rankings themselves).
// Today only; the page polls this once a minute and lib/topThree.js builds
// it at most once a minute for everyone.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!hasFeature(user?.publicMetadata?.plan, 'full_scores')) {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const data = await fetchTopThree();
  if (!data) return NextResponse.json({ error: 'Unavailable' }, { status: 502 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
