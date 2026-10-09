import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(req) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(stripe, event.data.object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(stripe, event.data.object);
      break;
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(stripe, event.data.object);
      break;
    default:
      break;
  }

  return new Response('OK', { status: 200 });
}

// Resolves the Clerk user for a Stripe object, preferring the
// clerk_user_id/client_reference_id this app itself stamped onto the
// subscription (or checkout session) at creation time -- see
// app/api/create-checkout-session/route.js (subscription_data.metadata.
// clerk_user_id + client_reference_id). Falls back to matching the Stripe
// customer's email against Clerk, which is the ONLY path available for
// subscriptions that predate this metadata (the 3 existing Pro
// subscribers) or that were created directly in the Stripe Dashboard.
async function resolveClerkUser(stripe, { clerkUserId, customerId }) {
  if (clerkUserId) {
    try {
      const user = await (await clerkClient()).users.getUser(clerkUserId);
      if (user) return user;
    } catch (err) {
      console.warn(`[stripe-webhook] clerk_user_id ${clerkUserId} did not resolve to a Clerk user: ${err.message}`);
    }
  }
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) return null;
  const result = await (await clerkClient()).users.getUserList({ emailAddress: [customer.email] });
  return result.data[0] ?? null;
}

// Backward-compatible price-id -> plan mapping. A known Lite price maps to
// 'lite'; anything else on an active/trialing subscription -- including a
// known Pro price AND any price id this function doesn't recognise at all
// -- maps to 'pro', so a webhook replay for one of the 3 pre-existing Pro
// subscribers (whose subscription was created before Lite existed, and
// whose price id this function has always known about) is unaffected, and
// so a genuinely unknown/future price id fails safe toward the more
// permissive plan rather than silently locking someone out. past_due is
// NOT active/trialing (unchanged from before Lite existed), so it still
// resolves to 'free' here, same as every other non-active status
// (canceled, incomplete_expired, unpaid, etc.).
function resolvePlanFromSubscription(sub) {
  const isActive = ['active', 'trialing'].includes(sub.status);
  if (!isActive) return 'free';

  const priceId = sub.items?.data?.[0]?.price?.id;
  const LITE_PRICE_IDS = [process.env.STRIPE_LITE_MONTHLY_PRICE_ID, process.env.STRIPE_LITE_ANNUAL_PRICE_ID];
  const PRO_PRICE_IDS = [process.env.STRIPE_PRO_MONTHLY_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID];

  if (LITE_PRICE_IDS.includes(priceId)) return 'lite';
  if (!PRO_PRICE_IDS.includes(priceId)) {
    console.warn(`[stripe-webhook] Unknown price id ${priceId} on active/trialing subscription ${sub.id} -- defaulting to 'pro'`);
  }
  return 'pro';
}

// Every handler below recomputes the full metadata object from the current
// Stripe object state and writes all fields every time (never a partial
// increment) -- so replaying the same event twice (Stripe's own retry
// behaviour) converges to the same final state rather than double-applying
// anything. trialWillEnd is explicitly reset to false by every handler
// except handleTrialWillEnd itself, so it naturally clears on the next real
// subscription-state change rather than needing its own separate clear path.
async function writePlanMetadata(user, { customerId, sub, trialWillEnd = false }) {
  await (await clerkClient()).users.updateUserMetadata(user.id, {
    publicMetadata: {
      stripeCustomerId: customerId,
      plan: resolvePlanFromSubscription(sub),
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      trialWillEnd,
      // Unix seconds, null once the subscription leaves 'trialing' -- lets
      // the Settings page show "trial ends on <date>" without a live
      // Stripe call.
      trialEnd: sub.status === 'trialing' ? sub.trial_end : null,
    },
  });
}

async function handleCheckoutCompleted(stripe, session) {
  const customerId = session.customer;
  if (!customerId || !session.subscription) return;

  // Fetch the real subscription so we write accurate status/price-id, not
  // session-level fields.
  const sub = await stripe.subscriptions.retrieve(session.subscription);

  const user = await resolveClerkUser(stripe, {
    clerkUserId: session.client_reference_id || sub.metadata?.clerk_user_id,
    customerId,
  });
  if (!user) {
    console.warn(`[stripe-webhook] checkout.session.completed: no Clerk user found for customer ${customerId}`);
    return;
  }

  await writePlanMetadata(user, { customerId, sub });
}

async function handleSubscriptionChange(stripe, subscription) {
  const customerId = subscription.customer;
  const user = await resolveClerkUser(stripe, {
    clerkUserId: subscription.metadata?.clerk_user_id,
    customerId,
  });
  if (!user) {
    console.warn(`[stripe-webhook] ${subscription.status === 'canceled' ? 'subscription.deleted' : 'subscription change'}: no Clerk user found for customer ${customerId}`);
    return;
  }

  // customer.subscription.deleted: subscription.status is 'canceled' here,
  // which resolvePlanFromSubscription treats as not-active -- plan becomes
  // 'free' automatically via the same shared path, no special-case branch.
  await writePlanMetadata(user, { customerId, sub: subscription });
}

async function handleTrialWillEnd(stripe, subscription) {
  const customerId = subscription.customer;
  const user = await resolveClerkUser(stripe, {
    clerkUserId: subscription.metadata?.clerk_user_id,
    customerId,
  });
  if (!user) {
    console.warn(`[stripe-webhook] trial_will_end: no Clerk user found for customer ${customerId}`);
    return;
  }

  console.log(`[stripe-webhook] trial_will_end for subscription ${subscription.id} (customer ${customerId}), trial_end=${subscription.trial_end}`);
  // Flag only -- an actual reminder email is a separate, later task. The
  // flag itself is read by the Settings page to show a "trial ends on..."
  // notice (see hooks/usePlan.js / app/settings/page.js).
  await writePlanMetadata(user, { customerId, sub: subscription, trialWillEnd: true });
}
