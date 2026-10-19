import { NextResponse } from 'next/server';
import { fetchTipRecord } from '@/lib/tipRecord';

// Public, no auth -- the Tip Record page (/tip-record) is public by design,
// same as its data. Reads tip_results via the service key only (the view
// itself has anon/authenticated revoked -- see the migration); nothing
// here ever runs with a browser-supplied credential.
export async function GET() {
  const result = await fetchTipRecord();
  if (!result) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=600' },
  });
}
