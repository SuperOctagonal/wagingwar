import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const todayAEST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });

  if (date !== todayAEST) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (user?.publicMetadata?.plan !== 'pro') {
      return NextResponse.json({ error: 'Pro required for historical race cards' }, { status: 403 });
    }
  }

  const r = await fetch(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=date,venue,race_num,form_data`, {
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });

  if (!r.ok) return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  const data = await r.json();
  return NextResponse.json(data);
}
