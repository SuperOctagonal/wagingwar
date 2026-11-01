import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { aestDay } from '@/lib/aestDay';
import { cleanUtm } from '@/lib/attribution';
import { createTtlCache } from '@/lib/ttlCache.mjs';
import { singleFlight } from '@/lib/singleFlight.mjs';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// ad_landings grows with every ad page load, so only this many AEST days
// are read (the panel's date picker can't go earlier). signup_attribution
// and ad_spend stay whole: one row per sign-up / per day+ad.
export const AD_LANDINGS_DAYS = 120;
const CACHE_TTL_MS = 60_000;

// Raw inputs for the admin Ads panel, read with the service key (callers
// must already have checked isSiteAdmin()). fetchAllRows throughout --
// ad_landings in particular will pass PostgREST's 1,000-row page cap.
//
// Returns { ready, missing, error, landingsFrom, landings, attribution, spend }:
//   landingsFrom: first AEST day landings were read for
//   landings:    [{ date (AEST), utm_content, n }] -- hit counts per day+ad
//   attribution: { [clerk_user_id]: utm_content|null }
//   spend:       [{ date, utm_content, amount_aud }]
// ready=false when the tables can't be read; missing=true only when they
// don't exist yet (migration not applied), not for a passing HTTP error.
async function getAdDataUncached() {
  if (!SURL || !SKEY) return { ready: false, missing: true, error: 'Supabase is not configured in this environment.' };
  const landingsFrom = (() => { const d = new Date(`${aestDay()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (AD_LANDINGS_DAYS - 1)); return d.toISOString().slice(0, 10); })();
  const [landingRes, attrRes, spendRes] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/ad_landings?select=utm_content,created_at&created_at=gte.${landingsFrom}T00:00:00%2B10:00&order=created_at.asc,utm_content.asc`, HEADERS),
    fetchAllRows(`${SURL}/rest/v1/signup_attribution?select=clerk_user_id,utm_content&order=created_at.asc,clerk_user_id.asc`, HEADERS),
    fetchAllRows(`${SURL}/rest/v1/ad_spend?select=date,utm_content,amount_aud&order=date.asc,utm_content.asc`, HEADERS),
  ]);
  const failed = [landingRes, attrRes, spendRes].find(r => !r.ok);
  if (failed) {
    const missing = failed.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(failed.text || '');
    return { ready: false, missing, error: missing ? 'The ad tables don\'t exist yet (migration not applied).' : `Could not read ad tables (HTTP ${failed.status}).` };
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

  return { ready: true, missing: false, error: null, landingsFrom, landings, attribution, spend };
}

// Cached for a minute, one build at a time (ttlCache + singleFlight); a
// failed read isn't cached. Saving spend clears it (invalidateAdData) so
// the form's refresh shows the new amount straight away.
const cache = createTtlCache({ ttlMs: CACHE_TTL_MS, max: 1 });
const buildOnce = singleFlight(getAdDataUncached);

export async function getAdData() {
  const hit = cache.get('all');
  if (hit) return hit;
  const data = await buildOnce();
  if (data.ready) cache.set('all', data);
  return data;
}

export function invalidateAdData() {
  cache.set('all', undefined, 0);
}
