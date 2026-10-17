import { NextResponse } from 'next/server';
import { sbAdminRaw } from '@/lib/supabaseAdmin';

// Public user_profiles reads -- no auth required, but every response is
// filtered server-side to a fixed public-safe field whitelist (picked from
// the fetched row in JS, not via a SQL select= list, so this never breaks
// if a column the whitelist names doesn't exist). email, referral_code,
// referred_by, notifications_enabled, hide_from_lb and anything else not
// in this list NEVER reach the response, no matter what the row contains.
const PUBLIC_FIELDS = [
  'clerk_id', 'username', 'display_name', 'avatar_url', 'profile_frame', 'bio',
  'tier', 'points', 'streak', 'streaks', 'totals', 'followers_count', 'following_count',
  'joined_at', 'created_at',
];

function toPublic(row) {
  const out = {};
  PUBLIC_FIELDS.forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });
  return out;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const clerkId = searchParams.get('clerkId');
  const top = searchParams.get('top');
  const hiddenFromLb = searchParams.get('hiddenFromLb');
  const count = searchParams.get('count');

  // Opted-out-of-leaderboard clerk_ids only -- used by competitions to hide
  // those users from a public leaderboard. Never a full row.
  if (hiddenFromLb === 'true') {
    const { ok, data } = await sbAdminRaw('user_profiles?hide_from_lb=eq.true&select=clerk_id');
    if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
    return NextResponse.json({ clerkIds: (data || []).map(r => r.clerk_id) });
  }

  // sbAdminRaw always parses a JSON body, which a HEAD response never has --
  // count needs the Content-Range header instead, so this does its own
  // direct fetch rather than going through that helper.
  if (count === 'true') {
    const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SKEY = process.env.SUPABASE_SERVICE_KEY;
    try {
      const res = await fetch(`${SURL}/rest/v1/user_profiles?select=clerk_id`, {
        method: 'HEAD',
        headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'count=exact' },
      });
      const range = res.headers.get('Content-Range');
      const total = range ? +range.split('/')[1] : 0;
      return NextResponse.json({ count: total || 0 });
    } catch {
      return NextResponse.json({ count: 0 });
    }
  }

  if (top) {
    const n = Math.min(Math.max(+top || 5, 1), 50);
    const { ok, data } = await sbAdminRaw(`user_profiles?select=*&order=points.desc&limit=${n}`);
    if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
    return NextResponse.json((data || []).map(toPublic));
  }

  if (!clerkId) return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
  const { ok, data } = await sbAdminRaw(`user_profiles?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*&limit=1`);
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json(null);
  return NextResponse.json(toPublic(data[0]));
}
