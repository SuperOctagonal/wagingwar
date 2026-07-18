import { auth, clerkClient } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import { isSiteAdmin } from '@/lib/admin';
import SubscribersTable from './SubscribersTable';

export const metadata = {
  title: 'Subscribers | Admin',
  robots: { index: false, follow: false },
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const PAST_DUE_STATUSES = new Set(['past_due', 'unpaid', 'incomplete']);

function rankSubscription(sub) {
  if (ACTIVE_STATUSES.has(sub.status)) return 2;
  if (PAST_DUE_STATUSES.has(sub.status)) return 1;
  return 0;
}

async function fetchAllClerkUsers(clerk) {
  const limit = 100;
  const users = [];
  let offset = 0;
  // Safety cap to avoid an unbounded loop if something goes wrong upstream.
  for (let page = 0; page < 50; page++) {
    const { data } = await clerk.users.getUserList({ limit, offset });
    users.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return users;
}

async function fetchAllStripeSubscriptions(stripe) {
  const subs = [];
  let startingAfter;
  for (let page = 0; page < 50; page++) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer'],
    });
    subs.push(...result.data);
    if (!result.has_more) break;
    startingAfter = result.data[result.data.length - 1].id;
  }
  return subs;
}

async function getSubscriberRows() {
  const clerk = await clerkClient();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const [users, subscriptions] = await Promise.all([
    fetchAllClerkUsers(clerk),
    fetchAllStripeSubscriptions(stripe),
  ]);

  const byCustomerId = new Map();
  const byEmail = new Map();
  for (const u of users) {
    const customerId = u.publicMetadata?.stripeCustomerId;
    if (customerId) byCustomerId.set(customerId, u);
    const email = u.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    if (email) byEmail.set(email, u);
  }

  // Pick the single most relevant subscription per matched Clerk user
  // (prefer active/trialing, then past_due, then most recently created).
  const subByUserId = new Map();
  for (const sub of subscriptions) {
    const customer = sub.customer;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    let user = customerId ? byCustomerId.get(customerId) : null;
    if (!user) {
      const email = (typeof customer === 'string' ? null : customer?.email)?.toLowerCase();
      if (email) user = byEmail.get(email);
    }
    if (!user) continue;

    const existing = subByUserId.get(user.id);
    if (
      !existing ||
      rankSubscription(sub) > rankSubscription(existing) ||
      (rankSubscription(sub) === rankSubscription(existing) && sub.created > existing.created)
    ) {
      subByUserId.set(user.id, sub);
    }
  }

  return users.map(u => {
    const sub = subByUserId.get(u.id);
    let status = 'FREE';
    let trialEnd = null;
    let nextBilling = null;

    if (sub) {
      if (sub.status === 'trialing') {
        status = 'TRIAL';
        trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
      } else if (sub.status === 'active') {
        status = 'PRO';
        nextBilling = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      } else if (PAST_DUE_STATUSES.has(sub.status)) {
        status = 'PAST_DUE';
      } else if (sub.status === 'canceled') {
        status = 'CANCELLED';
      }
    }

    return {
      id: u.id,
      email: u.emailAddresses?.[0]?.emailAddress || '—',
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || '—',
      signupDate: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      status,
      trialEnd,
      nextBilling,
    };
  });
}

export default async function AdminSubscribersPage() {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) notFound();

  const rows = await getSubscriberRows();

  return <SubscribersTable rows={rows} />;
}
