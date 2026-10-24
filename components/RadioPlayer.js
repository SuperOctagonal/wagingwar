'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import useIsMobile from '@/hooks/useIsMobile';

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
  const isMobile = useIsMobile();
  const pathname = usePathname();
  // Community's own mobile FAB ("+ new post", app/community/page.js) sits
  // at bottom:72/right:16, 52px tall -- the only other fixed bottom-right
  // element anywhere in the app (checked: no page has a floating Bet
  // button, Odds chip or other floating control; /races, /mybets, /results
  // and /tip-record only have the shared RG banner + tab bar in this
  // corner). Stacking this above it here is the one place a plain bottom
  // offset isn't enough.
  const isCommunity = pathname?.startsWith('/community');

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
        // Bottom right on every page. On mobile, +52px clears My Bets' own
        // extra mobile section bar on top of the shared RG-banner+tab-bar
        // chrome (app/mybets/page.js) -- harmless slack on mobile pages
        // that don't have one. Desktop has no such bar and uses its own
        // measured --desktop-footer-height (MobileChromeVars.js) instead
        // of reusing the mobile figure -- the mobile stack is much taller
        // than the desktop RG-strip+footer, and applying it on desktop
        // left the pill floating well above the footer, over the Field
        // table's own scrollable content instead (confirmed live,
        // 2026-10-24: it sat on top of mid-table rows on /races). On
        // /community, stack above its FAB (bottom:72, 52px tall) instead
        // of either offset, so the two never overlap.
        right: 12,
        bottom: isCommunity
          ? 'calc(72px + 52px + 12px)'
          : isMobile
            ? 'calc(var(--mobile-chrome-height, 80px) + 52px + 12px)'
            : 'calc(var(--desktop-footer-height, 64px) + 12px)',
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
          aria-label="Open RSN 927 live racing radio"
          style={isMobile ? {
            // Icon-only on mobile -- less of the already-crowded
            // bottom-corner area to overlap anything else in. 44x44 is a
            // real tap target, not just the icon's own visual size.
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: '50%',
            background: '#00471b', color: '#fff', border: 'none',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          } : {
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 14px', minHeight: 44, borderRadius: 22,
            background: '#00471b', color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.2px',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <i className="ti ti-broadcast" style={{ fontSize: isMobile ? 16 : 14 }} />
          {!isMobile && 'RSN 927'}
        </button>
      )}
    </div>
  );
}
