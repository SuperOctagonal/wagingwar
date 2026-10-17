import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { ALL_KNOWN_BOOKMAKERS } from '@/lib/bookmakers';

// Replaces components/BookiesPanel.js's direct anon-key POST and
// lib/bookmakerStats.js's direct anon-key GET. clerk_id always comes from
// the Clerk session; DELETE filters on id AND clerk_id so a user can never
// remove another user's transaction.

const TYPES = new Set(['deposit', 'withdrawal', 'adjustment']);

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { ok, data } = await sbAdminRaw(
    `bookmaker_transactions?clerk_id=eq.${encodeURIComponent(userId)}&order=occurred_at.desc`,
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(data || []);
}

export async function POST(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bookmaker = body?.bookmaker;
  const type = body?.type;
  const amount = +body?.amount;
  const note = body?.note ?? null;
  const occurred_at = body?.occurred_at;

  if (!ALL_KNOWN_BOOKMAKERS.includes(bookmaker)) return NextResponse.json({ error: 'Unknown bookmaker' }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  if (!amount || !isFinite(amount) || Math.abs(amount) > 1_000_000) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  if (note != null && String(note).length > 500) return NextResponse.json({ error: 'Note too long' }, { status: 400 });
  if (!occurred_at || !/^\d{4}-\d{2}-\d{2}$/.test(occurred_at)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const signedAmount = type === 'withdrawal' ? -Math.abs(amount) : amount;

  const { ok, data } = await sbAdminRaw('bookmaker_transactions', {
    method: 'POST',
    prefer: 'return=representation',
    body: { clerk_id: userId, bookmaker, type, amount: signedAmount, note, occurred_at },
  });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json(Array.isArray(data) ? data[0] : data);
}

export async function DELETE(req) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { ok, data } = await sbAdminRaw(
    `bookmaker_transactions?id=eq.${id}&clerk_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE', prefer: 'return=representation' },
  );
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!data || !data.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: 1 });
}
