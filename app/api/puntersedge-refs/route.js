import { NextResponse } from 'next/server';
import { normaliseVenue, resolveAmbiguousVenue } from '@/lib/venues';
import { matchRunnerName } from '@/lib/puntersedgeMatch';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;
const PE_KEY = process.env.PUNTERSEDGE_API_KEY;
const PE_BASE = process.env.PUNTERSEDGE_BASE_URL;

// odds_snapshot write-rate throttle -- this route was writing a full batch
// (every bookmaker x runner) for EVERY race on the card on every poll
// (~every 2.6min, around the clock), including races hours from jumping
// that don't need that density. ~1.4M rows/day, ~37k rows per race per
// day. Throttles whole races, never individual rows -- every batch that
// does get written still has every bookmaker/runner for that race and one
// shared captured_at, since lib/marketMoves.js, OddsTable.js and the
// value-bets code all treat one captured_at as one complete batch.
const ODDS_SNAPSHOT_FAR_MIN = Number(process.env.ODDS_SNAPSHOT_FAR_MIN || 60);
const ODDS_SNAPSHOT_THROTTLE_INTERVAL_MIN = Number(process.env.ODDS_SNAPSHOT_THROTTLE_INTERVAL_MIN || 15);
const ODDS_SNAPSHOT_POST_JUMP_GRACE_MIN = Number(process.env.ODDS_SNAPSHOT_POST_JUMP_GRACE_MIN || 2);

// Render runs this route in a persistent process (not per-request
// serverless), so a plain module-level Map genuinely persists across polls
// -- same convention as lib/wizardCsvCache.js. A process restart just means
// one extra batch gets written for every still-throttled race on the next
// poll after restart, which is harmless.
const _lastSnapshotWriteMs = new Map(); // `${resolvedVenue}||${raceNum}` -> ms

// An ISO/epoch timestamp carries its own zone (Z or an explicit +/-HH:MM
// offset) -- unambiguous regardless of which state the race is in. A bare
// "2026-10-05T00:20:00" with no zone designator is NOT unambiguous (new
// Date() would silently treat it as the server's own local time), so that's
// rejected here rather than trusted.
function isUnambiguousTimestamp(value) {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  return /Z$|[+-]\d{2}:?\d{2}$/.test(value.trim());
}

