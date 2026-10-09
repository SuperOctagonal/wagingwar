import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth, clerkClient } from '@clerk/nextjs/server';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://wagingwar.com.au';

// plan+interval -> price id env var. Four real Stripe prices, one Checkout
// Session route -- replaces the old static Payment Link anchors in
// UpgradeModal, which couldn't express trial_period_days/
// payment_method_collection/metadata in code at all (those would have had
// to live in the Stripe Dashboard's own Payment Link config, invisible to
// this repo).
const PRICE_ENV_VAR = {
  lite:  { month: 'STRIPE_LITE_MONTHLY_PRICE_ID', year: 'STRIPE_LITE_ANNUAL_PRICE_ID' },
  pro:   { month: 'STRIPE_PRO_MONTHLY_PRICE_ID',  year: 'STRIPE_PRO_ANNUAL_PRICE_ID' },
};

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan;
  const interval = body?.interval;
  if (!['lite', 'pro'].includes(plan) || !['month', 'year'].includes(interval)) {
    return NextResponse.json({ error: "plan must be 'lite'|'pro' and interval must be 'month'|'year'" }, { status: 400 });
  }

  const envVarName = PRICE_ENV_VAR[plan][interval];
  const priceId = process.env[envVarName];
  if (!priceId) {
    return NextResponse.json({ error: `${envVarName} is not set` }, { status: 500 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set' }, { status: 500 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user?.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Never let a user with an existing active/trialing subscription start a
  // second trial -- Stripe would happily create a second subscription on
  // the same customer, which is never what "upgrade"/"downgrade" means
  // here. Upgrade/downgrade between Lite and Pro goes through the Billing
  // Portal (configured to allow switching between all four prices), not a
  // second Checkout Session.
  const existingCustomerId = user?.publicMetadata?.stripeCustomerId;
  if (existingCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: existingCustomerId, status: 'all', limit: 10 });
      const liveSub = subs.data.find(s => ['active', 'trialing'].includes(s.status));
      if (liveSub) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: existingCustomerId,
          return_url: `${SITE_URL}/settings`,
        });
        return NextResponse.json({ url: portalSession.url, portal: true });
      }
    } catch (err) {
      // A Stripe customer id that no longer resolves (deleted test customer,
      // etc.) shouldn't block a brand-new checkout -- fall through and let
      // Checkout Session creation below either reuse or recreate as needed.
      console.warn('[create-checkout-session] existing-subscription check failed:', err.message);
    }
  }

  try {
    // Reuse the existing Stripe customer (e.g. a previously-cancelled
    // subscriber resubscribing) rather than passing customer_email, which
    // would make Stripe create a brand-new customer object every time and
    // silently fragment one person's billing history across several
    // customer ids.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { clerk_user_id: userId },
      },
      payment_method_collection: 'always',
      client_reference_id: userId,
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: email || undefined }),
      success_url: `${SITE_URL}/settings?checkout=success`,
      cancel_url: `${SITE_URL}/settings?checkout=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session] Stripe error:', err.message);
    return NextResponse.json({ error: `Stripe error: ${err.message}` }, { status: 502 });
  }
}
