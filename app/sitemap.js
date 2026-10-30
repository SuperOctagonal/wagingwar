import { normaliseVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Public data, but this runs server-side -- service key for consistency.
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Regenerate at most once an hour rather than on every crawl request —
// this makes a live Supabase call.
export const revalidate = 3600;

export default async function sitemap() {
  const baseUrl = 'https://wagingwar.com.au';

  // Publicly viewable pages only -- sign-in-only routes (middleware.js's
  // isProtectedRoute: /races, /mybets, /community, ...) redirect crawlers
  // to /sign-in, so listing them only produced redirect noise.
  const routes = [
    '',
    '/results',
    '/tip-record',
    '/how-it-works',
    '/pricing',
    '/faq',
    '/terms',
    '/privacy',
    '/responsible-gambling',
  ];

  const staticEntries = routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));

  const resultsEntries = await getRecentResultsEntries(baseUrl);

  return [...staticEntries, ...resultsEntries];
}

// One sitemap entry per distinct (date, venue) resulted in the last 30
// days, matching the ?date=&venue= query params app/results/page.js now
// reads on load. race_schedule (one row per race) rather than
// race_results (one row per horse per race) — same date/venue coverage,
// far fewer rows to page through. Uses fetchAllRows since even 30 days of
// race_schedule can exceed PostgREST's default 1000-row response cap —
// the exact silent-truncation bug fixed elsewhere in this codebase.
async function getRecentResultsEntries(baseUrl) {
  if (!SURL || !SKEY) return [];
  try {
    // AEST dates, capped at today: race_schedule also holds upcoming
    // meetings, and future-dated Results URLs have no results to show.
    const tz = { timeZone: 'Australia/Brisbane' };
    const todayISO = new Date().toLocaleDateString('sv-SE', tz);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceISO = since.toLocaleDateString('sv-SE', tz);
    const result = await fetchAllRows(
      `${SURL}/rest/v1/race_schedule?select=date,venue&date=gte.${sinceISO}&date=lte.${todayISO}`,
      { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    );
    if (!result.ok) return [];

    const seen = new Set();
    result.rows.forEach((row) => {
      if (!row.date || !row.venue) return;
      seen.add(`${row.date}||${normaliseVenue(row.venue)}`);
    });

    return [...seen].map((key) => {
      const [date, venue] = key.split('||');
      return {
        url: `${baseUrl}/results?date=${date}&venue=${encodeURIComponent(venue)}`,
        lastModified: new Date(date),
      };
    });
  } catch {
    return [];
  }
}
