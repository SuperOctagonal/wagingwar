'use client';
import { useEffect } from 'react';
import { CONSENT_EVENT, getConsent, hasConsent } from '@/lib/analytics';
import { FIRST_TOUCH_KEY, readUtm } from '@/lib/attribution';

// Ad attribution capture, mounted once in the root layout.
//
// 1. Landing hit: if the URL carries utm_content, send an anonymous beacon
//    to /api/attribution/landing (utm_content only; the server stores it
//    with a timestamp, nothing else). Sent for every visitor -- nothing is
//    stored on the device for this.
// 2. First touch: the UTMs + landing path are kept in localStorage ONLY if
//    the visitor has accepted cookies (now, or later on this same page
//    view). Never overwritten (first touch wins). Removed if they decline.
//    SignupTracker sends it to /api/attribution/signup on sign-up.

let beaconSentFor = null; // one landing hit per full page load (StrictMode runs effects twice)

function saveFirstTouch(touch) {
  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  } catch { /* storage blocked */ }
}

function clearFirstTouch() {
  try { localStorage.removeItem(FIRST_TOUCH_KEY); } catch { /* storage blocked */ }
}

export default function AttributionCapture() {
  useEffect(() => {
    if (getConsent() === 'declined') clearFirstTouch();

    const utm = readUtm(window.location.search);
    if (utm?.utm_content && beaconSentFor !== window.location.href) {
      beaconSentFor = window.location.href;
      const body = JSON.stringify({ utm_content: utm.utm_content });
      if (!navigator.sendBeacon?.('/api/attribution/landing', body)) {
        fetch('/api/attribution/landing', { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    }

    const touch = utm ? { ...utm, landing_path: window.location.pathname } : null;
    if (touch && hasConsent()) saveFirstTouch(touch);

    const onConsent = () => {
      const c = getConsent();
      if (c === 'granted' && touch) saveFirstTouch(touch);
      if (c === 'declined') clearFirstTouch();
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  return null;
}
