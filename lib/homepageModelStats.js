import { unstable_cache } from 'next/cache';
import { singleFlight } from '@/lib/singleFlight.mjs';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { filterAuMeetings } from '@/lib/venues';
import { computeRanksForDate } from '@/lib/resultsRanks';
import { groupResultsByDateRace, buildRank1Records, summarizeRank1Records } from '@/lib/modelSummary';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Public data, but called from a server component (app/page.js) -- service
// key for consistency with the rest of the server data layer.
const SKEY = process.env.SUPABASE_SERVICE_KEY;

const WINDOW_DAYS = 30;
const CHUNK_SIZE = 5; // same concurrency cap as fetchRankDataForDates (ResultsPageClient.js) -- avoids holding many days of race_cards JSON in memory at once

// Model's top-rated-runner (rank 1) record over the last 30 completed AU
// racing days, reusing the exact same computation the Results page's Daily
// Model Summary uses (lib/resultsRanks.js's computeRanksForDate for the
// server-side scoring/ranks, lib/modelSummary.js's buildRank1Records/
// summarizeRank1Records for turning that into a win/top-3 record) -- no
// separate implementation of "did the model's top pick win" here.
async function fetchHomepageModelStatsUncached() {
  if (!SURL || !SKEY) return null;

  const todayAEST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 75); // wide buffer so 30 distinct racing days are found even across quiet weeks
  const startDate = lookbackStart.toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });

  try {
    const result = await fetchAllRows(
      `${SURL}/rest/v1/race_results?select=date,venue,race_num,finish_pos,horse_name,sp,track_cond,dist&date=gte.${startDate}&date=lte.${todayAEST}&order=date,venue,race_num,finish_pos`,
      { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    );
    if (!result.ok) return null;

    const rows = filterAuMeetings(result.rows);
    const distinctDates = [...new Set(rows.map(r => r.date))].sort().reverse();
    const targetDates = distinctDates.slice(0, WINDOW_DAYS);
    if (!targetDates.length) return null;

    const rankDataByDate = {};
    for (let i = 0; i < targetDates.length; i += CHUNK_SIZE) {
      const chunk = targetDates.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(chunk.map(async d => {
        try { return [d, await computeRanksForDate(d)]; }
        catch { return [d, null]; }
      }));
      chunkResults.forEach(([d, data]) => { rankDataByDate[d] = data || {}; });
    }

    let allRecords = [];
    targetDates.forEach(d => {
      const dayRows = rows.filter(r => r.date === d);
      const dayGrouped = groupResultsByDateRace(dayRows);
      allRecords = allRecords.concat(buildRank1Records(dayGrouped, rankDataByDate[d] || {}));
    });

    const summary = summarizeRank1Records(allRecords);
    if (!summary) return null;

    return {
      ...summary,
      days: targetDates.length,
      dateFrom: targetDates[targetDates.length - 1],
      dateTo: targetDates[0],
    };
  } catch {
    return null;
  }
}

// Revalidates hourly so the homepage never hits the database on every
// visit -- a genuine query failure falls through to the uncached function
// returning null, which the homepage treats as "hide the numbers", never
// as a reason to show a stale or fabricated figure.
//
// singleFlight: unstable_cache doesn't merge simultaneous misses, so when
// the hour expires, / and each ad landing variant regenerating together
// would each run this ~100 MB+ computation at once. Concurrent misses now
// share one run. (What it computes is unchanged.)
export const getHomepageModelStats = unstable_cache(
  singleFlight(fetchHomepageModelStatsUncached),
  ['homepage-model-stats-v1'],
  { revalidate: 3600 },
);
