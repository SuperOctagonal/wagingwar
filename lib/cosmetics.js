'use client';

// Shared client-side helper for resolving other users' equipped cosmetics
// (border/flair) in one batched request -- same batching shape as
// lib/displayNames.js's fetchDisplayNames, used by the same call sites
// (Community posts/replies, Competitions/Games leaderboards, ProfileRail).
//
// Unlike display names, this doesn't need to go through a server route:
// equipped cosmetics live entirely in Supabase (not Clerk), and are public
// read data by design (cosmetic_items/user_cosmetics both have an anon
// "public read" RLS policy, no anon write policy -- see the cosmetics DDL).
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Returns { [clerkId]: { border: {id,name,tier,style} | null, flair: {...} | null } }
export async function fetchEquippedCosmetics(clerkIds) {
  const ids = [...new Set((clerkIds || []).filter(Boolean))];
  const empty = {};
  if (!ids.length || !SURL || !SKEY) return empty;

  try {
    const res = await fetch(
      `${SURL}/rest/v1/user_cosmetics?equipped=eq.true&clerk_id=in.(${ids.join(',')})&select=clerk_id,item_id,cosmetic_items(name,tier,category,style)`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!res.ok) return empty;
    const rows = await res.json();

    const map = {};
    for (const row of rows) {
      const item = row.cosmetic_items;
      if (!item) continue;
      if (!map[row.clerk_id]) map[row.clerk_id] = { border: null, flair: null };
      const entry = { id: row.item_id, name: item.name, tier: item.tier, style: item.style };
      if (item.category === 'border') map[row.clerk_id].border = entry;
      if (item.category === 'flair') map[row.clerk_id].flair = entry;
    }
    return map;
  } catch {
    return empty;
  }
}
