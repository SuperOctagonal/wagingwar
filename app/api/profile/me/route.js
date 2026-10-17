import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { punterFallback } from '@/lib/punterFallback';

// The session user's own full user_profiles row (private fields included --
// this is the one place that's correct, since it's always the caller's own
// data). GET auto-creates the row on first visit, same as the community
// page's old client-side create-on-missing logic, except email/display_name
// defaults are now computed server-side from the Clerk session instead of
// trusting whatever the browser sent.
const PATCH_FIELDS = ['display_name', 'username', 'avatar_url', 'profile_frame', 'bio', 'hide_from_lb', 'leaderboard_opt_out', 'notifications_enabled'];

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const existing = await sbAdminRaw(`user_profiles?clerk_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  if (!existing.ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (existing.data && existing.data.length) return NextResponse.json(existing.data[0]);

  // No row yet -- create one with server-derived defaults (never from the
  // client): email and username come from the Clerk session, not the body.
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user?.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const display_name = user?.username || punterFallback(userId);

  const created = await sbAdminRaw('user_profiles', {
    method: 'POST',
    prefer: 'return=representation',
    body: { clerk_id: userId, email, display_name, points: 0 },
  });
  if (!created.ok || !created.data) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  const row = Array.isArray(created.data) ? created.data[0] : created.data;
  return NextResponse.json(row);
}

export async function PATCH(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch = {};
  PATCH_FIELDS.forEach(k => { if (body && body[k] !== undefined) patch[k] = body[k]; });
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  if (patch.display_name != null && (typeof patch.display_name !== 'string' || patch.display_name.length > 60)) {
    return NextResponse.json({ error: 'Invalid display_name' }, { status: 400 });
  }
  if (patch.username != null && (typeof patch.username !== 'string' || patch.username.length > 60)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }
  if (patch.bio != null && String(patch.bio).length > 500) {
    return NextResponse.json({ error: 'bio too long' }, { status: 400 });
  }
  for (const k of ['hide_from_lb', 'leaderboard_opt_out', 'notifications_enabled']) {
    if (patch[k] !== undefined) patch[k] = !!patch[k];
  }

  const { ok, data } = await sbAdminRaw(
    `user_profiles?clerk_id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', prefer: 'return=representation', body: patch },
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data[0]);
}
