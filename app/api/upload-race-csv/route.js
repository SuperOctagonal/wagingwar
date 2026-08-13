import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { normaliseVenue, AU_VENUE_STATE as VENUE_STATE_MAP } from '@/lib/venues';
import { isRacesAdmin } from '@/lib/admin';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function toISO(d) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isRacesAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
  }

  const { text } = await req.json().catch(() => ({}));
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing CSV text' }, { status: 400 });
  }

  let allRaces, allVenues;
  try {
    ({ allRaces, allVenues } = buildRaces(parseCSV(text)));
  } catch (err) {
    return NextResponse.json({ error: `CSV parse failed: ${err.message}` }, { status: 400 });
  }

  const raceKeys = Object.keys(allRaces);
  const firstKey = raceKeys[0];
  const dateISO = firstKey ? toISO(allRaces[firstKey]?.date) : null;

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
  };

  let meetingsSynced = false;

  if (dateISO) {
    // Safety net for the NZ blocklist below (in lib/csvParser.js): it can
    // only ever exclude tracks someone thought to enumerate, so an obscure
    // non-AU meeting could still slip through. This doesn't exclude
    // anything -- purely a visibility flag -- but cross-checks each CSV
    // venue against today_meetings (populated independently by the backend's
    // RA-calendar scraper) *before* this request's own sync writes anything,
    // so a genuine mismatch isn't masked by the insert that's about to
    // happen below.
    try {
      const existingRes = await fetch(
        `${SURL}/rest/v1/today_meetings?date=eq.${dateISO}&select=venue`,
        { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
      );
      if (existingRes.ok) {
        const existingVenues = new Set((await existingRes.json()).map(r => normaliseVenue(r.venue)));
        Object.keys(allVenues).forEach(v => {
          const normV = normaliseVenue(v);
          if (!existingVenues.has(normV)) {
            console.warn(`[upload-race-csv] CSV venue "${v}" (${normV}) has no matching today_meetings row for ${dateISO} -- not excluded, just flagging for review (could be a non-AU meeting the blocklist missed, or today_meetings simply hasn't synced yet).`);
          }
        });
      }
    } catch (err) {
      console.error('[upload-race-csv] today_meetings cross-check failed:', err);
    }

    // Filter unknown-state venues so a single missing entry doesn't abort the batch.
    // Use ignore-duplicates so the worker's track_condition is never overwritten by CSV reload.
    const rows = Object.keys(allVenues)
      .map(v => { const normV = normaliseVenue(v); return { venue: normV, state: VENUE_STATE_MAP[normV] || null, date: dateISO }; })
      .filter(r => r.state !== null);

    if (rows.length) {
      const r = await fetch(`${SURL}/rest/v1/today_meetings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      if (r.ok) {
        meetingsSynced = true;
      } else {
        console.error('[upload-race-csv] today_meetings sync failed:', r.status, await r.text());
      }
    }
  }

  // Upsert race post times to race_schedule for historical backfill in mybets
  const scheduleRows = [];
  for (const k of raceKeys) {
    const rc = allRaces[k];
    if (!rc.time || !rc.date || !rc.venue) continue;
    const d = toISO(rc.date);
    if (!d) continue;
    scheduleRows.push({ date: d, venue: normaliseVenue(rc.venue), race_num: String(rc.num), post_time: rc.time });
  }

  if (scheduleRows.length) {
    const r = await fetch(`${SURL}/rest/v1/race_schedule`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(scheduleRows),
    });
    if (!r.ok) {
      console.error('[upload-race-csv] race_schedule upsert failed:', r.status, await r.text());
    }
  }

  return NextResponse.json({ ok: true, meetingsSynced, raceCount: raceKeys.length });
}
