'use client';
import { useState, useEffect } from 'react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('ww_cookie_consent')) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem('ww_cookie_consent', '1');
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
