import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';
import { normaliseVenue } from '@/lib/venues';
import { findBattleCardStats } from '@/lib/edgeZone';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Service key, not anon -- battle_card_shares has no RLS policies (all access
// is meant to go through server routes), same pattern as log-bet/route.js.
const SKEY = process.env.SUPABASE_SERVICE_KEY;

async function fetchAllBets(clerkId) {
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
  const res = await fetch(
    `${SURL}/rest/v1/bet_log?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*&order=date.asc`,
    { headers },
  );
  if (!res.ok) return [];
  return res.json();
}

// One row per user -- re-sharing overwrites the existing row's snapshot but
// keeps the same public id, so the same URL keeps working (and any FB/X
// posts made with an earlier URL still resolve) rather than growing a new
// row per click.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const bets = await fetchAllBets(userId);
  // Temporarily floored at 1 (was 10) so any real sample qualifies; one-line revert if needed.
  const stats = findBattleCardStats(bets, { minSample: 1, normaliseVenueFn: normaliseVenue });
  if (!stats.qualifies) return NextResponse.json({ error: 'Not enough data yet' }, { status: 404 });

  const { bestZone, bestVenue, bestCondition } = stats;
  const headers = {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
  };

  const existingRes = await fetch(
    `${SURL}/rest/v1/battle_card_shares?clerk_id=eq.${encodeURIComponent(userId)}&select=id`,
    { headers },
  );
  const existing = existingRes.ok ? await existingRes.json() : [];
  const snapshot = { best_zone: bestZone, best_venue: bestVenue, best_condition: bestCondition };

  let id = existing?.[0]?.id;
  if (id) {
    const r = await fetch(`${SURL}/rest/v1/battle_card_shares?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(snapshot),
    });
    if (!r.ok) return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  } else {
    id = randomUUID().replace(/-/g, '').slice(0, 10);
    const r = await fetch(`${SURL}/rest/v1/battle_card_shares?select=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ id, clerk_id: userId, ...snapshot }),
    });
    if (!r.ok) return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }

  return NextResponse.json({ id, url: `https://wagingwar.com.au/battle-card/share/${id}` });
}
