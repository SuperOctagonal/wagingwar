import { normaliseVenue } from '@/lib/venues';
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Regenerate at most once an hour rather than on every crawl request —
// this makes a live Supabase call.
export const revalidate = 3600;

export default async function sitemap() {
  const baseUrl = 'https://wagingwar.com.au';

  const routes = [
    '',
    '/races',
    '/results',
    '/mybets',
    '/competitions',
    '/blackbook',
    '/community',
    '/how-it-works',
    '/faq',
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
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceISO = since.toLocaleDateString('sv-SE');
    const result = await fetchAllRows(
      `${SURL}/rest/v1/race_schedule?select=date,venue&date=gte.${sinceISO}`,
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
