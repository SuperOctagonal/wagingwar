import { NextResponse } from 'next/server';
import { fetchMarketMoveFlags } from '@/lib/marketMoves';

// Public, read-only firming/drifting flags for one race -- replaces every
// remaining direct-from-browser call to fetchMarketMoveFlags() (which
// itself hits odds_snapshot + the race_odds_open_latest RPC with the anon
// key). Same public data /api/odds-table and /api/race-live-prices already
// serve; short-cached since the underlying poll interval is ~15-30min.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const venue = searchParams.get('venue');
  const raceNum = searchParams.get('raceNum');
  const date = searchParams.get('date');
  if (!venue || !raceNum || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'venue, raceNum and date are required' }, { status: 400 });
  }

  const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
  return NextResponse.json(flags, { headers: { 'Cache-Control': 'public, max-age=30' } });
}
