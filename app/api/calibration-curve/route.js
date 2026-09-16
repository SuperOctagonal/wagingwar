import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';

// Admin-only, per the Phase 2 brief -- this is a preview of a price
// adjustment that hasn't gone live for regular users yet. Returns the
// currently-active calibration curve (lib/calibrationCurve.js) so the
// Field tab's admin-only preview (app/races/page.js) can compute
// old-vs-calibrated WW$ client-side via lib/calibrationApply.js. Never
// used by any regular-user code path.
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
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
