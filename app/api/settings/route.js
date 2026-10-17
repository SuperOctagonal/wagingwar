import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';

// Replaces hooks/useUserSettings.js and the settings page's own load/save.
// user_settings stores one opaque JSONB `settings` blob per clerk_id --
// the route's job is just making sure clerk_id is always the session user
// and the blob isn't absurdly large, not validating every individual key
// inside it (the client already owns that shape entirely, same as before).
const MAX_SETTINGS_BYTES = 20_000;

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(`user_settings?clerk_id=eq.${encodeURIComponent(userId)}&select=settings&limit=1`);
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}

export async function PUT(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.settings !== 'object' || body.settings === null || Array.isArray(body.settings)) {
    return NextResponse.json({ error: 'settings must be an object' }, { status: 400 });
  }
  if (JSON.stringify(body.settings).length > MAX_SETTINGS_BYTES) {
    return NextResponse.json({ error: 'settings payload too large' }, { status: 400 });
  }

  const { ok } = await sbAdminRaw('user_settings?on_conflict=clerk_id', {
    method: 'POST',
    prefer: 'return=minimal,resolution=merge-duplicates',
    body: { clerk_id: userId, settings: body.settings, updated_at: new Date().toISOString() },
  });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
