import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { isSiteAdmin } from '@/lib/admin';

// Per-customer, 5-minute cache — this route is called from the client
// (SubscribersTable) on every page view, and Stripe has no bulk "latest
// invoice per customer" endpoint, so without this every view of the
// admin page would re-fire one invoices.list call per subscriber. Keyed
// per-customer (not one blob for the whole request) so a new signup
// doesn't force re-fetching everyone else's still-fresh data. Lives on
// the module — this app runs as a persistent Node process (Render), so
// this genuinely persists across requests; it resets on redeploy, which
// is fine for an internal tool.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // customerId -> { data, expiresAt }

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

export async function GET(req) {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const customerIds = [...new Set((searchParams.get('customerIds') || '').split(',').filter(Boolean))];

  const now = Date.now();
  const stale = customerIds.filter(id => {
    const entry = cache.get(id);
    return !entry || entry.expiresAt <= now;
  });

  if (stale.length) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const fetched = await Promise.all(stale.map(async (id) => {
      try {
        return [id, await fetchLastPayment(stripe, id)];
      } catch {
        return [id, null];
      }
    }));
    for (const [id, data] of fetched) {
      cache.set(id, { data, expiresAt: now + CACHE_TTL_MS });
    }
  }

  const result = {};
  for (const id of customerIds) {
    result[id] = cache.get(id)?.data ?? null;
  }

  return NextResponse.json(result);
}
