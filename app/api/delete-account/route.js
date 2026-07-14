import Stripe from 'stripe';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbDel(table, filter) {
  const res = await fetch(`${SURL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[delete-account] Supabase DELETE ${table} failed:`, res.status, body);
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // 1. Cancel active Stripe subscriptions
  try {
    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const customerId = clerkUser.publicMetadata?.stripeCustomerId;
    if (customerId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({ customer: customerId });
      await Promise.all(
        subs.data
          .filter(s => s.status !== 'canceled')
          .map(s => stripe.subscriptions.cancel(s.id))
      );
    }
  } catch (err) {
    console.error('[delete-account] Stripe cancellation error:', err);
    // Non-fatal: continue with deletion even if Stripe call fails
  }

  // 2. Delete all Supabase user data
  if (SURL && SKEY) {
    const enc = encodeURIComponent(userId);
    await Promise.all([
      sbDel('bet_log',       `clerk_id=eq.${enc}`),
      sbDel('comp_picks',    `clerk_id=eq.${enc}`),
      sbDel('user_settings', `clerk_id=eq.${enc}`),
      sbDel('blackbook',     `clerk_id=eq.${enc}`),
      sbDel('user_profiles', `clerk_id=eq.${enc}`),
      sbDel('user_badges',   `clerk_id=eq.${enc}`),
      sbDel('points_log',    `clerk_id=eq.${enc}`),
      sbDel('user_missions', `clerk_id=eq.${enc}`),
      sbDel('replies',       `clerk_id=eq.${enc}`),
      sbDel('posts',         `user_id=eq.${enc}`),
    ]);
  }

  // 3. Delete Clerk user (last — invalidates the session)
  try {
    await (await clerkClient()).users.deleteUser(userId);
  } catch (err) {
    console.error('[delete-account] Clerk deleteUser error:', err);
    return NextResponse.json({ error: 'Failed to delete account — contact support' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