// PuntersEdge's next-to-go races carry their own start_time (confirmed
// live: ISO UTC with a "Z" suffix, e.g. "2026-10-05T00:20:00Z") -- trusted
// only when isUnambiguousTimestamp() passes.
//
// No race_schedule.post_time fallback -- tried that, but live data
// contradicted the "post_time is venue-local" assumption it would have
// relied on: Doomben R1 (QLD) had PE start_time 1:46pm Sydney vs
// race_schedule post_time "01.46 pm" (would compute 2:46pm, an hour
// wrong), and Gawler R1 (SA) had PE start_time 1:55pm Sydney vs post_time
// "02.25 pm" (fits no timezone reading at all). Can't safely resolve a
// start time from post_time, so this returns null instead -- callers
// already treat null as "unknown": write every poll, no far-throttle, no
// post-jump skip, same as before this change for any race whose
// start_time isn't usable.
function resolveRaceStartMs(race) {
  if (isUnambiguousTimestamp(race.start_time)) {
    const d = new Date(race.start_time);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

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
    const resolvedVenue = resolveAmbiguousVenue(canonVenue, venuesWithCards);
    return { key: `${resolvedVenue}||${raceNum}`, venue: resolvedVenue };
  }

  const result = {
    date: dateISO, races: peRaces.length, matched: 0, unmatched: [], races_no_cards: [],
    // Mirrors unmatched/races_no_cards above, but for the next-to-go loop
    // below (the one that actually builds odds_snapshot) -- that loop
    // previously had a bare `if (!cards) continue` with zero tracking,
    // which is exactly how the Caulfield Heath venue-mismatch gap (6 of
    // 8 races silently getting no odds_snapshot rows all day) went
    // unnoticed. Kept as separate fields rather than merged into the
    // best-odds arrays above since a race/runner can legitimately show up
    // in one feed's response and not the other.
    snapshot_races_no_cards: [], snapshot_unmatched: [],
    errors: [],
  };
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
  const nowMs = Date.now();
  const snapshotRows = [];
  result.snapshot_rows = 0;
  result.snapshot_races_written = 0;
  result.snapshot_races_throttled = 0;
  result.snapshot_races_post_jump = 0;
  const raceKeysWithRows = new Set();

  for (const race of ntgRaces) {
    if (race.country !== 'AU') continue;
    const { key, venue: resolvedVenue } = resolveRaceKey(normaliseVenue(race.venue), race.race_number);
    const cards = byRace.get(key);
    if (!cards) {
      result.snapshot_races_no_cards.push(`${race.venue} R${race.race_number}`);
      continue;
    }

    // Throttle decision, per race (never per row) -- see the constants/
    // helpers above. startMs == null (start_time missing/unparseable/
    // ambiguous) fails open: write every poll, same as current behaviour,
    // rather than silently going dark on a race this can't place in time.
    const startMs = resolveRaceStartMs(race);
    if (startMs != null) {
      const minsToStart = (startMs - nowMs) / 60000;
      if (minsToStart < -ODDS_SNAPSHOT_POST_JUMP_GRACE_MIN) {
        result.snapshot_races_post_jump++;
        continue;
      }
      if (minsToStart > ODDS_SNAPSHOT_FAR_MIN) {
        const lastWrite = _lastSnapshotWriteMs.get(key);
        if (lastWrite != null && nowMs - lastWrite < ODDS_SNAPSHOT_THROTTLE_INTERVAL_MIN * 60000) {
          result.snapshot_races_throttled++;
          continue;
        }
      }
    }

    const ourNames = cards.map(c => c.horse_name);
    let rowsForThisRace = 0;
    for (const runner of (race.runners || [])) {
      const matchedName = matchRunnerName(runner.name, ourNames);
      if (!matchedName) {
        result.snapshot_unmatched.push(`${race.venue} R${race.race_number}: "${runner.name}"`);
        continue;
      }
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
        rowsForThisRace++;
      }
    }
    if (rowsForThisRace > 0) {
      raceKeysWithRows.add(key);
      result.snapshot_races_written++;
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
        // Only mark races as "written" (for the throttle Map) once the
        // insert has actually succeeded -- a failed insert must not make a
        // throttled race wait another full interval for a batch that never
        // landed.
        for (const k of raceKeysWithRows) _lastSnapshotWriteMs.set(k, nowMs);
      }
    } catch (err) {
      result.errors.push(`odds_snapshot insert network error: ${err.message}`);
    }
  }

  // console.warn (not just the JSON response body) so a coverage gap like
  // the Caulfield Heath venue mismatch shows up in Render logs immediately
  // -- this route is polled by an external cron, and nothing in this repo
  // was inspecting result.races_no_cards/unmatched/snapshot_* on a normal
  // day, which is exactly why that gap ran unnoticed all day.
  if (result.races_no_cards.length || result.snapshot_races_no_cards.length || result.unmatched.length || result.snapshot_unmatched.length) {
    console.warn('[puntersedge-refs] dropped races/runners this run:', {
      races_no_cards: result.races_no_cards,
      snapshot_races_no_cards: result.snapshot_races_no_cards,
      unmatched: result.unmatched,
      snapshot_unmatched: result.snapshot_unmatched,
    });
  }

  // Phase 1 of the self-learning scoring project (race_feature_snapshots)
  // -- piggybacked on this route since it's the only already-scheduled
  // periodic trigger in the codebase. Wrapped defensively: a snapshot-
  // capture failure must never affect this route's actual job (odds
  // ingestion) or its response status.
  try {
    const { captureRaceFeatureSnapshots } = await import('@/lib/raceFeatureSnapshots');
    result.feature_snapshots = await captureRaceFeatureSnapshots(dateISO);
  } catch (err) {
    result.feature_snapshots = { errors: [`capture threw: ${err.message}`] };
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
