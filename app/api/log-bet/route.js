import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.horse_name || !(+body?.stake > 0) || !(+body?.odds > 1)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const betDate = body.date ?? new Date().toISOString().slice(0, 10);

  // No race-status gate — logging (or re-logging) is allowed at any time,
  // regardless of jump time or resulted status. The mybets ledger tags bets
  // logged after jump time or after resulting for transparency (see
  // isLoggedLate/isLoggedAfterResult in app/mybets/page.js), computed from
  // this row's created_at — nothing to enforce here at insert time.

  const insertBody = {
    clerk_id:        userId,
    date:            betDate,
    horse_name:      body.horse_name,
    track:           body.track           ?? null,
    venue:           body.venue           ?? null,
    race_number:     body.race_number     ?? null,
    bet_type:        body.bet_type        ?? 'win',
    stake:           +body.stake,
    odds:            +body.odds,
    place_odds:      body.place_odds != null && body.place_odds !== '' ? +body.place_odds : null,
    status:          'pending',
    bookmaker:       body.bookmaker       ?? null,
    rank:            body.rank            ?? null,
    my_odds:         body.my_odds         ?? null,
    track_condition: body.track_condition ?? null,
    race_name:       body.race_name       ?? null,
    meeting_date:    body.meeting_date    ?? null,
    race_time:       body.race_time       ?? null,
    tab_no:          body.tab_no          ?? null,
    return_amt:      null,
    position:        null,
  };

  const r = await fetch(`${SURL}/rest/v1/bet_log?select=*`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(insertBody),
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error('[log-bet] Supabase error:', r.status, errText);
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }
  const data = await r.json();
  return NextResponse.json(data);
}
