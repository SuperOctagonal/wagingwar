import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { ALL_KNOWN_BOOKMAKERS } from '@/lib/bookmakers';
import { awardPointsServer } from '@/lib/awardPointsServer';

// Replaces every direct-anon-key bet_log call from the browser: mybets'
// load/edit/delete/settle-patch, TopNav/ProfileRail/InsightsPanel's own-bets
// reads, and settings' CSV export + clear-all. clerk_id always comes from
// the Clerk session (requireUser), never the request -- every PATCH/DELETE
// filters on id AND clerk_id so one user can never touch another's row,
// and a request for a bet that isn't theirs (or doesn't exist) gets 404,
// not a silent no-op.

// Fields a client is ever allowed to set. Server-managed columns (clerk_id,
// id, created_at, updated_at) are never accepted from the body.
const INSERT_FIELDS = [
  'horse_name', 'track', 'venue', 'race_number', 'bet_type', 'stake', 'odds',
  'place_odds', 'bookmaker', 'rank', 'my_odds', 'track_condition', 'race_name',
  'meeting_date', 'race_time', 'tab_no', 'date',
];
const PATCH_FIELDS = [
  'stake', 'odds', 'place_odds', 'status', 'result', 'position', 'margin',
  'return_amt', 'profit_loss', 'edited_at', 'bookmaker', 'bet_type', 'horse_name',
];

function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function sanitizeInsert(body) {
  const f = pick(body || {}, INSERT_FIELDS);
  if (!f.horse_name || typeof f.horse_name !== 'string' || f.horse_name.length > 200) return null;
  const stake = +f.stake, odds = +f.odds;
  if (!(stake > 0) || stake > 1_000_000) return null;
  if (!(odds > 1) || odds > 1000) return null;
  if (f.place_odds != null && f.place_odds !== '' && !(+f.place_odds > 1 && +f.place_odds <= 1000)) return null;
  if (f.bookmaker != null && f.bookmaker !== '' && !ALL_KNOWN_BOOKMAKERS.includes(f.bookmaker)) return null;
  for (const k of ['track', 'venue', 'bet_type', 'race_name', 'track_condition', 'race_time']) {
    if (f[k] != null && String(f[k]).length > 200) return null;
  }
  return {
    ...f,
    stake, odds,
    place_odds: f.place_odds != null && f.place_odds !== '' ? +f.place_odds : null,
    race_number: f.race_number ?? null,
    date: f.date || new Date().toISOString().slice(0, 10),
    status: 'pending',
    return_amt: null,
    position: null,
  };
}

const VALID_STATUS = ['pending', 'win', 'place', 'loss', 'scratched', 'void'];

function sanitizePatch(body) {
  const f = pick(body || {}, PATCH_FIELDS);
  if (f.stake !== undefined && !(+f.stake > 0 && +f.stake <= 1_000_000)) return null;
  if (f.odds !== undefined && !(+f.odds > 1 && +f.odds <= 1000)) return null;
  if (f.place_odds !== undefined && f.place_odds !== null && !(+f.place_odds > 1 && +f.place_odds <= 1000)) return null;
  if (f.status !== undefined && !VALID_STATUS.includes(f.status)) return null;
  if (f.result !== undefined && f.result !== null && String(f.result).length > 40) return null;
  if (f.position !== undefined && f.position !== null && !(Number.isInteger(+f.position) && +f.position >= 0 && +f.position <= 100)) return null;
  if (f.bookmaker != null && f.bookmaker !== '' && !ALL_KNOWN_BOOKMAKERS.includes(f.bookmaker)) return null;
  if (f.horse_name !== undefined && (typeof f.horse_name !== 'string' || f.horse_name.length > 200)) return null;
  if (f.stake !== undefined) f.stake = +f.stake;
  if (f.odds !== undefined) f.odds = +f.odds;
  if (f.place_odds !== undefined && f.place_odds !== null) f.place_odds = +f.place_odds;
  return f;
}

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(`bet_log?clerk_id=eq.${encodeURIComponent(userId)}&order=date.desc,id.desc`);
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}

export async function POST(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const insertBody = sanitizeInsert(body);
  if (!insertBody) return NextResponse.json({ error: 'Invalid bet fields' }, { status: 400 });
  insertBody.clerk_id = userId; // forced, never from body

  const { ok, status, data } = await sbAdminRaw('bet_log?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: insertBody,
  });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: status === 400 ? 400 : 502 });
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.id != null) {
    awardPointsServer(userId, 'bet_logged', { referenceId: `bet:${row.id}`, detail: insertBody.horse_name }).catch(() => {});
  }
  return NextResponse.json(data);
}

export async function PATCH(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const patch = sanitizePatch(body);
  if (!patch || !Object.keys(patch).length) return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });

  // id AND clerk_id -- never id alone -- so a bet that isn't the session
  // user's own (or doesn't exist) never gets touched.
  const { ok, data } = await sbAdminRaw(
    `bet_log?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', prefer: 'return=representation', body: patch },
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data[0]);
}

export async function DELETE(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';
  const id = searchParams.get('id');

  if (all) {
    const { ok, data } = await sbAdminRaw(
      `bet_log?clerk_id=eq.${encodeURIComponent(userId)}`,
      { method: 'DELETE', prefer: 'return=representation' },
    );
    if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
    return NextResponse.json({ deleted: (data || []).length });
  }

  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { ok, data } = await sbAdminRaw(
    `bet_log?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE', prefer: 'return=representation' },
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: 1 });
}
