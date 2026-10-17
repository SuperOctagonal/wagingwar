import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';

// Replaces direct anon-key points_log reads in app/competitions/page.js
// and app/account/page.js -- always scoped to the session user.
export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(
    `points_log?clerk_id=eq.${encodeURIComponent(userId)}&select=points,category,reason,action_type,created_at&order=created_at.desc`,
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}
