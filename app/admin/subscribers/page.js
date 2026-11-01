import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { isSiteAdmin } from '@/lib/admin';
import { getSubscriberData, signupsByDay } from '@/lib/adminSubscribers';
import { getAdData } from '@/lib/adminAds';
import { getDataHealth, healthDates } from '@/lib/adminDataHealth';
import { getTipHealth } from '@/lib/adminTipHealth';
import { withTimeout } from '@/lib/withTimeout.mjs';
import AdminDashboard from './AdminDashboard';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

// Always render per request: the gate below and the live Clerk/Stripe data
// must never be served from a cache.
export const dynamic = 'force-dynamic';

// Each Supabase-backed panel gets its own limit and its own failure: a slow
// or failing read shows as that panel's error, never takes the page down.
// (Clerk and Stripe are handled the same way inside getSubscriberData.)
const SUPABASE_TIMEOUT_MS = 15_000;
const settle = (promise, label, onError) =>
  withTimeout(promise, SUPABASE_TIMEOUT_MS, label).catch(err => onError(`${label} read failed: ${err.message}`));

export default async function AdminSubscribersPage() {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) notFound();

  const dates = healthDates();
  const [subs, ads, health, tip] = await Promise.all([
    getSubscriberData(),
    settle(getAdData(), 'Ads data (Supabase)', error => ({ ready: false, missing: false, error })),
    settle(getDataHealth(dates[0]), 'Data health (Supabase)', error => ({ ok: false, error })),
    settle(getTipHealth(), 'Tip Record (Supabase)', error => ({ ok: false, error })),
  ]);
  // 120 days so the whole early-August spike is reachable; the panel
  // defaults to the last 90.
  const signups = signupsByDay(subs.rows, 120);

  return (
    <AdminDashboard
      rows={subs.rows} mrr={subs.mrr} clerkError={subs.clerkError} stripeError={subs.stripeError}
      unmatchedSubscriptions={subs.unmatchedSubscriptions} capWarnings={subs.capWarnings}
      signups={signups} ads={ads} health={health} healthDates={dates} tip={tip} generatedAt={new Date().toISOString()}
    />
  );
}
