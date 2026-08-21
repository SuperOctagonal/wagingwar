import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { computeInsightsSummary, fetchUserSettings } from '@/lib/insightsSummary';
import { parseFilterParams } from '@/lib/serverInsightsData';

// Batches of the Insights server-side rebuild land as fields on the same
// response rather than new routes -- every Insights section reads from the
// same underlying dataset (this user's own bet_log + closing SP), unlike
// Results' two routes which needed genuinely different heavy per-race joins.
// Batch 1: Hero bar, ROI by model rank, Edge zone heatmap, Track condition.
// Batch 2: CLV tracker, Kelly staking advisor, Top venues.
// Batch 3: Staking discipline, P&L calendar.
// Batch 4: BetFilterPanel's filters wired in below (venue/condition/rank/
// betType/oddsBand/stakeBand/bookmaker/state/result/dow/distance/raceClass),
// closing the temporary inconsistency where those filters only affected
// sections that hadn't migrated to server-side computation yet.
// The actual aggregation lives in lib/insightsSummary.js, shared with
// /api/insights/ai-summary so that route consumes the exact same numbers
// rather than recomputing (or re-deriving) anything.

export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') || undefined;
  const end = searchParams.get('end') || undefined;
  const filters = parseFilterParams(searchParams);

  const userSettings = await fetchUserSettings(userId);
  const { ok, summary } = await computeInsightsSummary(userId, { start, end, filters }, userSettings);
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  return NextResponse.json({ ...summary, dateRange: { start: start || null, end: end || null } });
}
