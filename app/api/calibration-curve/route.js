import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';

// Phase 2 calibration is now the real WW $ for every Pro user (shipped --
// was admin-only preview until now). Pro-gated with an admin bypass, same
// convention as every other Pro gate in the codebase (e.g.
// /api/market-movers). Returns the currently-active calibration curve
// (lib/calibrationCurve.js) which lib/livePricing.js's calculateLiveOdds
// applies -- the single shared point every WW$ consumer goes through.
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  if (!isSiteAdmin(userId)) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (user?.publicMetadata?.plan !== 'pro') {
      return NextResponse.json({ error: 'Pro required' }, { status: 403 });
    }
  }
  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${SURL}/rest/v1/score_calibration_curve?is_active=eq.true&select=id,fitted_at,date_range_start,date_range_end,sample_size,curve_points,oos_metrics&limit=1`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!res.ok) return NextResponse.json({ error: `Supabase ${res.status}` }, { status: 502 });
    const rows = await res.json();
    return NextResponse.json({ curve: rows[0] || null });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
