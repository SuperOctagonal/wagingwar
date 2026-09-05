import { NextResponse } from 'next/server';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { selectBeatModelRace } from '@/lib/beatModel';
import { normaliseVenue } from '@/lib/venues';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;

const sbHeaders = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

async function sb(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

// Backfills btm_challenges for a date from that day's stored CSV (same
// selectBeatModelRace() logic the client uses), if the CSV is still
// retained in Storage. Returns the challenge row, or null if either the
// CSV is gone or no valid challenge race existed that day.
async function backfillChallenge(compDate) {
  const res = await fetch(`${SURL}/storage/v1/object/wizard-csv/${compDate}.csv`, { headers: sbHeaders });
  if (!res.ok) return null; // CSV no longer retained -- permanently unrecoverable for this date
  const text = await res.text();
  const built = buildRaces(parseCSV(text));
  const challenge = selectBeatModelRace(built.allRaces);
  if (!challenge) return null;

  const row = {
    comp_date: compDate,
    venue: challenge.venue,
    race_num: challenge.raceNum,
    race_name: challenge.raceName,
    prize_money: challenge.prize,
    post_time: challenge.postTimeISO,
    used_fallback: challenge.usedFallback,
  };
  await fetch(`${SURL}/rest/v1/btm_challenges?on_conflict=comp_date`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  return row;
}

// Server-side reconciliation for Beat the Model -- resolves any unresolved
// btm_picks row whose challenge race has actually finished, and backfills
// btm_challenges for any date missing a row (as far back as the day's CSV
// is still retained in Storage). Replaces the previous "client-triggered,
// today-only" resolution (POST /api/beat-model/resolve, hardcoded to
// today's date) with a real job a scheduler can call for any date, not
// just the one the browser happens to be open on.
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

  const result = { checked: 0, resolved: 0, backfilled_challenges: 0, still_pending: [], errors: [] };

  let unresolved, allPicks;
  try {
    [unresolved, allPicks] = await Promise.all([
      sb('btm_picks?resolved=eq.false&select=clerk_id,comp_date,horse_name'),
      // Backfilling btm_challenges is scoped to every pick's date, not just
      // unresolved ones -- an already-resolved row (won/lost via the old
      // client-only resolve path) can still be missing its RACE/WINNER data
      // if it resolved before this fix existed, same root cause as the
      // still-unresolved rows.
      sb('btm_picks?select=comp_date'),
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch btm_picks: ${err.message}` }, { status: 502 });
  }
  result.checked = unresolved.length;

  const dates = [...new Set(allPicks.map(p => p.comp_date))];
  const challengeByDate = new Map();
  if (dates.length) {
    const existing = await sb(`btm_challenges?comp_date=in.(${dates.join(',')})&select=comp_date,venue,race_num`);
    for (const c of existing) challengeByDate.set(c.comp_date, c);
  }

  for (const compDate of dates) {
    if (!challengeByDate.has(compDate)) {
      try {
        const backfilled = await backfillChallenge(compDate);
        if (backfilled) {
          challengeByDate.set(compDate, backfilled);
          result.backfilled_challenges++;
        }
      } catch (err) {
        result.errors.push(`${compDate}: backfill failed -- ${err.message}`);
      }
    }
  }

  for (const pick of unresolved) {
    const challenge = challengeByDate.get(pick.comp_date);
    if (!challenge) {
      result.still_pending.push({ comp_date: pick.comp_date, reason: 'no challenge (CSV no longer retained or no qualifying race)' });
      continue;
    }
    let winnerRow;
    try {
      winnerRow = await sb(
        `race_results?date=eq.${pick.comp_date}&venue=eq.${encodeURIComponent(normaliseVenue(challenge.venue))}&race_num=eq.${challenge.race_num}&finish_pos=eq.1&select=horse_name&limit=1`,
      );
    } catch (err) {
      result.errors.push(`${pick.comp_date}/${pick.clerk_id}: race_results lookup failed -- ${err.message}`);
      continue;
    }
    if (!winnerRow.length) {
      result.still_pending.push({ comp_date: pick.comp_date, reason: 'race not resulted yet' });
      continue;
    }
    const won = winnerRow[0].horse_name.toLowerCase() === pick.horse_name.toLowerCase();
    const r = await fetch(
      `${SURL}/rest/v1/btm_picks?clerk_id=eq.${encodeURIComponent(pick.clerk_id)}&comp_date=eq.${pick.comp_date}&resolved=eq.false`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ resolved: true, won }),
      },
    );
    if (!r.ok) {
      result.errors.push(`${pick.comp_date}/${pick.clerk_id}: resolve PATCH failed -- ${r.status}`);
      continue;
    }
    const updatedRows = await r.json();
    if (Array.isArray(updatedRows) && updatedRows.length) {
      result.resolved++;
      if (won) await awardPoints(pick.clerk_id, 'beat_model_correct').catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
