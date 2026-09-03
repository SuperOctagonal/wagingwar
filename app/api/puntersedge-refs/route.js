import { NextResponse } from 'next/server';
import { normaliseVenue } from '@/lib/venues';
import { matchRunnerName } from '@/lib/puntersedgeMatch';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;
const PE_KEY = process.env.PUNTERSEDGE_API_KEY;
const PE_BASE = process.env.PUNTERSEDGE_BASE_URL;

// Sydney "today" -- PuntersEdge's best-odds feed is next-to-go/current races
// only, so every race in one response belongs to the current AU racing day.
function sydneyToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

export async function POST(request) {
  if (SECRET) {
    const incoming = request.headers.get('x-import-secret');
    if (incoming !== SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });
  }
  if (!PE_KEY || !PE_BASE) {
    return NextResponse.json({ error: 'PuntersEdge env vars not set' }, { status: 500 });
  }

  const dateISO = sydneyToday();
  const sbHeaders = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  let peRaces;
  try {
    const r = await fetch(`${PE_BASE}/v1/racing/best-odds?categories=horse`, {
      headers: { 'X-API-Key': PE_KEY },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `PuntersEdge ${r.status}: ${await r.text()}` }, { status: 502 });
    }
    peRaces = await r.json();
  } catch (err) {
    return NextResponse.json({ error: `PuntersEdge network error: ${err.message}` }, { status: 502 });
  }

  const cardsRes = await fetchAllRows(
    `${SURL}/rest/v1/race_cards?date=eq.${dateISO}&select=venue,race_num,horse_name,puntersedge_runner_ref`,
    sbHeaders,
  );
  if (!cardsRes.ok) {
    return NextResponse.json({ error: `race_cards fetch ${cardsRes.status}: ${cardsRes.text}` }, { status: 502 });
  }

  const byRace = new Map();
  for (const c of cardsRes.rows) {
    const key = `${normaliseVenue(c.venue)}||${c.race_num}`;
    if (!byRace.has(key)) byRace.set(key, []);
    byRace.get(key).push(c);
  }

  const result = { date: dateISO, races: peRaces.length, matched: 0, unmatched: [], races_no_cards: [], errors: [] };
  const updateRows = [];

  for (const race of peRaces) {
    if (race.country !== 'AU') continue;
    const key = `${normaliseVenue(race.venue)}||${race.race_number}`;
    const cards = byRace.get(key);
    if (!cards) {
      result.races_no_cards.push(`${race.venue} R${race.race_number}`);
      continue;
    }
    const ourNames = cards.map(c => c.horse_name);
    for (const runner of (race.runners || [])) {
      if (!runner.runner_ref) continue; // some runners carry no odds/ref at all -- nothing to write
      const matchedName = matchRunnerName(runner.name, ourNames);
      if (!matchedName) {
        result.unmatched.push(`${race.venue} R${race.race_number}: "${runner.name}"`);
        continue;
      }
      const card = cards.find(c => c.horse_name === matchedName);
      // No-op on already-set refs unless PuntersEdge's value actually differs --
      // never let a no-match elsewhere in this run touch an unrelated row, and
      // never write null over an existing non-null ref.
      if (card.puntersedge_runner_ref === runner.runner_ref) continue;
      updateRows.push({
        date: dateISO,
        venue: normaliseVenue(race.venue),
        race_num: card.race_num,
        horse_name: matchedName,
        puntersedge_runner_ref: runner.runner_ref,
      });
      result.matched++;
    }
  }

  if (updateRows.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/race_cards?on_conflict=date,venue,race_num,horse_name`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(updateRows),
      });
      if (!r.ok) {
        result.errors.push(`race_cards update ${r.status}: ${await r.text()}`);
      }
    } catch (err) {
      result.errors.push(`race_cards update network error: ${err.message}`);
    }
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
