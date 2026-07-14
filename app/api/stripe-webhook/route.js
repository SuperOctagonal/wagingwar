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
    default:
      break;
  }

  return new Response('OK', { status: 200 });
}

// Targeted email lookup — no full-user-list scan.
async function findClerkUserByCustomerId(stripe, customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) return null;
  const result = await (await clerkClient()).users.getUserList({ emailAddress: [customer.email] });
  return result.data[0] ?? null;
}

async function handleCheckoutCompleted(stripe, session) {
  const customerId = session.customer;
  if (!customerId || !session.subscription) return;

  const user = await findClerkUserByCustomerId(stripe, customerId);
  if (!user) return;

  // Fetch real subscription so we write accurate status, not session.status.
  const sub = await stripe.subscriptions.retrieve(session.subscription);
  const isActive = ['active', 'trialing'].includes(sub.status);

  await (await clerkClient()).users.updateUserMetadata(user.id, {
    publicMetadata: {
      stripeCustomerId: customerId,
      plan: isActive ? 'pro' : 'free',
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
    },
  });
}

async function handleSubscriptionChange(stripe, subscription) {
  const customerId = subscription.customer;
  const user = await findClerkUserByCustomerId(stripe, customerId);
  if (!user) return;

  const isActive = ['active', 'trialing'].includes(subscription.status);

  await (await clerkClient()).users.updateUserMetadata(user.id, {
    publicMetadata: {
      stripeCustomerId: customerId,
      plan: isActive ? 'pro' : 'free',
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
    },
  });
}
