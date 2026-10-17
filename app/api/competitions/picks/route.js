import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { normaliseVenue } from '@/lib/venues';
import { hasRaceJumped } from '@/lib/raceTime';

// Replaces app/competitions/page.js's direct comp_picks/comp_picks_popular
// reads and comp_picks upsert. clerk_id/username always come from the
// session, never the body. GET with no auth returns the public picks view
// (comp_picks_popular aggregate + other users' non-hidden picks for locked
// races only); GET with auth and no comp_date returns the session user's
// own all-time picks; GET with auth and comp_date returns just that day's
// own picks.

async function isRaceLocked(comp_date, venue, race_num) {
  const { data } = await sbAdminRaw(
    `race_schedule?date=eq.${comp_date}&venue=eq.${encodeURIComponent(venue)}&race_num=eq.${race_num}&select=post_time&limit=1`,
  );
  const postTime = data?.[0]?.post_time;
  if (!postTime) return false; // fail open, matches client's existing behaviour when jt is null
  return hasRaceJumped(comp_date, postTime);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const comp_date = searchParams.get('comp_date');
  const mode = searchParams.get('mode');

  if (mode === 'public') {
    if (!comp_date) return NextResponse.json({ error: 'Missing comp_date' }, { status: 400 });
    const [{ data: popular }, { data: picks }] = await Promise.all([
      sbAdminRaw(`comp_picks_popular?comp_date=eq.${comp_date}&select=venue,race_num,horse_name,pick_count`),
      sbAdminRaw(`comp_picks?comp_date=eq.${comp_date}&hide_picks=eq.false&select=clerk_id,username,venue,race_num,horse_name&order=clerk_id.asc`),
    ]);

    // Only reveal other users' picks for races that have actually locked --
    // never leak an unlocked pick, even if hide_picks is false.
    const lockedCache = new Map();
    const filtered = [];
    for (const p of picks || []) {
      const key = `${p.venue}||${p.race_num}`;
      if (!lockedCache.has(key)) lockedCache.set(key, await isRaceLocked(comp_date, p.venue, p.race_num));
      if (lockedCache.get(key)) filtered.push(p);
    }
    return NextResponse.json({ popular: popular || [], picks: filtered });
  }

  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const path = comp_date
    ? `comp_picks?clerk_id=eq.${encodeURIComponent(userId)}&comp_date=eq.${comp_date}&select=venue,race_num,horse_name`
    : `comp_picks?clerk_id=eq.${encodeURIComponent(userId)}&select=comp_date,venue,race_num,horse_name`;
  const { ok, data } = await sbAdminRaw(path);
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}

export async function POST(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const comp_date = body?.comp_date;
  const venue = normaliseVenue(body?.venue || '');
  const race_num = +body?.race_num;
  const horse_name = body?.horse_name;
  const username = body?.username;
  const hide_picks = !!body?.hide_picks;

  if (!comp_date || !/^\d{4}-\d{2}-\d{2}$/.test(comp_date)) return NextResponse.json({ error: 'Invalid comp_date' }, { status: 400 });
  if (!venue || venue === 'UNKNOWN') return NextResponse.json({ error: 'Invalid venue' }, { status: 400 });
  if (!Number.isInteger(race_num) || race_num < 1 || race_num > 20) return NextResponse.json({ error: 'Invalid race_num' }, { status: 400 });
  if (!horse_name || typeof horse_name !== 'string' || horse_name.length > 200) return NextResponse.json({ error: 'Invalid horse_name' }, { status: 400 });
  if (username != null && (typeof username !== 'string' || username.length > 60)) return NextResponse.json({ error: 'Invalid username' }, { status: 400 });

  if (await isRaceLocked(comp_date, venue, race_num)) {
    return NextResponse.json({ error: 'Race is locked' }, { status: 409 });
  }

  const { ok, status, data } = await sbAdminRaw('comp_picks?on_conflict=clerk_id,comp_date,venue,race_num', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { clerk_id: userId, comp_date, venue, race_num, horse_name, username: username || null, hide_picks },
  });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: status === 400 ? 400 : 502 });
  return NextResponse.json(Array.isArray(data) ? data[0] : data);
}
