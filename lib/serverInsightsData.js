// Shared server-side data layer for /api/insights/* routes. Fetches one
// user's own bet_log rows for a date window plus the race_results rows
// needed for closing-line SP (CLV), server-side only (service key) --
// mirrors the role lib/serverResultsData.js plays for the Results page
// routes, adapted to Insights' shape: unlike Results, every Insights
// section reads from the same base dataset (this user's settled bets +
// the closing SP for each), so one shared fetch feeds all of them rather
// than each route doing its own join.
import { normaliseVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { ODDS_BANDS as ODDS_BANDS_LIST } from '@/lib/oddsBucket';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Same bands BetFilterPanel's Odds/Stake band filters and the (now-retired)
// /api/insights/filtered-bets route used -- this is that route's filtering
// logic, moved here so every Insights section (summary + ai-summary, both
// via computeInsightsSummary -> fetchUserBetData) applies the exact same
// BetFilterPanel filters instead of only the bet-log fetch the old
// client-side page used them for.
const ODDS_BANDS = Object.fromEntries(ODDS_BANDS_LIST.map(b => [b.key, [b.lo, b.hi]]));
const STAKE_BANDS = { under5: [0, 5], '5-10': [5, 10], '10-20': [10, 20], '20-50': [20, 50], '50plus': [50, null] };
const DOW_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function normHorseName(n) {
  return (n || '').toUpperCase().replace(/\s*\([A-Z]+\)\s*$/i, '').replace(/[^A-Z0-9]/g, '');
}

// Returns { ok, bets } where each bet is the raw bet_log row plus a `closeSp`
// field (the SPECIFIC horse's closing SP, joined from race_results by
// date+venue+race_num+horse_name — race_results.sp is the confirmed source,
// per explicit decision not to switch to bet_log.sp (which has gaps for bets
// settled before that column was written). The join key includes horse_name
// deliberately: a first attempt keyed only on date+venue+race_num and
// silently returned whichever horse's row the API happened to return last
// for that race (every other runner overwrote the same map entry) --
// confirmed live (Seymour R9 2026-07-19: a bet on "OUR JUSTIFY", SP $2.20,
// was being matched against "HAWK POWER"'s $26 instead). Caught during
// batch-1 verification, fixed here before this ever shipped.
export async function fetchUserBetData(clerkId, { start, end, filters = {} } = {}) {
  if (!SURL || !SKEY || !clerkId) return { ok: false, bets: [] };
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  let url = `${SURL}/rest/v1/bet_log?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*`;
  if (start) url += `&date=gte.${start}`;
  if (end) url += `&date=lte.${end}`;

  const { condition, rank, betType, bookmaker, state, result, oddsBand, stakeBand, venue, dow, distance, raceClass } = filters;
  if (condition) url += `&track_condition=eq.${encodeURIComponent(condition)}`;
  if (rank)      url += `&rank=eq.${encodeURIComponent(rank)}`;
  if (betType)   url += `&bet_type=eq.${encodeURIComponent(betType)}`;
  if (bookmaker) url += `&bookmaker=eq.${encodeURIComponent(bookmaker)}`;
  if (state)     url += `&state=eq.${encodeURIComponent(state)}`;
  if (result)    url += `&status=eq.${encodeURIComponent(result)}`;
  if (oddsBand && ODDS_BANDS[oddsBand]) {
    const [lo, hi] = ODDS_BANDS[oddsBand];
    url += `&odds=gte.${lo}`;
    if (hi != null) url += `&odds=lt.${hi}`;
  }
  if (stakeBand && STAKE_BANDS[stakeBand]) {
    const [lo, hi] = STAKE_BANDS[stakeBand];
    url += `&stake=gte.${lo}`;
    if (hi != null) url += `&stake=lt.${hi}`;
  }

  const betsResult = await fetchAllRows(url, headers);
  if (!betsResult.ok) return { ok: false, bets: [] };
  let bets = betsResult.rows;

  // venue/dow: post-fetch pass, same reasons /api/insights/filtered-bets
  // originally had -- venue needs normaliseVenue() (raw strings fragment
  // across the same physical track), and there's no PostgREST day-of-week
  // operator on a plain date column.
  if (venue) {
    bets = bets.filter(b => normaliseVenue(b.venue || b.track || '') === venue);
  }
  if (dow) {
    const target = DOW_MAP[dow.toLowerCase()];
    if (target != null) bets = bets.filter(b => b.date && new Date(`${b.date}T12:00:00Z`).getUTCDay() === target);
  }

  // distance/raceClass: need a race_results join on (date, normalised
  // venue, race number) -- bet_log.race_num is NULL on every row in
  // production (confirmed against live data); race_number is the column
  // that's actually populated.
  if (distance || raceClass) {
    const rrParams = ['select=date,venue,race_num'];
    if (distance)  rrParams.push(`dist=eq.${encodeURIComponent(distance)}`);
    if (raceClass) rrParams.push(`class=eq.${encodeURIComponent(raceClass)}`);
    const rrRes = await fetch(`${SURL}/rest/v1/race_results?${rrParams.join('&')}&limit=10000`, { headers });
    const rrRows = rrRes.ok ? await rrRes.json() : [];
    const allowedRaceKeys = new Set(rrRows.map(r => `${r.date}||${normaliseVenue(r.venue || '')}||${r.race_num}`));
    bets = bets.filter(b => {
      const raceNum = b.race_number ?? b.race_num;
      if (!b.date || !raceNum) return false;
      return allowedRaceKeys.has(`${b.date}||${normaliseVenue(b.venue || b.track || '')}||${raceNum}`);
    });
  }

  if (!bets.length) return { ok: true, bets: [] };

  const dates = [...new Set(bets.map(b => b.date).filter(Boolean))];
  if (!dates.length) return { ok: true, bets };

  const resultsResult = await fetchAllRows(
    `${SURL}/rest/v1/race_results?select=date,venue,race_num,horse_name,sp&date=in.(${dates.join(',')})`,
    headers,
  );
  const spMap = {}; // `${date}||${normVenue}||${race_num}||${normHorse}` -> sp
  if (resultsResult.ok) {
    resultsResult.rows.forEach(r => {
      if (!r.sp || +r.sp <= 0) return;
      const key = `${r.date}||${normaliseVenue(r.venue || '')}||${r.race_num}||${normHorseName(r.horse_name)}`;
      spMap[key] = +r.sp;
    });
  }

  const withSp = bets.map(b => {
    const raceNum = b.race_number ?? b.race_num;
    const key = `${b.date}||${normaliseVenue(b.track || b.venue || '')}||${raceNum}||${normHorseName(b.horse_name)}`;
    return { ...b, closeSp: spMap[key] ?? null };
  });

  return { ok: true, bets: withSp };
}

// Same 12 filter keys BetFilterPanel sends (see components/BetFilterPanel.js
// and the now-thin /api/insights/filtered-bets route) -- shared here so
// every route that accepts these query params does it identically.
const FILTER_PARAM_KEYS = ['condition', 'rank', 'betType', 'bookmaker', 'state', 'result', 'oddsBand', 'stakeBand', 'venue', 'dow', 'distance', 'raceClass'];

export function parseFilterParams(searchParams) {
  const filters = {};
  for (const key of FILTER_PARAM_KEYS) {
    const v = searchParams.get(key);
    if (v) filters[key] = v;
  }
  return filters;
}
