'use client';
import Link from 'next/link';
import { UTM_CONTENT_KEY, gaEvent } from '@/lib/analytics';

// Sign-up link that reports a consent-gated GA4 cta_signup_click with the
// ad's utm_content (read from the real URL — middleware rewrites keep it),
// so clicks can be compared with completed sign_up events per variant.

export default function SignupCta({ location, style, children }) {
  const onClick = () => {
    const utm = (new URLSearchParams(window.location.search).get('utm_content') || '').slice(0, 100);
    try { if (utm) sessionStorage.setItem(UTM_CONTENT_KEY, utm); } catch { /* storage blocked */ }
    gaEvent('cta_signup_click', { cta_location: location, utm_content: utm || '(none)' });
  };

  return (
    <Link href="/sign-up" onClick={onClick} style={style}>
      {children}
    </Link>
  );
}
