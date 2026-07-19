import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';
import { brisbaneDateTimeToInstant, brisbaneTodayISO } from '@/lib/raceTime';

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

  // Jump-time gate — only applies to bets dated today or later. Backdated/historical
  // entries skip this check entirely.
  if (betDate >= brisbaneTodayISO()) {
    if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const raceNumStr = body.race_number != null ? String(body.race_number) : null;
    if (!raceNumStr || !body.venue) {
      return NextResponse.json({ error: 'Venue and race number are required to log a bet on today\'s racing' }, { status: 400 });
    }

    const scheduleRes = await fetch(
      `${SURL}/rest/v1/race_schedule?date=eq.${betDate}&race_num=eq.${raceNumStr}&select=venue,post_time`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    );
    if (!scheduleRes.ok) {
      console.error('[log-bet] race_schedule lookup failed:', scheduleRes.status, await scheduleRes.text());
      return NextResponse.json({ error: 'Could not verify race time' }, { status: 502 });
    }
    const scheduleRows = await scheduleRes.json();
    const match = (Array.isArray(scheduleRows) ? scheduleRows : [])
      .find(row => normaliseVenue(row.venue) === normaliseVenue(body.venue));

    if (!match?.post_time) {
      return NextResponse.json({ error: 'No race schedule found for this race — cannot verify jump time' }, { status: 422 });
    }

    const raceInstant = brisbaneDateTimeToInstant(betDate, match.post_time);
    if (raceInstant && raceInstant.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This race has already jumped — bet cannot be logged' }, { status: 409 });
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
