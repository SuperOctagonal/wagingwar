import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function parseTimeStr(timeStr) {
  if (!timeStr) return null;
  const t = timeStr.trim().replace(/\./g, ':');
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  let h, m;
  if (ampm) {
    h = parseInt(ampm[1], 10);
    m = parseInt(ampm[2], 10);
    if (/pm/i.test(ampm[3]) && h !== 12) h += 12;
    if (/am/i.test(ampm[3]) && h === 12) h = 0;
  } else {
    const plain = t.match(/^(\d{1,2}):(\d{2})/);
    if (!plain) return null;
    h = parseInt(plain[1], 10);
    m = parseInt(plain[2], 10);
  }
  return { h, m };
}

// Offset (minutes) between UTC and Australia/Brisbane at a given instant, derived
// via Intl rather than hardcoded — Brisbane doesn't observe daylight saving, but
// other states supplying race times do, so we never assume a fixed +10:00.
function brisbaneOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Brisbane', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  const hour = +parts.hour === 24 ? 0 : +parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

function brisbaneDateTimeToInstant(dateISO, timeStr) {
  const parsed = parseTimeStr(timeStr);
  if (!parsed || !dateISO) return null;
  const [y, mo, d] = dateISO.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const naiveUTC = Date.UTC(y, mo - 1, d, parsed.h, parsed.m, 0);
  const offsetMin = brisbaneOffsetMinutes(new Date(naiveUTC));
  return new Date(naiveUTC - offsetMin * 60000);
}

function brisbaneTodayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

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
