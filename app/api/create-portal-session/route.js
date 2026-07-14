import Stripe from 'stripe';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const clerk = await clerkClient();

  const clerkUser = await clerk.users.getUser(userId);
  let customerId = clerkUser.publicMetadata?.stripeCustomerId;
  console.log('[portal] userId:', userId, 'customerId from metadata:', customerId ?? 'MISSING');

  // Self-heal: if stripeCustomerId wasn't written (webhook bug), look up by email
  if (!customerId) {
    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      console.error('[portal] No email on Clerk user:', userId);
      return NextResponse.json({ error: 'No Stripe customer found for this account' }, { status: 404 });
    }
    try {
      const customers = await stripe.customers.list({ email, limit: 5 });
      const match = customers.data.find(c => !c.deleted);
      if (!match) {
        console.error('[portal] No Stripe customer found for email:', email);
        return NextResponse.json({ error: 'No Stripe customer found for this account' }, { status: 404 });
      }
      customerId = match.id;
      console.log('[portal] Recovered customerId by email:', customerId, 'writing back to Clerk');
      // Write it back so future requests don't need the lookup
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { ...clerkUser.publicMetadata, stripeCustomerId: customerId },
      });
    } catch (err) {
      console.error('[portal] Customer lookup error:', err?.message);
      return NextResponse.json({ error: 'Failed to locate Stripe account' }, { status: 500 });
    }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://wagingwar.com.au'}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[portal] Stripe error:', err?.message, '| type:', err?.type, '| code:', err?.code, '| customerId:', customerId, '| key prefix:', process.env.STRIPE_SECRET_KEY?.slice(0, 7));
    return NextResponse.json({ error: err?.message || 'Stripe error' }, { status: 500 });
  }
}
