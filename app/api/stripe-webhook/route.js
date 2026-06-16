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
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const users = await clerkClient().users.getUserList({ limit: 100 });
  const user = users.data.find(u => u.publicMetadata?.stripeCustomerId === customerId);
  if (!user) {
    const customer = await stripe.customers.retrieve(customerId);
    const emailUsers = await clerkClient().users.getUserList({ emailAddress: [customer.email] });
    const emailUser = emailUsers.data[0];
    if (!emailUser) return new Response('User not found', { status: 200 });
    await clerkClient().users.updateUserMetadata(emailUser.id, { publicMetadata: { stripeCustomerId: customerId } });
    await updateUserPlan(emailUser.id, subscription);
    return new Response('OK', { status: 200 });
  }
  await updateUserPlan(user.id, subscription);
  return new Response('OK', { status: 200 });
}

async function updateUserPlan(userId, subscription) {
  const isActive = ['active', 'trialing'].includes(subscription.status);
  const plan = isActive ? 'pro' : 'free';
  await clerkClient().users.updateUserMetadata(userId, {
    publicMetadata: {
      plan,
      stripeCustomerId: subscription.customer,
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
    }
  });
}
