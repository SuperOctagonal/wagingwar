import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { stripHorseFields } from '@/lib/freeTierFields';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { filterAuMeetings } from '@/lib/venues';
import { hasFeature } from '@/lib/planFeatures';

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

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const plan = user?.publicMetadata?.plan;
  const hasFullScores = hasFeature(plan, 'full_scores');

  // Historical race cards are a separate, undocumented Pro perk -- not one
  // of the named Lite features, so this stays literally pro-only rather
  // than going through hasFeature('full_scores'), which Lite now also
  // satisfies. Unchanged by the Lite rollout.
  if (date !== todayAEST && plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required for historical race cards' }, { status: 403 });
  }

  const result = await fetchAllRows(
    `${SURL}/rest/v1/race_cards?date=eq.${date}&select=date,venue,race_num,form_data`,
    { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  );

  if (!result.ok) return NextResponse.json({ error: `Supabase ${result.status}` }, { status: 502 });
  // Defense-in-depth: reads straight from race_cards, independent of the
  // CSV-import path's own NZ exclusion -- see results-ranks/route.js for
  // the same reasoning. filterAuMeetings (blocklist), not isKnownAuVenue
  // (allowlist) -- an unlisted genuine AU venue must still show here
  // (Tomorrow/historical dates), only a known NZ venue is excluded.
  let data = filterAuMeetings(result.rows);

  // Real server-side gate — free tier never receives scoring-input fields in
  // form_data, not just a hidden UI column. See lib/freeTierFields.js for the
  // allowlist and how it was determined.
  if (!hasFullScores) {
    data = data.map(row => ({ ...row, form_data: stripHorseFields(row.form_data) }));
  }

  return NextResponse.json(data);
}
