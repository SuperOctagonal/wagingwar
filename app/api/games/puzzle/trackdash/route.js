import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { earnCredits } from '@/lib/credits';

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
  if (!res.ok) { console.error('[games/puzzle/trackdash]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Unlimited plays/day (per spec), but diminishing credit return to prevent
// grinding: plays 1-3 earn full credits, 4-6 earn a reduced amount, 7+ earn
// nothing further today -- score/leaderboard entries are still recorded
// every play regardless, only the credit reward tapers off.
function creditsForPlayNumber(playNumber) {
  if (playNumber <= 3) return 20;
  if (playNumber <= 6) return 8;
  return 0;
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { score } = await req.json().catch(() => ({}));
  if (!(score >= 0)) return NextResponse.json({ error: 'Invalid score' }, { status: 400 });

  const date = todayISO();
  const todayPlays = await sb(`puzzle_scores?clerk_id=eq.${encodeURIComponent(userId)}&game_type=eq.track_dash&date=eq.${date}&select=id`);
  const playNumber = (todayPlays?.length || 0) + 1;

  await sb('puzzle_scores', { method: 'POST', prefer: 'return=minimal', body: { clerk_id: userId, game_type: 'track_dash', score: Math.round(score), date } });

  const baseCredits = creditsForPlayNumber(playNumber);
  let awarded = 0, balance = null;
  if (baseCredits > 0) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const isPro = user?.publicMetadata?.plan === 'pro';
    const result = await earnCredits(userId, baseCredits, 'track_dash', { isPro });
    awarded = result.awarded;
    balance = result.balance;
  }

  return NextResponse.json({ playNumber, awarded, balance });
}
