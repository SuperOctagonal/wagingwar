import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';
import { getDataHealth, healthDates } from '@/lib/adminDataHealth';

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
  const health = await getDataHealth(date);
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
