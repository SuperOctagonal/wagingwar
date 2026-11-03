'use client';
import { useState, useEffect, useRef } from 'react';
import { CONSENT_KEY, setConsent } from '@/lib/analytics';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
  }, []);

  // Layout only: publish the banner's rendered height as
  // --cookie-banner-height while it's showing, so pages can pad their
  // bottom past it (the /sign-up and /sign-in .auth-page rule). Cleared
  // when the banner goes away.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !ref.current) { root.style.removeProperty('--cookie-banner-height'); return; }
    const el = ref.current;
    const measure = () => root.style.setProperty('--cookie-banner-height', `${el.getBoundingClientRect().height}px`);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty('--cookie-banner-height'); };
  }, [visible]);

  if (!visible) return null;

  const accept = () => {
    setConsent('granted');
    setVisible(false);
  };

  const decline = () => {
    setConsent('declined');
    setVisible(false);
  };

  return (
    <div ref={ref} style={{
      // Sits above the RG line so the required 18+/Gambling Help text stays
      // readable: the fixed mobile RG banner + tab bar, else the desktop RG
      // strip + footer (both heights measured live by MobileChromeVars).
      position: 'fixed', bottom: 'var(--mobile-chrome-height, var(--desktop-footer-height, 0px))', left: 0, right: 0, zIndex: 2000,
      background: '#1f2937', color: '#d1d5db',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '10px 16px', fontSize: 12, flexWrap: 'wrap',
    }}>
      This site uses cookies to understand traffic.
      <button
        onClick={decline}
        style={{
          padding: '4px 14px', background: 'transparent', color: '#d1d5db',
          border: '1px solid #4b5563', borderRadius: 4, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Decline / Necessary only
      </button>
      <button
        onClick={accept}
        style={{
          padding: '4px 14px', background: '#00471b', color: '#fff',
          border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Accept
      </button>
    </div>
  );
}
