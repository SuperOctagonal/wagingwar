'use client';
import { useState, useEffect } from 'react';
import { CONSENT_KEY, setConsent } from '@/lib/analytics';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
  }, []);

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
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2000,
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
