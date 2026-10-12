import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { isSiteAdmin } from '@/lib/admin';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Real server-side gate for the Field table/mobile card/Pace Map's live
// price + Move column data -- previously fetched straight from the client
// with the anon key and no auth check at all. live_odds is min-plan
// 'free' (restored to its pre-Lite-work state: this was open to every
// signed-in user before, including Free, and only signed-out visitors
// got nothing), so this still rejects only unauthenticated requests --
// hasFeature/isSiteAdmin are kept (rather than dropping the check
// entirely) so the gate stays real if live_odds' min plan ever changes
// again. Pace Map's own canLivePrices is tied to its separate Pro-only
// canAccess gate in app/races/page.js, not this route, so Pace Map's
// live prices stay Pro-only regardless of this one being open to Free.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!hasFeature(user?.publicMetadata?.plan, 'live_odds') && !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 403 });
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
