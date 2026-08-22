import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Resolves the user's Beat the Model pick once the race's winner is known
// (client-triggered, same as before -- no server cron hooks into this).
// Same RLS gap as the pick route: the previous client-side PATCH with the
// anon key didn't error, it silently updated zero rows (PostgREST reports
// an RLS-filtered UPDATE as "0 rows matched", not an error), which is why
// this was even harder to notice than the pick-save failure. Confirmed
// live by seeding a row with the service key, then replaying the app's
// exact anon-key PATCH: HTTP 200, but the row was unchanged on read-back.
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

  const { won } = await req.json().catch(() => ({}));
  if (typeof won !== 'boolean') {
    return NextResponse.json({ error: 'Missing won (boolean)' }, { status: 400 });
  }

  const compDate = todayISO();
  // resolved=eq.false guard: idempotent, stops a double-award if this
  // fires from more than one open tab -- same intent as the logic this
  // replaces, just actually enforceable now that the write itself works.
  const r = await fetch(
    `${SURL}/rest/v1/btm_picks?clerk_id=eq.${encodeURIComponent(userId)}&comp_date=eq.${compDate}&resolved=eq.false`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ resolved: true, won }),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    console.error('[beat-model/resolve] Supabase error:', r.status, text);
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }
  const rows = await r.json();
  const updated = Array.isArray(rows) && rows.length > 0;
  if (updated && won) {
    await awardPoints(userId, 'beat_model_correct').catch(() => {});
  }
  return NextResponse.json({ ok: true, updated, won });
}
