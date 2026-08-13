import { NextResponse } from 'next/server';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { normaliseVenue, AU_VENUE_STATE as VENUE_STATE_MAP } from '@/lib/venues';

const SURL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY  = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;

function toISO(d) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

export async function POST(request) {
  // Auth
  if (SECRET) {
    const incoming = request.headers.get('x-import-secret');
    if (incoming !== SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });
  }

  const text = await request.text();
  if (!text || text.trim().length < 50) {
    return NextResponse.json({ error: 'Empty or too-short CSV body' }, { status: 400 });
  }

  let allRaces, allVenues;
  try {
    ({ allRaces, allVenues } = buildRaces(parseCSV(text)));
  } catch (err) {
    return NextResponse.json({ error: `CSV parse failed: ${err.message}` }, { status: 400 });
  }

  const raceKeys = Object.keys(allRaces);
  if (!raceKeys.length) {
    return NextResponse.json({ error: 'No races parsed — check CSV format' }, { status: 400 });
  }

  const dateISO = toISO(allRaces[raceKeys[0]]?.date);
  if (!dateISO) {
    return NextResponse.json({ error: 'Could not determine race date from CSV' }, { status: 400 });
  }

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
  };

  const result = { date: dateISO, venues: 0, scheduleRows: 0, cardRows: 0, errors: [] };

  // Safety net for the NZ blocklist (lib/csvParser.js): it can only ever
  // exclude tracks someone thought to enumerate, so an obscure non-AU
  // meeting could still slip through. This doesn't exclude anything --
  // purely a visibility flag -- checked *before* this request's own sync
  // below writes anything, so a genuine mismatch isn't masked.
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
          console.warn(`[import-csv] CSV venue "${v}" (${normV}) has no matching today_meetings row for ${dateISO} -- not excluded, just flagging for review.`);
        }
      });
    }
  } catch (err) {
    console.error('[import-csv] today_meetings cross-check failed:', err);
  }

  // today_meetings — ignore duplicates so the worker's track_condition is never clobbered
  const meetingRows = Object.keys(allVenues)
    .map(v => {
      const normV = normaliseVenue(v);
      const state = VENUE_STATE_MAP[normV] || null;
      if (!state) console.warn(`[import-csv] unknown state for venue: "${v}" → "${normV}" — writing with state null`);
      return { venue: normV, state, date: dateISO };
    });

  if (meetingRows.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/today_meetings?on_conflict=date,venue`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(meetingRows),
      });
      if (r.ok) {
        result.venues = meetingRows.length;
      } else {
        result.errors.push(`today_meetings ${r.status}: ${await r.text()}`);
      }
    } catch (err) {
      result.errors.push(`today_meetings network error: ${err.message}`);
    }
  }

  // race_schedule — merge-duplicates so a re-run updates times if they change
  const scheduleRows = [];
  for (const k of raceKeys) {
    const rc = allRaces[k];
    if (!rc.time || !rc.date || !rc.venue) continue;
    const d = toISO(rc.date);
    if (!d) continue;
    scheduleRows.push({ date: d, venue: normaliseVenue(rc.venue), race_num: String(rc.num), post_time: rc.time });
  }

  if (scheduleRows.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/race_schedule?on_conflict=date,venue,race_num`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(scheduleRows),
      });
      if (r.ok) {
        result.scheduleRows = scheduleRows.length;
      } else {
        result.errors.push(`race_schedule ${r.status}: ${await r.text()}`);
      }
    } catch (err) {
      result.errors.push(`race_schedule network error: ${err.message}`);
    }
  }

  // race_cards — upsert full per-horse form data; merge-duplicates so re-runs update scratchings
  const cardRows = [];
  for (const k of raceKeys) {
    const rc = allRaces[k];
    if (!rc.date || !rc.venue) continue;
    const d = toISO(rc.date);
    if (!d) continue;
    const normV = normaliseVenue(rc.venue);
    for (const horse of (rc.horses || [])) {
      if (!horse.name) continue;
      cardRows.push({
        date: d,
        venue: normV,
        race_num: String(rc.num),
        horse_name: horse.name,
        barrier: horse.BP ?? null,
        scratched: horse.scratched || false,
        form_data: horse,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const seenCards = new Set();
  const dedupedCards = cardRows.filter(row => {
    const key = `${row.date}||${row.venue}||${row.race_num}||${row.horse_name}`;
    if (seenCards.has(key)) return false;
    seenCards.add(key);
    return true;
  });
  const dupeCount = cardRows.length - dedupedCards.length;
  if (dupeCount > 0) console.warn(`[import-csv] race_cards: removed ${dupeCount} duplicate rows`);

  if (dedupedCards.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/race_cards?on_conflict=date,venue,race_num,horse_name`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(dedupedCards),
      });
      if (r.ok) {
        result.cardRows = dedupedCards.length;
      } else {
        result.errors.push(`race_cards ${r.status}: ${await r.text()}`);
      }
    } catch (err) {
      result.errors.push(`race_cards network error: ${err.message}`);
    }
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
