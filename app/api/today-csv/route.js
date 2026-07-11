import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  if (!SURL || !SKEY) {
    return new NextResponse('Supabase env vars not set', { status: 500 });
  }

  const todayAEST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const path = `${todayAEST}.csv`;

  try {
    const res = await fetch(`${SURL}/storage/v1/object/wizard-csv/${path}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    if (!res.ok) {
      return new NextResponse('CSV not available', { status: 404 });
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Failed to fetch CSV from storage', { status: 500 });
  }
}
