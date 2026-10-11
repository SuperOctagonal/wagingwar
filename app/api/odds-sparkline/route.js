import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { isSiteAdmin } from '@/lib/admin';
import { nameKey } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Backs the Field table's expandable-row price sparkline (open -> now, one
// bookmaker, one horse) -- same real lite+/site-admin gate as
// /api/race-live-prices, since this is just a different slice of the exact
// same odds_snapshot data that route already serves.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!hasFeature(user?.publicMetadata?.plan, 'live_odds') && !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Lite or Pro required' }, { status: 403 });
  }

  if (!SURL || !SKEY) return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const venue = searchParams.get('venue');
  const raceNum = searchParams.get('raceNum');
  const date = searchParams.get('date');
  const bookmaker = searchParams.get('bookmaker');
  const horse = searchParams.get('horse');
  if (!venue || !raceNum || !date || !bookmaker || !horse) {
    return NextResponse.json({ error: 'venue, raceNum, date, bookmaker and horse are required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${SURL}/rest/v1/odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&bookmaker=eq.${encodeURIComponent(bookmaker)}&select=horse_name,price,captured_at&order=captured_at.asc&limit=500`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!res.ok) return NextResponse.json({ points: [] });
    const rows = await res.json();
    const key = nameKey(horse);
    const points = rows
      .filter(r => nameKey(r.horse_name) === key && Number.isFinite(Number(r.price)))
      .map(r => ({ price: Number(r.price), capturedAt: r.captured_at }));
    return NextResponse.json({ points });
  } catch {
    return NextResponse.json({ points: [] });
  }
}
