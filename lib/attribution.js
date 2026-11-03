import { LANDING_VARIANTS } from '@/lib/landingVariants';
import { adKeys } from '@/lib/adKeys.mjs';

// Ad attribution helpers shared by the browser capture
// (components/AttributionCapture.js), the API routes that write
// ad_landings / signup_attribution, and the admin Ads panel -- so UTM
// cleaning and ad bucketing live in one place. No server- or client-only
// imports: safe on both sides.

// localStorage key for the first-touch UTMs. Only ever written after the
// visitor accepted cookies (lib/analytics.js consent), removed on decline.
export const FIRST_TOUCH_KEY = 'ww_first_touch';

// Lowercase, trimmed, only [a-z0-9._~-], max length. Returns null if empty.
export function cleanUtm(value, max = 100) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/[^a-z0-9._~-]/g, '').slice(0, max);
  return v || null;
}

// Path only (no query string), max 200 chars.
export function cleanPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  return value.split('?')[0].split('#')[0].slice(0, 200) || null;
}

// { utm_source, utm_campaign, utm_content } from a URL query string, or
// null if none of the three is present.
export function readUtm(search) {
  const q = new URLSearchParams(search || '');
  const utm = {
    utm_source: cleanUtm(q.get('utm_source')),
    utm_campaign: cleanUtm(q.get('utm_campaign')),
    utm_content: cleanUtm(q.get('utm_content')),
  };
  return utm.utm_source || utm.utm_campaign || utm.utm_content ? utm : null;
}

// Every ad in the panel's data (landings, sign-up attribution, spend):
// landing-page variants first, then any other utm_content A-Z, test tags
// left out. Drives both the funnel rows and the spend form's Ad dropdown.
export function panelAds({ landings = [], attribution = {}, spend = [] }) {
  const keys = [...landings.map(l => l.utm_content), ...Object.values(attribution), ...spend.map(s => s.utm_content)].map(v => cleanUtm(v));
  return adKeys(keys, Object.keys(LANDING_VARIANTS));
}

// Per-ad funnel for a date range (inclusive YYYY-MM-DD, AEST days), one
// row per panelAds() entry; test tags (lib/adKeys.mjs) count nowhere, not
// even as unattributed.
//   landings / spend: by their own date; sign-ups: by Clerk sign-up day;
//   trials / paid: those sign-ups whose CURRENT status is TRIAL / PRO.
// Returns { rows: [{ bucket, landings, signups, trials, paid, spend,
// costPerSignup }], total, unattributed } -- costPerSignup null when there
// are no sign-ups or the net spend is zero or less (credits); spend null
// when no spend was entered for that ad.
export function summarizeAds({ landings, attribution, users, spend, from, to, dayOf }) {
  const inRange = d => d && (!from || d >= from) && (!to || d <= to);
  const blank = bucket => ({ bucket, landings: 0, signups: 0, trials: 0, paid: 0, spend: null });
  const out = Object.fromEntries(panelAds({ landings, attribution, spend }).map(b => [b, blank(b)]));
  const total = blank('total');
  let unattributed = 0;

  for (const l of landings) {
    const b = cleanUtm(l.utm_content);
    if (!out[b] || !inRange(l.date)) continue;
    out[b].landings += l.n; total.landings += l.n;
  }
  for (const u of users) {
    if (!inRange(u.signupDate ? dayOf(u.signupDate) : null)) continue;
    const b = cleanUtm(attribution[u.id]);
    if (!b) { unattributed++; continue; }
    if (!out[b]) continue; // test tag
    for (const t of [out[b], total]) {
      t.signups++;
      if (u.status === 'TRIAL') t.trials++;
      if (u.status === 'PRO') t.paid++;
    }
  }
  for (const s of spend) {
    const b = cleanUtm(s.utm_content);
    if (!out[b] || !inRange(s.date)) continue;
    out[b].spend = (out[b].spend || 0) + s.amount_aud;
    total.spend = (total.spend || 0) + s.amount_aud;
  }
  const withCost = r => ({ ...r, spend: r.spend == null ? null : Math.round(r.spend * 100) / 100, costPerSignup: r.spend != null && r.spend > 0 && r.signups ? Math.round((r.spend / r.signups) * 100) / 100 : null });
  return { rows: Object.values(out).map(withCost), total: withCost(total), unattributed };
}
