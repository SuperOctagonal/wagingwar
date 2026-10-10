import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { isSiteAdmin } from '@/lib/admin';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Real server-side gate for the Field table/mobile card/Pace Map's live
// price + Move column data -- previously fetched straight from the client
// with the anon key and displayed behind an `isAdmin` prop that was
// actually hardcoded `true` everywhere it reached a render site (see
// app/races/page.js), so every signed-in user, any plan, already saw all
// of this. This route is the first real enforcement point in that whole
// pipeline: lite+ (or an actual site admin) required, nothing returned
// otherwise -- matching the pattern in /api/market-movers and
// /api/value-bets, not just a UI-side hide.
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
  if (!venue || !raceNum || !date) {
    return NextResponse.json({ error: 'venue, raceNum and date are required' }, { status: 400 });
  }

  let livePrices = {};
  if (bookmaker) {
    try {
      const res = await fetch(
        `${SURL}/rest/v1/odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&bookmaker=eq.${encodeURIComponent(bookmaker)}&select=horse_name,price,captured_at&order=captured_at.desc&limit=200`,
        { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
      );
      if (res.ok) {
        const rows = await res.json();
        // Rows are ordered newest-first, so the first hit per horse is the latest price.
        for (const r of rows) {
          const key = nameKey(r.horse_name);
          if (!(key in livePrices)) livePrices[key] = Number(r.price);
        }
      }
    } catch { /* livePrices stays {} -- non-fatal, matches the old client-side try/catch */ }
  }

  const marketMoves = await fetchMarketMoveFlags({ venue, raceNum, date });

  return NextResponse.json({ livePrices, marketMoves });
}
