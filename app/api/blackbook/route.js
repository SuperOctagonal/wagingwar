import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { awardPointsServer } from '@/lib/awardPointsServer';

// Replaces app/blackbook/page.js's own reads/writes and the add-horse
// upsert in app/races/page.js (~line 3641). clerk_id always comes from the
// Clerk session; every PATCH/DELETE filters on id AND clerk_id, so a user
// can never edit or remove another user's blackbook row.

// blackbook.id is uuid, not bigint -- a /^\d+$/ check here always 400'd
// against every real id, so PATCH/DELETE (edit/remove) never actually
// worked in production. Confirmed against the live schema, 2026-10-18.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UPSERT_FIELDS = ['horse_name', 'venue', 'race_number', 'distance', 'class', 'note', 'tags', 'priority'];
const PATCH_FIELDS = ['note', 'tags', 'priority', 'notified_wins'];

function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function sanitizeUpsert(body) {
  const f = pick(body || {}, UPSERT_FIELDS);
  if (!f.horse_name || typeof f.horse_name !== 'string' || f.horse_name.length > 200) return null;
  if (f.note != null && String(f.note).length > 2000) return null;
  if (f.venue != null && String(f.venue).length > 200) return null;
  if (f.class != null && String(f.class).length > 100) return null;
  if (f.tags !== undefined && (!Array.isArray(f.tags) || f.tags.length > 20 || f.tags.some(t => String(t).length > 40))) return null;
  if (f.priority !== undefined && !(Number.isInteger(+f.priority) && +f.priority >= 0 && +f.priority <= 10)) return null;
  return { ...f, added_at: new Date().toISOString() };
}

function sanitizePatch(body) {
  const f = pick(body || {}, PATCH_FIELDS);
  if (f.note != null && String(f.note).length > 2000) return null;
  if (f.tags !== undefined && (!Array.isArray(f.tags) || f.tags.length > 20 || f.tags.some(t => String(t).length > 40))) return null;
  if (f.priority !== undefined && !(Number.isInteger(+f.priority) && +f.priority >= 0 && +f.priority <= 10)) return null;
  if (f.notified_wins !== undefined && !Array.isArray(f.notified_wins)) return null;
  if (!Object.keys(f).length) return null;
  return { ...f, updated_at: new Date().toISOString() };
}

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(`blackbook?clerk_id=eq.${encodeURIComponent(userId)}&order=added_at.desc`);
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}

export async function POST(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const upsertBody = sanitizeUpsert(body);
  if (!upsertBody) return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });
  upsertBody.clerk_id = userId; // forced, never from body

  const { ok, status, data } = await sbAdminRaw('blackbook', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: upsertBody,
  });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: status === 400 ? 400 : 502 });

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.id != null) {
    awardPointsServer(userId, 'blackbook_save', { referenceId: `blackbook:${row.id}`, detail: upsertBody.horse_name }).catch(() => {});
  }
  return NextResponse.json(data);
}

export async function PATCH(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const patch = sanitizePatch(body);
  if (!patch) return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });

  // blackbook_win points: award once per newly-added notified_wins entry
  // (the entry's own key, e.g. "VENUE||RACE||date", is the dedup
  // reference_id -- same key the client already used to track "have I
  // shown this win banner"). Diff against the row's current value first
  // so only genuinely new entries earn points, never a resend of the
  // same list.
  if (patch.notified_wins !== undefined) {
    const { data: before } = await sbAdminRaw(`blackbook?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}&select=notified_wins,horse_name`);
    const prevWins = new Set(before?.[0]?.notified_wins || []);
    const newWins = patch.notified_wins.filter(w => !prevWins.has(w));
    newWins.forEach(w => {
      awardPointsServer(userId, 'blackbook_win', { referenceId: `blackbook_win:${id}:${w}`, detail: before?.[0]?.horse_name }).catch(() => {});
    });
  }

  const { ok, data } = await sbAdminRaw(
    `blackbook?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}`,
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
  const id = searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { ok, data } = await sbAdminRaw(
    `blackbook?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE', prefer: 'return=representation' },
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: 1 });
}
