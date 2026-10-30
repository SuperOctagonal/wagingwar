import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { aestDay } from '@/lib/aestDay';
import { cleanUtm } from '@/lib/attribution';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// Raw inputs for the admin Ads panel, read with the service key (callers
// must already have checked isSiteAdmin()). fetchAllRows throughout --
// ad_landings in particular will pass PostgREST's 1,000-row page cap.
//
// Returns { ready, error, landings, attribution, spend }:
//   landings:    [{ date (AEST), utm_content, n }] -- hit counts per day+ad
//   attribution: { [clerk_user_id]: utm_content|null }
//   spend:       [{ date, utm_content, amount_aud }]
// ready=false when the tables don't exist yet (migration not applied).
export async function getAdData() {
  if (!SURL || !SKEY) return { ready: false, error: 'Supabase is not configured in this environment.' };
  const [landingRes, attrRes, spendRes] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/ad_landings?select=utm_content,created_at&order=created_at.asc`, HEADERS),
    fetchAllRows(`${SURL}/rest/v1/signup_attribution?select=clerk_user_id,utm_content&order=created_at.asc`, HEADERS),
    fetchAllRows(`${SURL}/rest/v1/ad_spend?select=date,utm_content,amount_aud&order=date.asc`, HEADERS),
  ]);
  const failed = [landingRes, attrRes, spendRes].find(r => !r.ok);
  if (failed) {
    const missing = failed.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(failed.text || '');
    return { ready: false, error: missing ? 'The ad tables don\'t exist yet (migration not applied).' : `Could not read ad tables (HTTP ${failed.status}).` };
  }

  const byDayAd = new Map();
  for (const r of landingRes.rows) {
    const key = `${aestDay(r.created_at)}|${cleanUtm(r.utm_content) || ''}`;
    byDayAd.set(key, (byDayAd.get(key) || 0) + 1);
  }
  const landings = [...byDayAd].map(([key, n]) => {
    const [date, utm_content] = key.split('|');
    return { date, utm_content, n };
  });

  const attribution = {};
  for (const r of attrRes.rows) attribution[r.clerk_user_id] = r.utm_content || null;

  const spend = spendRes.rows.map(r => ({ date: r.date, utm_content: r.utm_content, amount_aud: Number(r.amount_aud) }));

  return { ready: true, error: null, landings, attribution, spend };
}
