'use client';
import { useState, useEffect } from 'react';

// Live racing radio (RSN 927, Melbourne) via TuneIn's own embeddable player
// -- a sanctioned embed TuneIn provides for other sites, no permission
// needed (not our content, just a convenience link to a free external
// broadcast). Visible to everyone, no Pro/auth gate.
//
// Global, persistent (mounted once in app/layout.js alongside TopNav/
// FooterChrome/CookieBanner, not per-page), default collapsed to a small
// pill so it's present-but-unobtrusive rather than always taking up
// 100px of screen real estate -- expanded/collapsed state remembered via
// localStorage, same pattern as CookieBanner's one-time-choice storage.
// Bottom offset uses --mobile-chrome-height (set by MobileChromeVars) so
// it always clears the mobile RG banner + tab bar exactly, rather than a
// guessed pixel value that drifts if either one's height changes.
const TUNEIN_EMBED_URL = 'https://tunein.com/embed/player/s3007/?background=dark';

export default function RadioPlayer() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('ww_radio_expanded') === '1') setExpanded(true);
    } catch {}
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem('ww_radio_expanded', next ? '1' : '0'); } catch {}
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 'calc(var(--mobile-chrome-height, 0px) + 12px)',
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      {expanded && (
        <div
          style={{
            width: 280,
            maxWidth: 'calc(100vw - 24px)',
            background: '#111827',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#1f2937' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-broadcast" style={{ fontSize: 13 }} />
              RSN 927 Live
            </span>
            <button
              onClick={toggle}
              aria-label="Minimise radio player"
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <i className="ti ti-chevron-down" style={{ fontSize: 16 }} />
            </button>
          </div>
          <iframe
            src={TUNEIN_EMBED_URL}
            style={{ width: '100%', height: 100, border: 0, display: 'block' }}
            scrolling="no"
            frameBorder="no"
            title="RSN 927 Live Racing Radio"
          />
        </div>
      )}
      {!expanded && (
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 20,
            background: '#00471b', color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.2px',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <i className="ti ti-broadcast" style={{ fontSize: 14 }} />
          RSN 927
        </button>
      )}
    </div>
  );
}
