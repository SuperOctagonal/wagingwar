import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[cosmetics/equip]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// POST { item_id } to equip an owned border/flair, or { item_id: null,
// category } to unequip a category entirely. One active item per category
// -- any other equipped item in the same category is unset first. Badges
// have no equip concept (they just accumulate), so category must resolve
// to 'border' or 'flair'.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const itemId = body.item_id ?? null;
  let category = body.category;

  if (itemId !== null) {
    if (typeof itemId !== 'string') return NextResponse.json({ error: 'Invalid item_id' }, { status: 400 });

    const owned = await sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(itemId)}&select=item_id`);
    if (!owned || !owned.length) return NextResponse.json({ error: 'Item not owned' }, { status: 403 });

    const items = await sb(`cosmetic_items?id=eq.${encodeURIComponent(itemId)}&select=category`);
    category = items?.[0]?.category;
  }

  if (category !== 'border' && category !== 'flair') {
    return NextResponse.json({ error: 'Only border/flair items can be equipped' }, { status: 400 });
  }

  // Unset any other equipped item in this category (join through
  // cosmetic_items since user_cosmetics itself has no category column --
  // PostgREST's embedded-resource filter syntax handles the join).
  await sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&equipped=eq.true&cosmetic_items.category=eq.${category}&select=item_id,cosmetic_items!inner(category)`, {})
    .then(async rows => {
      for (const row of rows || []) {
        if (row.item_id !== itemId) {
          await sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(row.item_id)}`, {
            method: 'PATCH', prefer: 'return=minimal', body: { equipped: false },
          });
        }
      }
    });

  if (itemId !== null) {
    const updated = await sb(`user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(itemId)}`, {
      method: 'PATCH', prefer: 'return=representation', body: { equipped: true },
    });
    if (!updated || !updated.length) return NextResponse.json({ error: 'Failed to equip' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, category, equipped: itemId });
}
