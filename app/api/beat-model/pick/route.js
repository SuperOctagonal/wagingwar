import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Writes the user's Beat the Model pick server-side with the service key,
// same pattern as /api/log-bet and /api/games/* -- replaces the previous
// direct client -> Supabase (anon key) upsert, which was silently blocked
// end-to-end: btm_picks has an RLS policy that rejects anon-key INSERTs
// (confirmed live: 401 "new row violates row-level security policy"), so
// no pick had ever actually persisted despite the UI appearing to save one
// (an optimistic client-side state update masked the failure).
function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { horse_name: horseName } = await req.json().catch(() => ({}));
  if (!horseName || typeof horseName !== 'string') {
    return NextResponse.json({ error: 'Missing horse_name' }, { status: 400 });
  }

  const compDate = todayISO();
  const r = await fetch(`${SURL}/rest/v1/btm_picks?on_conflict=clerk_id,comp_date`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ clerk_id: userId, comp_date: compDate, horse_name: horseName }),
  });
  if (!r.ok) {
    const text = await r.text();
    console.error('[beat-model/pick] Supabase error:', r.status, text);
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }

  // Participation points -- moved here (was a separate, independently-
  // failable client-side awardPoints call) since it's the same action as
  // the pick itself now that the pick write is server-side. The 1/day cap
  // in lib/points.js's LIMITS already stops a changed pick from re-earning
  // this, same as before.
  await awardPoints(userId, 'beat_model_participate').catch(() => {});

  return NextResponse.json({ ok: true, comp_date: compDate, horse_name: horseName });
}
