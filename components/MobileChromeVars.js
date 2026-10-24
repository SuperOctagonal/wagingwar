'use client';

import { useEffect } from 'react';

// Measures the real rendered height of the fixed mobile RG banner + bottom tab
// bar and exposes it as --mobile-chrome-height on :root, so .mob-page's
// padding-bottom (globals.css) always clears them exactly instead of a
// hardcoded guess that drifts if either element's height ever changes.
// Falls back to the existing 80px CSS default until this runs (or if it
// can't find the elements, e.g. on desktop where they're not rendered).
//
// Also measures the desktop RG strip + footer (components/FooterChrome.js,
// in-flow rather than fixed on desktop, but still pinned to the viewport
// bottom by the body's own flex-column + overflow-hidden layout) and
// exposes that as --desktop-footer-height, for RadioPlayer.js to clear on
// desktop the same exact way.
export default function MobileChromeVars() {
  useEffect(() => {
    const measure = () => {
      const rg = document.getElementById('mobile-rg-banner');
      const tab = document.getElementById('mobile-tab-bar');
      const rgHeight = rg?.getBoundingClientRect().height ?? 0;
      const tabHeight = tab?.getBoundingClientRect().height ?? 0;
      if (rgHeight || tabHeight) {
        document.documentElement.style.setProperty('--mobile-chrome-height', `${rgHeight + tabHeight}px`);
      }

      const dRg = document.getElementById('desktop-rg-strip');
      const dFooter = document.getElementById('desktop-footer');
      const dHeight = (dRg?.getBoundingClientRect().height ?? 0) + (dFooter?.getBoundingClientRect().height ?? 0);
      if (dHeight) {
        document.documentElement.style.setProperty('--desktop-footer-height', `${dHeight}px`);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    // Elements may mount slightly after this effect (isMobile resolves async),
    // so keep re-measuring briefly rather than a single pass.
    const interval = setInterval(measure, 500);
    const stopTimer = setTimeout(() => clearInterval(interval), 5000);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      clearInterval(interval);
      clearTimeout(stopTimer);
    };
  }, []);

  return null;
}
