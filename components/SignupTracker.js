'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { CONSENT_EVENT, META_PIXEL_ID, UTM_CONTENT_KEY, hasConsent, gaEvent, fbqTrack } from '@/lib/analytics';
import { FIRST_TOUCH_KEY } from '@/lib/attribution';

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
// Same window /api/attribution/signup accepts.
const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      let utm = null;
      try { utm = sessionStorage.getItem(UTM_CONTENT_KEY); } catch { /* storage blocked */ }
      pending = { method: user.externalAccounts?.[0]?.provider || 'email', utm: utm || '(none)', ga: false, fb: false };
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    }

    // No consent yet: keep it pending; this effect re-runs when consent changes.
    if (!consented) return;

    const needFb = !!META_PIXEL_ID;
    const started = Date.now();
    let timer;
    const tick = () => {
      if (!pending.ga) pending.ga = gaEvent('sign_up', { method: pending.method, utm_content: pending.utm || '(none)' });
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

  // First-touch ad attribution -> /api/attribution/signup, once per new
  // account, only with cookie consent (the first touch itself is only ever
  // stored with consent, see components/AttributionCapture.js). Marked done
  // when the server accepts or rejects it for good; left to retry on a later
  // page load if the server can't store it right now.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || !consented) return;
    const doneKey = `ww_attr_sent_${user.id}`;
    let firstTouch = null;
    try {
      if (localStorage.getItem(doneKey)) return;
      firstTouch = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || 'null');
    } catch { return; }
    const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    if (!firstTouch || !createdAt || Date.now() - createdAt > ATTRIBUTION_WINDOW_MS) {
      try { localStorage.setItem(doneKey, '1'); } catch { /* storage blocked */ }
      return;
    }
    fetch('/api/attribution/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(firstTouch) })
      .then(r => { if (r.ok || r.status === 400 || r.status === 409) localStorage.setItem(doneKey, '1'); })
      .catch(() => {});
  }, [isLoaded, isSignedIn, user, consented]);

  return null;
}
