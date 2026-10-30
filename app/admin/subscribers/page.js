import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { isSiteAdmin } from '@/lib/admin';
import { getSubscriberData, signupsByDay } from '@/lib/adminSubscribers';
import { getAdData } from '@/lib/adminAds';
import { getDataHealth, healthDates } from '@/lib/adminDataHealth';
import { getTipHealth } from '@/lib/adminTipHealth';
import AdminDashboard from './AdminDashboard';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

// Always render per request: the gate below and the live Clerk/Stripe data
// must never be served from a cache.
export const dynamic = 'force-dynamic';

export default async function AdminSubscribersPage() {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) notFound();

  const dates = healthDates();
  const [{ rows, mrr, stripeError }, ads, health, tip] = await Promise.all([getSubscriberData(), getAdData(), getDataHealth(dates[0]), getTipHealth()]);
  // 120 days so the whole early-August spike is reachable; the panel
  // defaults to the last 90.
  const signups = signupsByDay(rows, 120);

  return <AdminDashboard rows={rows} mrr={mrr} stripeError={stripeError} signups={signups} ads={ads} health={health} healthDates={dates} tip={tip} generatedAt={new Date().toISOString()} />;
}
