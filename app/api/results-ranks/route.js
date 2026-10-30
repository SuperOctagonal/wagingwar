import { NextResponse } from 'next/server';
import { computeRanksForDate } from '@/lib/resultsRanks';

// Deliberately NOT Pro-gated, and not login-gated either — post-race ranks
// are proof of model performance, meant to be visible to every visitor
// (see Results-page rank-badge unlock, and /results being public in
// middleware.js). Scores server-side against the FULL (unstripped)
// race_cards data and returns only the computed rank/margin per race —
// never the raw scoring-input fields, so this is safe to expose to
// anyone: there is nothing in the response that could be used to
// reconstruct a real ranking, unlike the raw /api/race-cards or
// /api/today-csv payloads (both of which remain login+Pro-gated).
// Computation itself lives in lib/resultsRanks.js, shared with the
// homepage's model-stats summary (app/page.js) so there's one
// implementation, not two that could drift.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const result = await computeRanksForDate(date);
  if (result === null) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });

  // Past racing dates don't change (also cached in memory, see
  // lib/resultsRanks.js); today's can still move with late scratchings.
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' });
  return NextResponse.json(result, {
    headers: { 'Cache-Control': date < today ? 'public, max-age=3600, s-maxage=86400' : 'no-store' },
  });
}
