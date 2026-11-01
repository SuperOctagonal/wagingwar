import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { aestDay } from '@/lib/aestDay';
import { createTtlCache } from '@/lib/ttlCache.mjs';
import { singleFlight } from '@/lib/singleFlight.mjs';
import { withTimeout } from '@/lib/withTimeout.mjs';
import { matchSubscriptions, nextBillingIso, PAST_DUE_STATUSES } from '@/lib/stripeSubscriptions.mjs';

// Clerk users + Stripe subscriptions -> one row per user with their current
// plan status. Shared by the admin dashboard's Subscribers table, Sign-ups
// panel and KPI strip (and later the Ads panel) so the status logic lives
// in one place. Callers must already have checked isSiteAdmin().

export const PLAN_STATUSES = ['FREE', 'TRIAL', 'PRO', 'CANCELLED', 'PAST_DUE'];
// Used for every row when Stripe can't be read (no key in this environment,
// or the API call failed) -- never guessed as FREE.
export const UNKNOWN_STATUS = 'UNKNOWN';

// Safety cap on paging (100 per page) so a runaway upstream can't loop
// forever. Hitting it is reported (capWarnings), never silent.
const MAX_PAGES = 50;
const PAGE_SIZE = 100;
// Each source gets its own limit, so a slow one degrades its own figures
// instead of hanging the page.
const CLERK_TIMEOUT_MS = 20_000;
const STRIPE_TIMEOUT_MS = 20_000;
// Whole result shared for a minute (every panel and admin tab reads it).
const CACHE_TTL_MS = 60_000;

// Clerk API errors usually have an empty .message; the detail is in
// err.errors[] and the HTTP status in err.status.
function clerkErrorText(err) {
  const detail = err?.errors?.map(e => e.longMessage || e.message).filter(Boolean).join('; ');
  const text = detail || err?.message || 'unknown error';
  return err?.status ? `HTTP ${err.status}: ${text}` : text;
}

async function fetchAllClerkUsers(clerk) {
  const users = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await clerk.users.getUserList({ limit: PAGE_SIZE, offset });
    users.push(...data);
    if (data.length < PAGE_SIZE) return { users, truncated: false };
    offset += PAGE_SIZE;
  }
  return { users, truncated: true };
}

async function fetchAllStripeSubscriptions(stripe) {
  const subs = [];
  let startingAfter;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: PAGE_SIZE,
      starting_after: startingAfter,
      expand: ['data.customer'],
    });
    subs.push(...result.data);
    if (!result.has_more) return { subs, truncated: false };
    startingAfter = result.data[result.data.length - 1].id;
  }
  return { subs, truncated: true };
}

