import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getWheelStatus, resolvePrize, prizeLabel, applyPrize } from '@/lib/wheel';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[games/wheel]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
  return NextResponse.json(await getWheelStatus(userId));
}

// POST: spin using either today's free spin or a bonus (referral-earned)
// spin. The prize is resolved server-side before any response goes to the
// client -- there is no "spin, then ask the server if you won" step the
// client could tamper with.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { source } = await req.json().catch(() => ({}));
  const status = await getWheelStatus(userId);
  const date = todayISO();

  if (source === 'bonus') {
    if (status.bonusSpinsAvailable <= 0) return NextResponse.json({ error: 'No bonus spins available' }, { status: 409 });
    await sb(`user_credits?clerk_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { bonus_spins: status.bonusSpinsAvailable - 1 },
    });
  } else {
    if (!status.freeSpinAvailable) return NextResponse.json({ error: 'Already spun today' }, { status: 409 });
    await sb(`user_credits?clerk_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { last_spin_date: date },
    });
  }

  const prize = resolvePrize();
  await sb('wheel_spins', {
    method: 'POST', prefer: 'return=minimal',
    body: { clerk_id: userId, date, prize_type: prize.type, prize_value: String(prize.value), source: source === 'bonus' ? 'referral_bonus' : 'daily_free' },
  });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isPro = user?.publicMetadata?.plan === 'pro';
  const result = await applyPrize(userId, prize, { isPro });

  return NextResponse.json({ prize, label: prizeLabel(prize), ...result });
}
