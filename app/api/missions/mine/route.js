import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';

// Replaces app/community/page.js's direct anon-key user_missions read --
// user_missions is a private per-user table (RLS currently "using (true)"),
// so filtering by clerk_id client-side with the anon key let anyone read
// anyone else's mission progress. Always scoped to the session user.
export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(
    `user_missions?select=*,missions(title,points)&clerk_id=eq.${encodeURIComponent(userId)}&limit=5`,
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}
