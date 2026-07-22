import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Deliberately NOT Pro-gated — post-race ranks are proof of model performance,
// meant to be visible to every user (see Results-page rank-badge unlock).
// Scores server-side against the FULL (unstripped) race_cards data and returns
// only the computed rank/margin per race — never the raw scoring-input fields,
// so this is safe to expose to any tier: there is nothing in the response a
// free user could use to reconstruct a real ranking, unlike the raw
// /api/race-cards or /api/today-csv payloads.
export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

  const [cardsRes, scrRes] = await Promise.all([
    fetch(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=venue,race_num,form_data`, { headers }),
    fetch(`${SURL}/rest/v1/scratchings?date=eq.${date}&select=venue,race_num,horse_name`, { headers }),
  ]);

  if (!cardsRes.ok) return NextResponse.json({ error: `Supabase ${cardsRes.status}` }, { status: 502 });
  const cardRows = await cardsRes.json();
  const scrRows = scrRes.ok ? await scrRes.json() : [];

  // Group into per-race horse arrays, same shape the client used to build
  // from the (now-stripped-for-free) /api/race-cards response.
  const races = {}; // key: `${venue}||${raceNum}` -> { venue, raceNum, horses: [] }
  cardRows.forEach(row => {
    const norm = normaliseVenue(row.venue);
    const key = `${norm}||${row.race_num}`;
    if (!races[key]) races[key] = { venue: norm, raceNum: row.race_num, horses: [] };
    if (row.form_data) races[key].horses.push(row.form_data);
  });

  const weights = getDefaultWeights();
  const result = {};

  Object.values(races).forEach(({ venue, raceNum, horses }) => {
    const dbScrNames = new Set(
      scrRows
        .filter(r => normaliseVenue(r.venue) === venue && String(r.race_num) === String(raceNum))
        .map(r => normName(r.horse_name || ''))
    );
    const active = horses.filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
    if (!active.length) return;

    const scored = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, 'good'); });
      const total = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { name: h.name, total };
    }).sort((a, b) => b.total - a.total);

    const ranks = {};
    scored.forEach((h, i) => { ranks[normName(h.name)] = i + 1; });
    // race_cards doesn't store distance/class per row (that's a race_results
    // field the caller already has from its own results fetch) — only ranks
    // and the rank1-vs-rank2 score gap are this route's job.
    const margin = scored.length >= 2 ? scored[0].total - scored[1].total : null;

    if (!result[venue]) result[venue] = {};
    result[venue][raceNum] = { ranks, margin };
  });

  return NextResponse.json(result);
}