// Returns { rows, mrr, clerkError, stripeError, unmatchedSubscriptions,
// capWarnings }. rows: one per Clerk user. mrr: Pro monthly recurring
// revenue in A$ from *active* (not trialing) subscriptions -- annual plans
// counted at 1/12. List price x quantity; coupons/discounts aren't applied.
// Non-AUD subscriptions are counted separately, never converted.
// Never throws:
//   - Clerk unreadable: rows is [], clerkError says why.
//   - Stripe unreadable: every row's status is UNKNOWN, mrr is null and
//     stripeError says why.
//   - unmatchedSubscriptions: { total, active } Stripe subscriptions no
//     Clerk user matched (null when either side couldn't be read).
async function getSubscriberDataUncached() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  let clerkError = null;
  let stripeError = stripeKey ? null : 'Stripe is not configured in this environment.';
  const clerkPromise = withTimeout(clerkClient().then(fetchAllClerkUsers), CLERK_TIMEOUT_MS, 'Clerk')
    .catch((err) => { clerkError = `Clerk request failed: ${clerkErrorText(err)}`; return null; });
  const stripePromise = stripeKey
    ? withTimeout(fetchAllStripeSubscriptions(new Stripe(stripeKey)), STRIPE_TIMEOUT_MS, 'Stripe')
        .catch((err) => { stripeError = `Stripe request failed: ${err.message}`; return null; })
    : Promise.resolve(null);

  const [clerkRes, stripeRes] = await Promise.all([clerkPromise, stripePromise]);
  const users = clerkRes?.users || [];
  const subscriptions = stripeRes?.subs || null;
  const cap = (MAX_PAGES * PAGE_SIZE).toLocaleString('en-AU');
  const capWarnings = [];
  if (clerkRes?.truncated) capWarnings.push(`Clerk: only the first ${cap} users were read, so user counts are incomplete.`);
  if (stripeRes?.truncated) capWarnings.push(`Stripe: only the first ${cap} subscriptions were read, so plan counts are incomplete.`);

  const { subByUserId, unmatched } = matchSubscriptions(
    users.map(u => ({
      id: u.id,
      stripeCustomerId: u.publicMetadata?.stripeCustomerId || null,
      email: u.emailAddresses?.[0]?.emailAddress || null,
    })),
    subscriptions || [],
  );

  let mrrCents = 0;
  let mrrNonAud = 0;
  const rows = users.map(u => {
    const sub = subByUserId.get(u.id);
    let status = subscriptions ? 'FREE' : UNKNOWN_STATUS;
    let trialEnd = null;
    let nextBilling = null;

    if (sub) {
      if (sub.status === 'trialing') {
        status = 'TRIAL';
        trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
      } else if (sub.status === 'active') {
        status = 'PRO';
        nextBilling = nextBillingIso(sub);
      } else if (PAST_DUE_STATUSES.has(sub.status)) {
        status = 'PAST_DUE';
      } else if (sub.status === 'canceled') {
        status = 'CANCELLED';
      }
    }

    // Billing interval read directly off the subscription object already
    // fetched above (Stripe includes items.data[].price.recurring by
    // default, no extra expand or per-customer call needed) — not from
    // /api/admin/subscriber-billing, which only handles Last Payment (the
    // one thing that genuinely needs a per-customer Stripe call, since
    // there's no bulk "latest invoice per customer" endpoint).
    const item = sub?.items?.data?.[0];
    const billingInterval = item?.price?.recurring?.interval || null;
    const stripeCustomerId = u.publicMetadata?.stripeCustomerId || null;

    if (status === 'PRO' && item?.price?.unit_amount != null) {
      const perMonth = item.price.unit_amount * (item.quantity || 1) / (billingInterval === 'year' ? 12 : 1);
      if ((item.price.currency || '').toLowerCase() === 'aud') mrrCents += perMonth;
      else mrrNonAud++;
    }

    return {
      id: u.id,
      email: u.emailAddresses?.[0]?.emailAddress || '—',
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || '—',
      signupDate: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      status,
      trialEnd,
      nextBilling,
      billingInterval,
      stripeCustomerId,
    };
  });

  return {
    rows,
    mrr: subscriptions && !clerkError ? { aud: Math.round(mrrCents) / 100, nonAudSubscriptions: mrrNonAud } : null,
    clerkError,
    stripeError,
    unmatchedSubscriptions: subscriptions && !clerkError ? unmatched : null,
    capWarnings,
  };
}

// Cached for a minute, one build at a time (ttlCache + singleFlight). A
// result with a Clerk or Stripe failure isn't cached, so the next load
// retries; "Stripe is not configured" is a fixed state, so that one is.
const cache = createTtlCache({ ttlMs: CACHE_TTL_MS, max: 1 });
const buildOnce = singleFlight(getSubscriberDataUncached);

export async function getSubscriberData() {
  const hit = cache.get('all');
  if (hit) return hit;
  const data = await buildOnce();
  if (!data.clerkError && (!data.stripeError || !process.env.STRIPE_SECRET_KEY)) cache.set('all', data);
  return data;
}

// Sign-ups per AEST day for the last `days` days (oldest first, every day
// present even with zero), split by each user's CURRENT plan status.
export function signupsByDay(rows, days = 90) {
  const today = aestDay();
  const series = [];
  const index = new Map();
  const base = new Date(`${today}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const point = { date: key, FREE: 0, TRIAL: 0, PRO: 0, CANCELLED: 0, PAST_DUE: 0, [UNKNOWN_STATUS]: 0, total: 0 };
    index.set(key, point);
    series.push(point);
  }
  for (const r of rows) {
    if (!r.signupDate) continue;
    const point = index.get(aestDay(r.signupDate));
    if (!point) continue;
    point[r.status]++;
    point.total++;
  }
  return series;
}
