'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { startCheckoutSession, signUpRedirectUrl } from '@/lib/checkout';

// Shared "go to Pro checkout" button used by every direct upgrade link in
// the app (homepage pricing card, /upcoming CTA, /account's two plan
// buttons) that isn't already opening UpgradeModal. Renders as a styled
// <button> (style/className passed straight through) so it can drop into
// any of those spots' existing markup unchanged.
//
// Signed-out: goes to sign-up first, with the chosen interval carried in
// the redirect_url query param so /account can pick it back up and
// continue to checkout automatically once the user is signed in (see
// lib/checkout.js's signUpRedirectUrl + app/account/page.js's
// checkout=start effect).
// Signed-in: posts straight to /api/create-checkout-session.
export default function CheckoutButton({ interval = 'year', children, style, className }) {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!isLoaded || loading) return;
    if (!isSignedIn) {
      router.push(signUpRedirectUrl(interval));
      return;
    }
    setLoading(true);
    try {
      await startCheckoutSession(interval);
    } catch (err) {
      console.error('[CheckoutButton]', err.message);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
      style={{ border: 'none', font: 'inherit', ...style, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
    >
      {loading ? 'Redirecting…' : children}
    </button>
  );
}
