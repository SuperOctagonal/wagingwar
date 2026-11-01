import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { isSiteAdmin } from '@/lib/admin';
import { createTtlCache } from '@/lib/ttlCache.mjs';

// Per-customer, 5-minute cache — this route is called from the client
// (SubscribersTable) on every page view, and Stripe has no bulk "latest
// invoice per customer" endpoint, so without this every view of the
// admin page would re-fire one invoices.list call per subscriber. Keyed
// per-customer (not one blob for the whole request) so a new signup
// doesn't force re-fetching everyone else's still-fresh data. Lives on
// the module — this app runs as a persistent Node process (Render), so
// this genuinely persists across requests; it resets on redeploy, which
// is fine for an internal tool. Bounded (ttlCache) so it can't grow
// without limit.
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CUSTOMERS = 5000;
const cache = createTtlCache({ ttlMs: CACHE_TTL_MS, max: MAX_CUSTOMERS }); // customerId -> data | null
// Stripe calls in flight at once, to stay well inside its rate limit.
const BATCH_SIZE = 10;

// Deliberately no expand here — Invoice.charge is a deprecated field on
// recent Stripe API versions (this SDK is v22) and expanding it risks a
// hard API error on every lookup for the sake of a refund distinction
// invoice.status can't reliably give without it. invoice.status itself
// (paid/open/void/uncollectible) is a stable, always-present field and
// covers the actual ask (green "Succeeded" for paid, matching Stripe's
// own dashboard coloring) without that risk.
async function fetchLastPayment(stripe, customerId) {
  const res = await stripe.invoices.list({ customer: customerId, limit: 1 });
  const invoice = res.data[0];
  if (!invoice) return null;
  return {
    status: invoice.status,
    amountPaid: invoice.amount_paid,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
  };
}

// POST { customerIds: [...] } -> { [customerId]: lastPayment | null }.
// POST so a long list of IDs goes in the body, not the URL.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured in this environment.' }, { status: 503 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const ids = Array.isArray(body?.customerIds) ? body.customerIds : null;
  if (!ids) return NextResponse.json({ error: 'customerIds must be an array.' }, { status: 400 });
  const customerIds = [...new Set(ids.filter(id => typeof id === 'string' && /^cus_[A-Za-z0-9]+$/.test(id)))].slice(0, MAX_CUSTOMERS);

  const stale = customerIds.filter(id => cache.get(id) === undefined);
  if (stale.length) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const fetched = await Promise.all(stale.slice(i, i + BATCH_SIZE).map(async (id) => {
        try {
          return [id, await fetchLastPayment(stripe, id)];
        } catch {
          return [id, null];
        }
      }));
      for (const [id, data] of fetched) cache.set(id, data);
    }
  }

  const result = {};
  for (const id of customerIds) {
    result[id] = cache.get(id) ?? null;
  }

  return NextResponse.json(result);
}
