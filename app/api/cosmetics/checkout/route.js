import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// POST { item_ids: string[] } -- charges a whole basket in one atomic
// transaction via the checkout_cosmetics_basket Postgres function (see the
// batch-1 DDL). All-or-nothing: if the total cost exceeds balance, nothing
// is charged and the response reports exactly how much more is needed.
// Already-owned items in the basket are silently skipped (not double-
// charged) -- same idempotency stance as the single-item /unlock route.
//
// This exists alongside /api/cosmetics/unlock (not replacing it) --
// /unlock's single-item path has no atomicity requirement to begin with
// (nothing else can be "partially" unlocked), so it stays on the simpler
// spendCredits path. Basket checkout is the one case that actually needs a
// DB-level transaction, since spendCredits called N times in a loop cannot
// guarantee all-or-nothing across N items (see the plan notes -- spendCredits
// is read-then-write with no row lock, so a mid-basket failure or a
// concurrent request could leave a partial charge with no rollback).
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { item_ids: itemIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(itemIds) || !itemIds.length || !itemIds.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Missing or invalid item_ids' }, { status: 400 });
  }

  const r = await fetch(`${SURL}/rest/v1/rpc/checkout_cosmetics_basket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    body: JSON.stringify({ p_clerk_id: userId, p_item_ids: itemIds }),
  });
  if (!r.ok) {
    console.error('[cosmetics/checkout] RPC error:', r.status, await r.text().catch(() => ''));
    return NextResponse.json({ error: 'Checkout failed' }, { status: 502 });
  }

  const rows = await r.json();
  // RPC output columns are out_-prefixed (out_ok, out_balance, out_needed,
  // out_shortfall, out_unlocked) -- RETURNS TABLE(balance integer, ...)
  // implicitly declares "balance" as a PL/pgSQL variable inside the
  // function body, which collided with user_credits.balance in the UPDATE
  // statement (ambiguous column reference, confirmed live). Prefixing
  // avoided the collision at the source rather than working around it with
  // qualification inside the function.
  const result = rows?.[0];
  if (!result) return NextResponse.json({ error: 'Checkout failed' }, { status: 502 });

  if (!result.out_ok) {
    return NextResponse.json({
      error: `Insufficient credits — need ${result.out_needed.toLocaleString()}, short by ${result.out_shortfall.toLocaleString()}`,
      balance: result.out_balance,
      needed: result.out_needed,
      shortfall: result.out_shortfall,
    }, { status: 402 });
  }

  return NextResponse.json({ ok: true, balance: result.out_balance, unlocked: result.out_unlocked || [] });
}
