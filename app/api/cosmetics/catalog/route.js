import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// GET: the full active cosmetic catalog -- not Pro-gated (cosmetics spend
// credits, which free users already earn, same free-tier-accessible
// principle as the rest of the Games system). Still login-required, same
// as every other app/api/games/* and app/api/beat-model/* route, rather
// than being a fully open unauthenticated endpoint.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const r = await fetch(
    `${SURL}/rest/v1/cosmetic_items?active=eq.true&select=id,category,name,tier,credit_cost,style&order=category,tier,credit_cost`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
  );
  if (!r.ok) {
    console.error('[cosmetics/catalog] Supabase error:', r.status, await r.text().catch(() => ''));
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 502 });
  }
  const items = await r.json();
  return NextResponse.json({ items });
}
