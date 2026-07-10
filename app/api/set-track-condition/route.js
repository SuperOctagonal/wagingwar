import { NextResponse } from 'next/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VALID = new Set(['good', 'soft', 'heavy', 'synthetic']);

export async function POST(req) {
  const { venue, date, condition } = await req.json().catch(() => ({}));

  if (!venue || !date || !condition) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (!VALID.has(condition)) {
    return NextResponse.json({ error: 'Invalid condition' }, { status: 400 });
  }
  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
  }

  const r = await fetch(
    `${SURL}/rest/v1/today_meetings?on_conflict=date,venue`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ date, venue, condition_override: condition }),
    }
  );

  if (!r.ok) {
    const text = await r.text();
    console.error('[set-track-condition] Supabase error:', r.status, text);
    return NextResponse.json({ error: `Supabase ${r.status}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
