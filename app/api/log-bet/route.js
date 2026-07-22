import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';
import { brisbaneTodayISO } from '@/lib/raceTime';

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

  // Resulted gate — only applies to bets dated today or later. Backdated/historical
  // entries skip this check entirely. Logging remains allowed after the race has
  // jumped (post time passed) right up until the race is actually resulted — the
  // same "has this race resulted" signal used by mybets/page.js's settlement
  // matching (a race_results row existing for this date/venue/race_num), not a
  // jump-time cutoff. The mybets ledger tags any bet logged after jump time as
  // "logged late" using its stored created_at timestamp.
  if (betDate >= brisbaneTodayISO()) {
    if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const raceNumStr = body.race_number != null ? String(body.race_number) : null;
    if (!raceNumStr || !body.venue) {
      return NextResponse.json({ error: 'Venue and race number are required to log a bet on today\'s racing' }, { status: 400 });
    }

    const resultsRes = await fetch(
      `${SURL}/rest/v1/race_results?date=eq.${betDate}&race_num=eq.${raceNumStr}&select=venue&limit=50`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    );
    if (!resultsRes.ok) {
      console.error('[log-bet] race_results lookup failed:', resultsRes.status, await resultsRes.text());
      return NextResponse.json({ error: 'Could not verify race status' }, { status: 502 });
    }
    const resultRows = await resultsRes.json();
    const isResulted = (Array.isArray(resultRows) ? resultRows : [])
      .some(row => normaliseVenue(row.venue) === normaliseVenue(body.venue));

    if (isResulted) {
      return NextResponse.json({ error: 'This race has already been resulted — bet cannot be logged' }, { status: 409 });
    }
  }

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
