'use client';

// Single shared implementation of "start a Pro checkout" -- every upgrade
// entry point in the app (CheckoutButton, UpgradeModal, the auto-continue
// effect on /account after sign-up) calls this instead of hitting
// /api/create-checkout-session directly, so there's exactly one place that
// knows the request shape and exactly one place to fix if it ever changes.
export async function startCheckoutSession(interval) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'pro', interval }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Could not start checkout — try again');
  }
  window.location.href = data.url;
}

// Where a signed-out visitor goes instead: sign up, then land back on
// /account with enough in the URL (checkout=start&interval=...) for it to
// call startCheckoutSession itself once the user is actually signed in --
// Clerk's <SignUp/>/<SignIn/> components read a `redirect_url` query param
// natively, no change needed to those pages.
export function signUpRedirectUrl(interval) {
  const continueTo = `/account?checkout=start&interval=${interval}`;
  return `/sign-up?redirect_url=${encodeURIComponent(continueTo)}`;
}
