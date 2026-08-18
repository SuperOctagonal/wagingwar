import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Unlike /api/battle-card/share, this always inserts a new row -- a user
// shares many different bets over time (not one aggregate snapshot per
// user), so each share needs its own stable id/URL. Data comes straight
// from the Log Bet modal's live form state in the request body, not from
// bet_log, so Share Bet works whether or not the bet has been saved.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const body = await req.json().catch(() => null);
  const horseName = body?.horse_name?.trim();
  const odds = +body?.odds;
  const stake = +body?.stake;
  if (!horseName || !(odds > 1) || !(stake > 0)) {
    return NextResponse.json({ error: 'Missing or invalid horse_name/odds/stake' }, { status: 400 });
  }

  const id = randomUUID().replace(/-/g, '').slice(0, 10);
  const r = await fetch(`${SURL}/rest/v1/bet_card_shares?select=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      clerk_id: userId,
      horse_name: horseName,
      venue: body.venue || null,
      race_number: body.race_number || null,
      race_name: body.race_name || null,
      odds,
      stake,
      potential_return: +(stake * odds).toFixed(2), // recomputed server-side, not trusted from client
    }),
  });
  if (!r.ok) return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });

  return NextResponse.json({ id, url: `https://wagingwar.com.au/bet-share/${id}` });
}
