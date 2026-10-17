import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';

// Replaces the unfiltered `blackbook?select=horse_name` read at
// app/blackbook/page.js (~line 339), which returned every user's raw rows
// to the browser with no clerk_id filter at all. This computes the same
// top-10-most-watched aggregate server-side and returns only
// {horse_name, count} pairs -- never a raw row, never a clerk_id.
export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw('blackbook?select=horse_name');
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });

  const counts = {};
  (data || []).forEach(row => {
    const n = row.horse_name;
    if (n) counts[n] = (counts[n] || 0) + 1;
  });
  // [name, count] tuples, same shape setMostWatched already expects on the
  // client (app/blackbook/page.js) -- no UI change needed for this one.
  const mostWatched = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return NextResponse.json(mostWatched);
}
