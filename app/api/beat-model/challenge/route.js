import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Writes today's selected Beat the Model challenge server-side with the
// service key -- same pattern as /api/beat-model/pick and
// /api/beat-model/resolve. Replaces the previous direct client -> Supabase
// (anon key) upsert in app/competitions/page.js, which was silently
// blocked end-to-end: btm_challenges has RLS enabled with zero policies
// defined (confirmed live via pg_policies), so every attempt to write this
// table had been rejected since the feature shipped -- invisible because
// the client helper (sbFetch) swallows errors. Confirmed empty: 0 rows in
// btm_challenges for any date before this fix.
//
// Also folds in the model_pick write that used to be a second, separate
// client effect (deliberately split out because btm_challenges.model_pick
// didn't exist yet and PostgREST 400s an entire insert that references an
// unknown column) -- that column now exists, so there's no reason to keep
// two round trips and two independent failure points for one row.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { comp_date: compDate, venue, race_num: raceNum, race_name: raceName, prize_money: prizeMoney, post_time: postTime, used_fallback: usedFallback, model_pick: modelPick } = body;
  if (!compDate || !venue || !raceNum) {
    return NextResponse.json({ error: 'Missing comp_date/venue/race_num' }, { status: 400 });
  }

  const r = await fetch(`${SURL}/rest/v1/btm_challenges?on_conflict=comp_date`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      comp_date: compDate,
      venue,
      race_num: raceNum,
      race_name: raceName ?? null,
      prize_money: prizeMoney ?? null,
      post_time: postTime ?? null,
      used_fallback: !!usedFallback,
      model_pick: modelPick ?? null,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    console.error('[beat-model/challenge] Supabase error:', r.status, text);
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, comp_date: compDate });
}
