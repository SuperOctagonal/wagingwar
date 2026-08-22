import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// Today's Beat the Model state -- the caller's own pick (if any) plus the
// day's aggregate participant/correct counts, both derived from a single
// service-key read of btm_picks. Replaces two separate anon-key reads that
// were both silently broken: btm_picks has no anon-role SELECT policy,
// so `btm_picks?...` via the anon key returns `200 []` unconditionally
// (confirmed live, including a completely unfiltered anon SELECT) rather
// than an error -- the same "quietly wrong, not loudly broken" failure mode
// as the original INSERT/UPDATE gaps this feature already had fixed. Only
// the writes (pick/resolve) were migrated off the anon key at the time;
// this read path was missed.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const compDate = todayISO();
  const r = await fetch(
    `${SURL}/rest/v1/btm_picks?comp_date=eq.${compDate}&select=clerk_id,horse_name,resolved,won`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
  );
  if (!r.ok) {
    console.error('[beat-model/today] Supabase error:', r.status, await r.text().catch(() => ''));
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }
  const rows = await r.json();

  const mine = rows.find(row => row.clerk_id === userId) || null;
  const stats = {
    participants: rows.length,
    correct: rows.filter(row => row.resolved && row.won).length,
  };

  return NextResponse.json({
    ok: true,
    comp_date: compDate,
    pick: mine ? { horse_name: mine.horse_name, resolved: !!mine.resolved, won: !!mine.won } : null,
    stats,
  });
}
