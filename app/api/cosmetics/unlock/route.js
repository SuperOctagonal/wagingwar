import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { spendCredits, earnCredits } from '@/lib/credits';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[cosmetics/unlock]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// POST: unlock a cosmetic item -- deducts credits server-side via the
// existing spendCredits primitive (lib/credits.js), which is the only
// place a balance is ever decremented, same as every other credit spend
// in this app. Idempotent: already-owned items return ok without
// re-charging, rather than erroring or double-spending.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { item_id: itemId } = await req.json().catch(() => ({}));
  if (!itemId || typeof itemId !== 'string') {
    return NextResponse.json({ error: 'Missing item_id' }, { status: 400 });
  }

  const items = await sb(`cosmetic_items?id=eq.${encodeURIComponent(itemId)}&active=eq.true&select=id,credit_cost,category`);
  const item = items?.[0];
  if (!item) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });

  const existing = await sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(itemId)}&select=item_id`);
  if (existing && existing.length) {
    return NextResponse.json({ ok: true, alreadyOwned: true, itemId });
  }

  const { ok, spent, balance } = await spendCredits(userId, item.credit_cost, `cosmetic_unlock:${itemId}`);
  if (!ok) {
    return NextResponse.json({ error: 'Insufficient credits', balance }, { status: 402 });
  }

  const inserted = await sb('user_cosmetics', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { clerk_id: userId, item_id: itemId, equipped: false },
  });
  if (inserted === null) {
    // Write failed after the spend already succeeded -- refund rather than
    // leave the user charged for nothing. Rare (Supabase-down-mid-request),
    // but a paid-and-got-nothing state is worse than a rare double log line.
    // earnCredits, not spendCredits -- spendCredits only accepts positive
    // amounts to deduct, it has no "credit back" mode. isPro explicitly
    // false here so this is a flat 1:1 refund, not doubled.
    await earnCredits(userId, item.credit_cost, `cosmetic_unlock_refund:${itemId}`, { isPro: false }).catch(() => {});
    return NextResponse.json({ error: 'Failed to record unlock, refunded' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, alreadyOwned: false, itemId, spent, balance });
}
