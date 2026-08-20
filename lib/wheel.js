// Daily Prize Wheel -- prize resolution and spin bookkeeping. Framed as a
// loyalty-program spin, not a gambling mechanic: prizes are non-cash,
// non-purchasable (spins are never bought, only earned via daily login or
// a successful referral), and the outcome is resolved server-side BEFORE
// the client renders anything -- the wheel animation always spins to a
// predetermined, already-decided result. There is no client-side
// randomness anywhere in this file's consumers.
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

export const STREAK_SHIELD_BADGE = 'Loyal Punter'; // cosmetic badge prize name

// Weighted prize table -- credits only (no cash equivalent anywhere),
// streak shields (protects login_streak if a day is missed), and a
// cosmetic badge. Weights sum to 100 for readability.
const PRIZE_TABLE = [
  { type: 'credits', value: 10,  weight: 30 },
  { type: 'credits', value: 25,  weight: 30 },
  { type: 'credits', value: 50,  weight: 15 },
  { type: 'credits', value: 100, weight: 5 },
  { type: 'streak_shield', value: 1, weight: 10 },
  { type: 'badge', value: STREAK_SHIELD_BADGE, weight: 10 },
];
const TOTAL_WEIGHT = PRIZE_TABLE.reduce((s, p) => s + p.weight, 0);

export function resolvePrize() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const prize of PRIZE_TABLE) {
    if (r < prize.weight) return prize;
    r -= prize.weight;
  }
  return PRIZE_TABLE[0]; // unreachable in practice, safe fallback
}

// Human-readable label for the prize -- deliberately plain, loyalty-program
// language ("You received...", "Bonus credits") rather than gambling
// language ("You won!", "Jackpot!").
export function prizeLabel(prize) {
  if (prize.type === 'credits') return `${prize.value} bonus credits`;
  if (prize.type === 'streak_shield') return 'Streak Shield — protects your streak if you miss a day';
  if (prize.type === 'badge') return `"${prize.value}" badge`;
  return 'Prize';
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[wheel]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

export async function getWheelStatus(clerkId) {
  const accountRows = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=last_spin_date,bonus_spins,streak_shields,badges`);
  const account = accountRows?.[0] || { last_spin_date: null, bonus_spins: 0, streak_shields: 0, badges: [] };
  const date = todayISO();
  return {
    freeSpinAvailable: account.last_spin_date !== date,
    bonusSpinsAvailable: account.bonus_spins || 0,
    streakShields: account.streak_shields || 0,
    badges: account.badges || [],
  };
}

// Applies a prize to the account -- credits go through earnCredits (Pro 2x
// + balance cap, same central path as every other earn event); streak
// shields and badges are simple counters/arrays, no gameplay-affecting
// spend exists for either.
export async function applyPrize(clerkId, prize, { isPro = false } = {}) {
  const { earnCredits } = await import('./credits');
  if (prize.type === 'credits') {
    return earnCredits(clerkId, prize.value, 'wheel', { isPro });
  }
  if (prize.type === 'streak_shield') {
    const rows = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=streak_shields`);
    const current = rows?.[0]?.streak_shields || 0;
    await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { streak_shields: current + 1 } });
    return { streakShields: current + 1 };
  }
  if (prize.type === 'badge') {
    const rows = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=badges`);
    const current = rows?.[0]?.badges || [];
    if (!current.includes(prize.value)) {
      await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { badges: [...current, prize.value] } });
    }
    return { badges: current.includes(prize.value) ? current : [...current, prize.value] };
  }
  return {};
}

// Grants a bonus spin -- called once a referral system exists and confirms
// a successful referral (no such trigger exists in this codebase yet; see
// the push-1 report for the same gap on the credits-referral bonus).
export async function grantBonusSpin(clerkId) {
  const rows = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=bonus_spins`);
  const current = rows?.[0]?.bonus_spins || 0;
  await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { bonus_spins: current + 1 } });
  return current + 1;
}
