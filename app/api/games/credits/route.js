import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getOrCreateAccount, claimDailyLogin } from '@/lib/credits';

async function resolveIsPro(userId) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user?.publicMetadata?.plan === 'pro';
}

// GET: current balance/streak (creates the account + grants the signup
// bonus on first-ever call for this user, no side effect on repeat calls).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const account = await getOrCreateAccount(userId);
  return NextResponse.json(account);
}

// POST: claim today's daily-login credits (idempotent -- returns
// claimed:false if already claimed today, never double-awards).
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const isPro = await resolveIsPro(userId);
  const result = await claimDailyLogin(userId, { isPro });
  if (!result) return NextResponse.json({ claimed: false });
  return NextResponse.json({ claimed: true, ...result });
}
