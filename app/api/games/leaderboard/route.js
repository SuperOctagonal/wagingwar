import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// Top score per user for a game_type/date (track_dash allows many plays/day
// -- this collapses to each user's best run, not every row).
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const gameType = searchParams.get('game_type') || 'track_dash';
  const date = searchParams.get('date') || todayISO();

  const res = await fetch(
    `${SURL}/rest/v1/puzzle_scores?game_type=eq.${encodeURIComponent(gameType)}&date=eq.${date}&select=clerk_id,score&order=score.desc&limit=200`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
  );
  if (!res.ok) return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 502 });
  const rows = await res.json();

  const bestByUser = new Map();
  for (const r of rows) {
    if (!bestByUser.has(r.clerk_id) || bestByUser.get(r.clerk_id) < r.score) bestByUser.set(r.clerk_id, r.score);
  }
  const ranked = [...bestByUser.entries()]
    .map(([clerk_id, score]) => ({ clerk_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return NextResponse.json({ gameType, date, rows: ranked, isMe: userId });
}
