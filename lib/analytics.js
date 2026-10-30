// Shared consent + analytics helpers. Consent is stored in localStorage under
// 'ww_cookie_consent' as 'granted' | 'declined'. Nothing in GA/Pixel fires
// before 'granted' is recorded.

export const CONSENT_KEY = 'ww_cookie_consent';
export const CONSENT_EVENT = 'ww-consent-changed';

// sessionStorage: utm_content of the ad that led to a sign-up click, so the
// later sign_up event can carry it too (components/SignupCta.js).
export const UTM_CONTENT_KEY = 'ww_utm_content';

// Set in the environment only — never hard-code. Unset means no Pixel at all.
// Pixel IDs are numeric; stripping anything else keeps a bad value from
// being injected into the inline init script.
export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').replace(/\D/g, '');

export function getConsent() {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  // The old banner stored '1' on Accept — treat those users as granted.
  return value === '1' ? 'granted' : value;
}

export function hasConsent() {
  return getConsent() === 'granted';
}

export function setConsent(value) {
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { value } }));
}

// Both return true only if the event was actually handed to gtag / fbq.
export function gaEvent(name, params = {}) {
  if (!hasConsent()) return false;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
  window.gtag('event', name, params);
  return true;
}

export function fbqTrack(name, params = {}) {
  if (!hasConsent()) return false;
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;
  window.fbq('track', name, params);
  return true;
}
