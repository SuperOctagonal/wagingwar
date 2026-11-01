// Stripe subscription helpers for the admin dashboard (lib/adminSubscribers.js).
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/stripeSubscriptions.test.mjs).

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const PAST_DUE_STATUSES = new Set(['past_due', 'unpaid', 'incomplete']);

function rankSubscription(sub) {
  if (ACTIVE_STATUSES.has(sub.status)) return 2;
  if (PAST_DUE_STATUSES.has(sub.status)) return 1;
  return 0;
}

// Next billing date (ISO) or null. Since Stripe API 2025-03-31 ("basil";
// this app pins 2026-05-27.dahlia) the billing period lives on each
// subscription item, not the subscription; older versions had it on the
// subscription. Fail safe: anything missing or malformed gives null
// (shown as blank), never a throw.
export function nextBillingIso(sub) {
  try {
    const end = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
    if (!Number.isFinite(end) || end <= 0) return null;
    const d = new Date(end * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

// Match subscriptions to users: by the user's stripeCustomerId, else by the
// Stripe customer's email. One subscription per user -- prefer
// active/trialing, then past_due, then the most recently created.
// users: [{ id, stripeCustomerId, email }].
// Returns { subByUserId: Map, unmatched: { total, active } } -- unmatched
// counts subscriptions no user matched (active = active or trialing).
export function matchSubscriptions(users, subscriptions) {
  const byCustomerId = new Map();
  const byEmail = new Map();
  for (const u of users) {
    if (u.stripeCustomerId) byCustomerId.set(u.stripeCustomerId, u);
    if (u.email) byEmail.set(u.email.toLowerCase(), u);
  }

  const subByUserId = new Map();
  const unmatched = { total: 0, active: 0 };
  for (const sub of subscriptions) {
    const customer = sub.customer;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    let user = customerId ? byCustomerId.get(customerId) : null;
    if (!user) {
      const email = (typeof customer === 'string' ? null : customer?.email)?.toLowerCase();
      if (email) user = byEmail.get(email);
    }
    if (!user) {
      unmatched.total++;
      if (ACTIVE_STATUSES.has(sub.status)) unmatched.active++;
      continue;
    }

    const existing = subByUserId.get(user.id);
    if (
      !existing ||
      rankSubscription(sub) > rankSubscription(existing) ||
      (rankSubscription(sub) === rankSubscription(existing) && sub.created > existing.created)
    ) {
      subByUserId.set(user.id, sub);
    }
  }
  return { subByUserId, unmatched };
}

export { PAST_DUE_STATUSES };
