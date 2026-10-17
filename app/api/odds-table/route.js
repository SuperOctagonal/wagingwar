import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabaseAdmin';
import { MIN_OPEN_BOOKMAKERS } from '@/lib/marketMoves';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Public, read-only bookmaker-comparison data for one race (odds_snapshot +
// race_cards join) -- replaces components/OddsTable.js's direct anon-key
// reads. No auth: this is the same public odds-comparison view /odds and
// the Races page's Odds tab already showed with the anon key, just now
// server-fetched with the service key and short-cached instead.
async function fetchLatestTs(date, venue, raceNum) {
  const res = await fetch(`${SURL}/rest/v1/rpc/race_odds_open_latest`, {
    method: 'POST',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_date: date, p_venue: venue, p_race: String(raceNum), p_min_books: MIN_OPEN_BOOKMAKERS }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.latest_ts ?? null;
}

export async function GET(req) {
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const venue = searchParams.get('venue');
  const raceNum = searchParams.get('raceNum');
  const date = searchParams.get('date');
  if (!venue || !raceNum || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'venue, raceNum and date are required' }, { status: 400 });
  }

  const ts = await fetchLatestTs(date, venue, raceNum);
  if (!ts) {
    return NextResponse.json({ rows: [], cardInfo: {}, capturedAt: null }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  }

  const [rows, cards] = await Promise.all([
    sbAdmin(`odds_snapshot?race_date=eq.${date}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&captured_at=eq.${encodeURIComponent(ts)}&select=horse_name,bookmaker,price`),
    sbAdmin(`race_cards?date=eq.${date}&venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&select=horse_name,barrier,form_data`),
  ]);

  const cardInfo = {};
  for (const c of cards || []) {
    cardInfo[c.horse_name] = { tab: c.form_data?.tab ?? null, barrier: c.barrier ?? null };
  }

  return NextResponse.json(
    { rows: rows || [], cardInfo, capturedAt: ts },
    { headers: { 'Cache-Control': 'public, max-age=30' } },
  );
}
