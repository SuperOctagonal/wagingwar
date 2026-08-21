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

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
export async function fetchUserBetData(clerkId, { start, end } = {}) {
  if (!SURL || !SKEY || !clerkId) return { ok: false, bets: [] };
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  let url = `${SURL}/rest/v1/bet_log?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*`;
  if (start) url += `&date=gte.${start}`;
  if (end) url += `&date=lte.${end}`;

  const betsResult = await fetchAllRows(url, headers);
  if (!betsResult.ok) return { ok: false, bets: [] };
  const bets = betsResult.rows;
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
