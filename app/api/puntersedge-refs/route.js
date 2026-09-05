import { NextResponse } from 'next/server';
import { normaliseVenue, AMBIGUOUS_VENUE_FALLBACKS } from '@/lib/venues';
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
    // num_races defaults to a small cap (confirmed empirically: 10) when
    // omitted -- 150 is best-odds' documented max ("compare every race on
    // the day's card in one call"), and costs the same credits as the
    // truncated default (confirmed via /v1/usage before/after: flat 3
    // credits/call regardless of race count).
    const r = await fetch(`${PE_BASE}/v1/racing/best-odds?categories=horse&num_races=150`, {
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
    `${SURL}/rest/v1/race_cards?date=eq.${dateISO}&select=venue,race_num,horse_name,puntersedge_runner_ref&order=venue,race_num,horse_name`,
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
  // Every canonical venue with at least one real race_cards row today --
  // used to confirm a bare-name fallback venue ("Randwick" -> RANDWICK INS)
  // is only applied when the bare name genuinely isn't racing under its own
  // name, same condition worker.py's version checks via get_target_race_count.
  const venuesWithCards = new Set([...byRace.keys()].map(k => k.split('||')[0]));

  // Resolves a venue+race key, falling back to a known sub-venue when the
  // canonical venue from PuntersEdge's bare name has no cards today but its
  // fallback does -- see AMBIGUOUS_VENUE_FALLBACKS in lib/venues.js.
  function resolveRaceKey(canonVenue, raceNum) {
    const direct = `${canonVenue}||${raceNum}`;
    if (byRace.has(direct)) return { key: direct, venue: canonVenue };
    const fallback = AMBIGUOUS_VENUE_FALLBACKS[canonVenue];
    if (fallback && !venuesWithCards.has(canonVenue) && venuesWithCards.has(fallback)) {
      return { key: `${fallback}||${raceNum}`, venue: fallback };
    }
    return { key: direct, venue: canonVenue };
  }

  const result = { date: dateISO, races: peRaces.length, matched: 0, unmatched: [], races_no_cards: [], errors: [] };
  const updateRows = [];

  for (const race of peRaces) {
    if (race.country !== 'AU') continue;
    const { key, venue: resolvedVenue } = resolveRaceKey(normaliseVenue(race.venue), race.race_number);
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
        venue: resolvedVenue,
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

  // next-to-go carries the full per-bookmaker price breakdown (best-odds only
  // gives a single best price), so it's fetched separately and matched the
  // same way to build odds_snapshot -- one row per (horse, bookmaker) per run.
  let ntgRaces = [];
  try {
    // Same fix as best-odds above -- 200 is next-to-go's documented max
    // ("bulk-pull every currently quoted race"), same flat credit cost.
    const r = await fetch(`${PE_BASE}/v1/racing/next-to-go?categories=horse&num_races=200`, {
      headers: { 'X-API-Key': PE_KEY },
    });
    if (!r.ok) {
      result.errors.push(`PuntersEdge next-to-go ${r.status}: ${await r.text()}`);
    } else {
      ntgRaces = await r.json();
    }
  } catch (err) {
    result.errors.push(`PuntersEdge next-to-go network error: ${err.message}`);
  }

  const capturedAt = new Date().toISOString();
  const snapshotRows = [];
  result.snapshot_rows = 0;

  for (const race of ntgRaces) {
    if (race.country !== 'AU') continue;
    const { key, venue: resolvedVenue } = resolveRaceKey(normaliseVenue(race.venue), race.race_number);
    const cards = byRace.get(key);
    if (!cards) continue;
    const ourNames = cards.map(c => c.horse_name);
    for (const runner of (race.runners || [])) {
      const matchedName = matchRunnerName(runner.name, ourNames);
      if (!matchedName) continue;
      for (const bm of (runner.bookmakers || [])) {
        if (bm.win_price == null) continue;
        snapshotRows.push({
          race_venue: resolvedVenue,
          race_num: String(race.race_number),
          race_date: dateISO,
          horse_name: matchedName,
          puntersedge_runner_ref: runner.runner_ref ?? null,
          bookmaker: bm.key,
          price: bm.win_price,
          captured_at: capturedAt,
        });
      }
    }
  }

  if (snapshotRows.length) {
    try {
      const r = await fetch(`${SURL}/rest/v1/odds_snapshot`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(snapshotRows),
      });
      if (!r.ok) {
        result.errors.push(`odds_snapshot insert ${r.status}: ${await r.text()}`);
      } else {
        result.snapshot_rows = snapshotRows.length;
      }
    } catch (err) {
      result.errors.push(`odds_snapshot insert network error: ${err.message}`);
    }
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
