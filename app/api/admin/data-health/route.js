import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';
import { getDataHealth, healthDates } from '@/lib/adminDataHealth';
import { withTimeout } from '@/lib/withTimeout.mjs';

// Admin-only: data health for one racing date (today or the previous 7
// days), for the dashboard's date picker. Today's is server-rendered with
// the page; other dates are fetched here.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const date = new URL(req.url).searchParams.get('date');
  if (!healthDates().includes(date)) {
    return NextResponse.json({ error: 'Date must be today or one of the previous 7 days.' }, { status: 400 });
  }
  // Same limit as the server-rendered panel (app/admin/subscribers/page.js).
  const health = await withTimeout(getDataHealth(date), 15_000, 'Data health (Supabase)')
    .catch(err => ({ ok: false, error: `Data health (Supabase) read failed: ${err.message}` }));
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
