// Games credits engine -- a deliberately separate currency from
// lib/points.js's site-wide gamification points (different earn events,
// different cap, Pro multiplier applies here not there). Server-side only
// (uses SUPABASE_SERVICE_KEY) -- every route in app/api/games/* goes
// through this file rather than PATCHing user_credits directly, so the cap,
// the Pro multiplier, and the transaction log can never be forgotten by a
// single call site.
//
// Hard invariant, enforced structurally, not just by convention: credits
// are NEVER purchasable with real money and NEVER redeemable for it. There
// is no Stripe import anywhere in this file or anywhere under
// app/api/games/, and there must never be one. If a future change wants to
// let a user "buy" credits or cash them out, that is a deliberate product/
// legal decision requiring explicit sign-off -- it must not happen as a
// side effect of refactoring this file.
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

export const MAX_BALANCE = 50000;
export const SIGNUP_BONUS = 1000;
export const DAILY_LOGIN_BASE = 50;
export const DAILY_LOGIN_STREAK_STEP = 10;
export const DAILY_LOGIN_STREAK_CAP_DAY = 15; // bonus stops growing after day 15 (total caps at 200)
export const DAILY_LOGIN_MAX = 200;
export const REFERRAL_BONUS = 500;

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    console.error('[credits]', opts.method || 'GET', path, res.status, await res.text());
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// Creates the row if it doesn't exist yet (first-ever games interaction),
// granting the one-time signup bonus at that moment -- not doubled by Pro,
// since a signup bonus isn't an "earn event" in the ongoing-activity sense
// the 2x multiplier is meant for.
export async function getOrCreateAccount(clerkId) {
  const rows = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*`);
  if (rows && rows.length) return rows[0];

  const created = await sb('user_credits?select=*', {
    method: 'POST',
    prefer: 'return=representation,resolution=merge-duplicates',
    body: { clerk_id: clerkId, balance: SIGNUP_BONUS },
  });
  const account = created?.[0] || { clerk_id: clerkId, balance: SIGNUP_BONUS, login_streak: 0 };
  await logTransaction(clerkId, SIGNUP_BONUS, 'earn', 'signup');
  return account;
}

async function logTransaction(clerkId, amount, type, source) {
  await sb('credit_transactions', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { clerk_id: clerkId, amount, type, source },
  });
}

// Central earn path -- every credit-earning action in the games system
// calls this, so the Pro 2x multiplier and the MAX_BALANCE cap are applied
// exactly once, in exactly one place. isPro must be resolved by the caller
// from Clerk (this file has no Clerk access) and passed in explicitly.
export async function earnCredits(clerkId, baseAmount, source, { isPro = false } = {}) {
  if (!clerkId || !(baseAmount > 0)) return { awarded: 0, balance: null };
  const account = await getOrCreateAccount(clerkId);
  const multiplied = isPro ? baseAmount * 2 : baseAmount;
  const newBalance = Math.min(MAX_BALANCE, (account.balance || 0) + multiplied);
  const awarded = newBalance - (account.balance || 0); // may be less than `multiplied` if the cap clipped it
  if (awarded <= 0) return { awarded: 0, balance: account.balance || 0 };

  await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { balance: newBalance },
  });
  await logTransaction(clerkId, awarded, 'earn', source);
  return { awarded, balance: newBalance };
}

// Cosmetic-only spend path (badges/avatar flair, per the anti-inflation
// rule) -- no gameplay-affecting spend exists anywhere in this system.
export async function spendCredits(clerkId, amount, source) {
  if (!clerkId || !(amount > 0)) return { spent: 0, balance: null, ok: false };
  const account = await getOrCreateAccount(clerkId);
  if ((account.balance || 0) < amount) return { spent: 0, balance: account.balance || 0, ok: false };
  const newBalance = account.balance - amount;
  await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { balance: newBalance },
  });
  await logTransaction(clerkId, -amount, 'spend', source);
  return { spent: amount, balance: newBalance, ok: true };
}

// Daily login claim -- once per AEST calendar day. Streak increments on a
// consecutive day, resets to 1 if a day was missed. Returns null if
// already claimed today (idempotent from the caller's perspective).
export async function claimDailyLogin(clerkId, { isPro = false } = {}) {
  const account = await getOrCreateAccount(clerkId);
  const today = todayISO();
  if (account.last_daily_claim === today) return null; // already claimed

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const consecutive = account.last_daily_claim === yesterday;
  const newStreak = consecutive ? (account.login_streak || 0) + 1 : 1;

  const streakDay = Math.min(newStreak, DAILY_LOGIN_STREAK_CAP_DAY + 1); // day 16+ plateaus
  const baseAmount = Math.min(DAILY_LOGIN_BASE + (streakDay - 1) * DAILY_LOGIN_STREAK_STEP, DAILY_LOGIN_MAX);

  const { awarded, balance } = await earnCredits(clerkId, baseAmount, 'daily_login', { isPro });
  await sb(`user_credits?clerk_id=eq.${encodeURIComponent(clerkId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { last_daily_claim: today, login_streak: newStreak },
  });
  return { awarded, balance, streak: newStreak };
}
