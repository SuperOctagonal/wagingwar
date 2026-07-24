import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Same bands as app/insights/page.js's oddsBucket() — kept in sync manually
// since that function isn't exported; if it changes, update here too.
const ODDS_BANDS = { '2-4': [2, 4], '4-8': [4, 8], '8-15': [8, 15], '15+': [15, null] };
const STAKE_BANDS = { under20: [0, 20], '20-50': [20, 50], '50plus': [50, null] };
const DOW_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// Insights page filter panel — applies filters server-side against bet_log
// (and, for distance/raceClass, a race_results lookup) before the page's
// existing client-side aggregation (hero/CLV/ROI-by-rank/edge-heatmap/etc.,
// all untouched) runs over the result. Returns the same row shape the page's
// direct bet_log?select=* fetch already returns.
//
// venue/dow/distance/raceClass are applied as a post-fetch pass rather than
// a raw PostgREST eq filter:
//  - venue: bet_log's raw venue/track strings fragment across the same
//    physical track (e.g. "CANBERRA ACTON" vs "THOROUGHBRED PARK" — the
//    exact bug class fixed elsewhere in this codebase), so the filter value
//    is a normaliseVenue()'d name and matched via normaliseVenue(row.venue).
//  - dow: no PostgREST day-of-week operator on a plain date column.
//  - distance/raceClass: need a race_results join on (date, normalised
//    venue, race number) — bet_log.race_num is NULL on every row in
//    production (confirmed against live data); race_number is the column
//    that's actually populated, joining to race_results.race_num.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const condition  = searchParams.get('condition');
  const rank       = searchParams.get('rank');
  const betType    = searchParams.get('betType');
  const bookmaker  = searchParams.get('bookmaker');
  const state      = searchParams.get('state');
  const result     = searchParams.get('result');
  const oddsBand   = searchParams.get('oddsBand');
  const stakeBand  = searchParams.get('stakeBand');
  const venue      = searchParams.get('venue');
  const dow        = searchParams.get('dow');
  const distance   = searchParams.get('distance');
  const raceClass  = searchParams.get('raceClass');

  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
  const params = [`clerk_id=eq.${encodeURIComponent(userId)}`, 'select=*'];

  if (condition) params.push(`track_condition=eq.${encodeURIComponent(condition)}`);
  if (rank)      params.push(`rank=eq.${encodeURIComponent(rank)}`);
  if (betType)   params.push(`bet_type=eq.${encodeURIComponent(betType)}`);
  if (bookmaker) params.push(`bookmaker=eq.${encodeURIComponent(bookmaker)}`);
  if (state)     params.push(`state=eq.${encodeURIComponent(state)}`);
  if (result)    params.push(`status=eq.${encodeURIComponent(result)}`);
  if (oddsBand && ODDS_BANDS[oddsBand]) {
    const [lo, hi] = ODDS_BANDS[oddsBand];
    params.push(`odds=gte.${lo}`);
    if (hi != null) params.push(`odds=lt.${hi}`);
  }
  if (stakeBand && STAKE_BANDS[stakeBand]) {
    const [lo, hi] = STAKE_BANDS[stakeBand];
    params.push(`stake=gte.${lo}`);
    if (hi != null) params.push(`stake=lt.${hi}`);
  }

  // Distance / race class: resolve matching (date, venue, race_num) keys from
  // race_results first, then keep only bet_log rows whose (date, normalised
  // venue, race_number) matches one of them.
  let allowedRaceKeys = null;
  if (distance || raceClass) {
    const rrParams = ['select=date,venue,race_num'];
    if (distance)  rrParams.push(`dist=eq.${encodeURIComponent(distance)}`);
    if (raceClass) rrParams.push(`class=eq.${encodeURIComponent(raceClass)}`);
    const rrRes = await fetch(`${SURL}/rest/v1/race_results?${rrParams.join('&')}&limit=10000`, { headers });
    const rrRows = rrRes.ok ? await rrRes.json() : [];
    allowedRaceKeys = new Set(rrRows.map(r => `${r.date}||${normaliseVenue(r.venue || '')}||${r.race_num}`));
  }

  const r = await fetch(`${SURL}/rest/v1/bet_log?${params.join('&')}&order=date.asc,created_at.asc`, { headers });
  if (!r.ok) {
    console.error('[insights/filtered-bets] Supabase error:', r.status, await r.text());
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }
  let rows = await r.json();

  if (venue) {
    rows = rows.filter(b => normaliseVenue(b.venue || b.track || '') === venue);
  }

  if (dow) {
    const target = DOW_MAP[dow.toLowerCase()];
    if (target != null) {
      rows = rows.filter(b => b.date && new Date(`${b.date}T12:00:00Z`).getUTCDay() === target);
    }
  }

  if (allowedRaceKeys) {
    rows = rows.filter(b => {
      const raceNum = b.race_number ?? b.race_num;
      if (!b.date || !raceNum) return false;
      const key = `${b.date}||${normaliseVenue(b.venue || b.track || '')}||${raceNum}`;
      return allowedRaceKeys.has(key);
    });
  }

  return NextResponse.json(rows);
}
