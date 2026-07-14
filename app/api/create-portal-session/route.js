import Stripe from 'stripe';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const clerkUser = await clerkClient().users.getUser(userId);
  const customerId = clerkUser.publicMetadata?.stripeCustomerId;
  console.log('[portal] userId:', userId, 'customerId:', customerId ?? 'MISSING');

  if (!customerId) {
    return NextResponse.json({ error: 'No Stripe customer found for this account' }, { status: 404 });
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
