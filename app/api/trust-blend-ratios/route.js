import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';

// Admin-only, per the Phase 3 brief -- preview only, no new blend is live
// for regular users from this route. Returns every currently-active
// bucket (lib/trustApply.js's pickTrustBucket() picks the right one
// client-side per runner).
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
      `${SURL}/rest/v1/trust_blend_ratios?is_active=eq.true&select=bucket_key,learned_live_weight,sample_size,fitted_at,test_brier_at_learned,test_brier_pure_model,test_brier_pure_market`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    );
    if (!res.ok) return NextResponse.json({ error: `Supabase ${res.status}` }, { status: 502 });
    const buckets = await res.json();
    return NextResponse.json({ buckets });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
