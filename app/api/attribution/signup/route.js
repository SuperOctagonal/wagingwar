import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { cleanPath, cleanUtm } from '@/lib/attribution';

// First-touch ad attribution for a new account, sent once by
// components/SignupTracker.js -- which only does so after the user has
// accepted cookies. Keyed by the signed-in Clerk user id (from the
// session, never from the body). Stores only utm_source, utm_campaign,
// utm_content and the landing path.
//
// Only accepted for accounts created in the last 24 hours, so an existing
// account can't attach an ad source later; first write wins (an existing
// row is never overwritten).
const MAX_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const row = {
    clerk_user_id: userId,
    utm_source: cleanUtm(body?.utm_source),
    utm_campaign: cleanUtm(body?.utm_campaign),
    utm_content: cleanUtm(body?.utm_content),
    landing_path: cleanPath(body?.landing_path),
  };
  if (!row.utm_source && !row.utm_campaign && !row.utm_content) {
    return NextResponse.json({ error: 'No UTM values' }, { status: 400 });
  }

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId).catch(() => null);
  if (!user?.createdAt || Date.now() - new Date(user.createdAt).getTime() > MAX_ACCOUNT_AGE_MS) {
    return NextResponse.json({ error: 'Only for new accounts' }, { status: 409 });
  }

  const { ok, status } = await sbAdminRaw('signup_attribution?on_conflict=clerk_user_id', {
    method: 'POST',
    body: row,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  if (!ok) return NextResponse.json({ error: 'Not stored' }, { status: status === 404 ? 503 : 502 });
  return NextResponse.json({ ok: true });
}
