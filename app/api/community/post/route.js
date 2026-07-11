import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { section, title, body } = await req.json().catch(() => ({}));
  if (!section || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const r = await fetch(`${SURL}/rest/v1/posts?select=*`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ user_id: userId, section, title, body, votes: 0, reply_count: 0 }),
  });

  if (!r.ok) return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  const data = await r.json();
  return NextResponse.json(data);
}
