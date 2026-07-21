'use client';

import { useEffect, useState } from 'react';

// TEMPORARY, ?debug=1-gated diagnostic overlay for the mobile chrome-squeeze
// investigation. Never renders without that query param, so it's a no-op for
// real users. Remove this file and its one import in app/layout.js once the
// real numbers are captured and the actual fix is confirmed.
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const measure = () => {
      const rg = document.getElementById('mobile-rg-banner');
      const tab = document.getElementById('mobile-tab-bar');
      const rgRect = rg?.getBoundingClientRect();
      const tabRect = tab?.getBoundingClientRect();
      const rgHeight = rgRect?.height ?? 0;
      const tabHeight = tabRect?.height ?? 0;
      setInfo({
        innerHeight: window.innerHeight,
        rgHeight,
        rgPosition: rg ? getComputedStyle(rg).position : 'not found',
        tabHeight,
        tabPosition: tab ? getComputedStyle(tab).position : 'not found',
        availableHeight: window.innerHeight - rgHeight - tabHeight,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    // Elements may mount slightly after this component (e.g. isMobile resolves
    // async), so keep re-measuring for a few seconds rather than a single pass.
    const interval = setInterval(measure, 500);
    const stopTimer = setTimeout(() => clearInterval(interval), 5000);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(interval);
      clearTimeout(stopTimer);
    };
  }, [enabled]);

  if (!enabled || !info) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999999,
      background: 'rgba(220,38,38,0.95)', color: '#fff', fontSize: 10,
      fontFamily: 'monospace', padding: '4px 6px', lineHeight: 1.5,
    }}>
      <div>innerHeight: {info.innerHeight}px</div>
      <div>RG banner: {info.rgHeight}px — position: {info.rgPosition}</div>
      <div>Tab bar: {info.tabHeight}px — position: {info.tabPosition}</div>
      <div style={{ fontWeight: 700 }}>Available content height: {info.availableHeight}px</div>
    </div>
  );
}
