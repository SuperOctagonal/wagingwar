import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { computeBtmStreak } from '@/lib/beatModel';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

async function sb(path) {
  const r = await fetch(`${SURL}/rest/v1/${path}`, {
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

// btm_challenges.model_pick doesn't exist until the manual `ALTER TABLE`
// referenced in the app is run -- selecting a column PostgREST doesn't
// recognize 400s the whole request, so this falls back to the same query
// without it rather than taking the entire history route down over one
// missing column. Once the column exists this always takes the first path.
async function fetchChallenges(inList) {
  try {
    return await sb(`btm_challenges?comp_date=in.${inList}&select=comp_date,venue,race_num,race_name,model_pick`);
  } catch {
    const rows = await sb(`btm_challenges?comp_date=in.${inList}&select=comp_date,venue,race_num,race_name`);
    return rows.map(r => ({ ...r, model_pick: null }));
  }
}

// Server-computed history + derived streak for the current user's Beat the
// Model picks -- joins btm_picks with btm_challenges (venue/race/model_pick)
// and race_results (actual winner) so the client gets small, ready-to-render
// rows instead of three raw table dumps.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  try {
    const picks = await sb(
      `btm_picks?clerk_id=eq.${encodeURIComponent(userId)}&select=comp_date,horse_name,resolved,won&order=comp_date.desc`,
    );
    if (!picks.length) {
      return NextResponse.json({ ok: true, history: [], streak: 0 });
    }

    const dates = picks.map(p => p.comp_date);
    const inList = `(${dates.join(',')})`;
    const [challenges, results] = await Promise.all([
      fetchChallenges(inList),
      sb(`race_results?date=in.${inList}&finish_pos=eq.1&select=date,venue,race_num,horse_name`),
    ]);

    const challengeByDate = new Map(challenges.map(c => [c.comp_date, c]));
    const winnerByDate = new Map(results.map(r => [`${r.date}||${normaliseVenue(r.venue || '')}||${r.race_num}`, r.horse_name]));

    const history = picks.map(p => {
      const ch = challengeByDate.get(p.comp_date);
      const winnerName = ch ? winnerByDate.get(`${p.comp_date}||${ch.venue}||${ch.race_num}`) || null : null;
      return {
        comp_date: p.comp_date,
        venue: ch?.venue || null,
        race_num: ch?.race_num || null,
        race_name: ch?.race_name || null,
        your_pick: p.horse_name,
        winner: winnerName,
        model_pick: ch?.model_pick || null,
        resolved: !!p.resolved,
        won: !!p.won,
      };
    });

    const streak = computeBtmStreak(picks, todayISO());

    return NextResponse.json({ ok: true, history, streak });
  } catch (err) {
    console.error('[beat-model/history] error:', err.message);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 502 });
  }
}
