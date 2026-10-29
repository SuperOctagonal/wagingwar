'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { CONSENT_EVENT, META_PIXEL_ID, hasConsent, gaEvent, fbqTrack } from '@/lib/analytics';

// Clerk has no signup-completion webhook wired up, so we detect "just signed
// up" client-side: a freshly created account (createdAt within the last two
// minutes) that hasn't been tracked yet on this browser. Fires once per user.
//
// A detected signup is parked in sessionStorage as pending until consent is
// granted and gtag/fbq exist (both load lazily), so it can still fire later
// in the same session. It's only marked sent once actually dispatched.
const RECENT_MS = 2 * 60 * 1000;
const WAIT_MS = 10 * 1000;
const POLL_MS = 250;

function readPending(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

export default function SignupTracker() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasConsent());
    const onChange = () => setConsented(hasConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;

    const sentKey = `ww_signup_tracked_${user.id}`;
    const pendingKey = `ww_signup_pending_${user.id}`;
    if (localStorage.getItem(sentKey)) return;

    let pending = readPending(pendingKey);
    if (!pending) {
      const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
      if (!createdAt || Date.now() - createdAt > RECENT_MS) {
        // Not a new signup (existing user signing in) — mark as seen, never a signup.
        localStorage.setItem(sentKey, '1');
        return;
      }
      pending = { method: user.externalAccounts?.[0]?.provider || 'email', ga: false, fb: false };
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    }

    // No consent yet: keep it pending; this effect re-runs when consent changes.
    if (!consented) return;

    const needFb = !!META_PIXEL_ID;
    const started = Date.now();
    let timer;
    const tick = () => {
      if (!pending.ga) pending.ga = gaEvent('sign_up', { method: pending.method });
      if (needFb && !pending.fb) pending.fb = fbqTrack('CompleteRegistration', { method: pending.method });

      if (pending.ga && (!needFb || pending.fb)) {
        localStorage.setItem(sentKey, '1');
        sessionStorage.removeItem(pendingKey);
        return;
      }
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      // Gave up waiting: stays pending and retries on the next page load this session.
      if (Date.now() - started < WAIT_MS) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn, user, consented]);

  return null;
}
