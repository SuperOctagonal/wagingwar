import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { aestDay } from '@/lib/aestDay';

// Clerk users + Stripe subscriptions -> one row per user with their current
// plan status. Shared by the admin dashboard's Subscribers table, Sign-ups
// panel and KPI strip (and later the Ads panel) so the status logic lives
// in one place. Callers must already have checked isSiteAdmin().

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const PAST_DUE_STATUSES = new Set(['past_due', 'unpaid', 'incomplete']);

export const PLAN_STATUSES = ['FREE', 'TRIAL', 'PRO', 'CANCELLED', 'PAST_DUE'];
// Used for every row when Stripe can't be read (no key in this environment,
// or the API call failed) -- never guessed as FREE.
export const UNKNOWN_STATUS = 'UNKNOWN';

function rankSubscription(sub) {
  if (ACTIVE_STATUSES.has(sub.status)) return 2;
  if (PAST_DUE_STATUSES.has(sub.status)) return 1;
  return 0;
}

async function fetchAllClerkUsers(clerk) {
  const limit = 100;
  const users = [];
  let offset = 0;
  // Safety cap to avoid an unbounded loop if something goes wrong upstream.
  for (let page = 0; page < 50; page++) {
    const { data } = await clerk.users.getUserList({ limit, offset });
    users.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return users;
}

async function fetchAllStripeSubscriptions(stripe) {
  const subs = [];
  let startingAfter;
  for (let page = 0; page < 50; page++) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer'],
    });
    subs.push(...result.data);
    if (!result.has_more) break;
    startingAfter = result.data[result.data.length - 1].id;
  }
  return subs;
}

// Returns { rows, mrr, stripeError }. rows: one per Clerk user. mrr: Pro
// monthly recurring revenue in A$ from *active* (not trialing)
// subscriptions -- annual plans counted at 1/12. List price x quantity;
// coupons/discounts aren't applied. Non-AUD subscriptions are counted
// separately, never converted. If Stripe can't be read, every row's status
// is UNKNOWN, mrr is null and stripeError says why.
export async function getSubscriberData() {
  const clerk = await clerkClient();
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  let stripeError = null;
  const stripePromise = stripeKey
    ? fetchAllStripeSubscriptions(new Stripe(stripeKey)).catch((err) => {
        stripeError = `Stripe request failed: ${err.message}`;
        return null;
      })
    : Promise.resolve(null);
  if (!stripeKey) stripeError = 'Stripe is not configured in this environment.';

  const [users, subscriptions] = await Promise.all([fetchAllClerkUsers(clerk), stripePromise]);

  const byCustomerId = new Map();
  const byEmail = new Map();
  for (const u of users) {
    const customerId = u.publicMetadata?.stripeCustomerId;
    if (customerId) byCustomerId.set(customerId, u);
    const email = u.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    if (email) byEmail.set(email, u);
  }

  // Pick the single most relevant subscription per matched Clerk user
  // (prefer active/trialing, then past_due, then most recently created).
  const subByUserId = new Map();
  for (const sub of subscriptions || []) {
    const customer = sub.customer;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    let user = customerId ? byCustomerId.get(customerId) : null;
    if (!user) {
      const email = (typeof customer === 'string' ? null : customer?.email)?.toLowerCase();
      if (email) user = byEmail.get(email);
    }
    if (!user) continue;

    const existing = subByUserId.get(user.id);
    if (
      !existing ||
      rankSubscription(sub) > rankSubscription(existing) ||
      (rankSubscription(sub) === rankSubscription(existing) && sub.created > existing.created)
    ) {
      subByUserId.set(user.id, sub);
    }
  }

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
        nextBilling = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
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
    mrr: subscriptions ? { aud: Math.round(mrrCents) / 100, nonAudSubscriptions: mrrNonAud } : null,
    stripeError,
  };
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
