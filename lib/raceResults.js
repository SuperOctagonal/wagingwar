// Shared race_results lookup -- joins by date-scoped, venue-normalised,
// name-normalised key, the same shape used throughout the app to match
// race_cards/live data against final results (the WW-matrix calibration
// investigation's historical join, and originally built inline for the
// Value Bets tab's Result/Margin/SP columns). Extracted here so Movers
// (and any future tab) reuses the exact same join instead of a second
// copy.

import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
export async function fetchResultsByRunner(date) {
  if (!SURL || !SKEY) return {};
  try {
    const res = await fetch(
      `${SURL}/rest/v1/race_results?date=eq.${date}&select=venue,race_num,horse_name,finish_pos,margin,sp`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!res.ok) return {};
    const rows = await res.json();
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
