// Shared race_results lookup -- joins by date-scoped, venue-normalised,
// name-normalised key, the same shape used throughout the app to match
// race_cards/live data against final results (the WW-matrix calibration
// investigation's historical join, and originally built inline for the
// Value Bets tab's Result/Margin/SP columns). Extracted here so Movers
// (and any future tab) reuses the exact same join instead of a second
// copy.

import { normaliseVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// race_results is public read data, but every caller here is server-side
// -- service key for consistency with the rest of the server data layer.
const SKEY = process.env.SUPABASE_SERVICE_KEY;

export function normResultName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function resultKey(venue, raceNum, horseName) {
  return `${normaliseVenue(venue)}||${raceNum}||${normResultName(horseName)}`;
}

// { [resultKey]: { finishPos, margin, sp } } for every runner with a
// logged result today. Populated once a race has actually run -- a bet/
// mover with no matching entry here just renders blank, it never blocks
// the row from appearing.
//
// fetchAllRows, ordered by the table's unique key so pages are stable: a
// Saturday is routinely 1,100-1,400 result rows, and a single fetch stopped
// at PostgREST's 1,000-row cap, leaving later results blank.
export async function fetchResultsByRunner(date) {
  if (!SURL || !SKEY) return {};
  try {
    const { ok, rows } = await fetchAllRows(
      `${SURL}/rest/v1/race_results?date=eq.${date}&select=venue,race_num,horse_name,finish_pos,margin,sp&order=venue,race_num,horse_name`,
      { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    );
    if (!ok) return {};
    const map = {};
    rows.forEach(r => {
      map[resultKey(r.venue, r.race_num, r.horse_name)] = {
        finishPos: r.finish_pos ?? null,
        margin: r.margin ?? null,
        sp: r.sp ?? null,
      };
    });
    return map;
  } catch {
    return {};
  }
}
