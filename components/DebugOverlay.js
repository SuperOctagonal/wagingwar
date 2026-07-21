'use client';

import { useEffect, useState } from 'react';

// TEMPORARY, ?debug=1-gated diagnostic overlay — round 2. Checking whether the
// --mobile-chrome-height var and .mob-page padding-bottom are actually reaching
// the DOM, and whether a conflicting fixed-height rule (e.g. .comm-outer) is
// fighting it. Remove this file and its one import in app/layout.js once the
// real fix is confirmed on a real device.
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const measure = () => {
      const rootVar = getComputedStyle(document.documentElement).getPropertyValue('--mobile-chrome-height');

      const mobPageEls = Array.from(document.querySelectorAll('.mob-page')).map((el) => {
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          cls: el.className,
          paddingBottom: cs.paddingBottom,
          height: cs.height,
          overflowY: cs.overflowY,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        };
      });

      const commOuter = document.querySelector('.comm-outer');
      const commOuterInfo = commOuter ? {
        computedHeight: getComputedStyle(commOuter).height,
        computedOverflow: getComputedStyle(commOuter).overflow,
        hasMobPage: commOuter.classList.contains('mob-page'),
      } : null;

      setInfo({
        innerHeight: window.innerHeight,
        rootVar: rootVar || '(empty)',
        mobPageCount: mobPageEls.length,
        mobPageEls,
        commOuterInfo,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    const interval = setInterval(measure, 500);
    const stopTimer = setTimeout(() => clearInterval(interval), 8000);
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
      background: 'rgba(220,38,38,0.97)', color: '#fff', fontSize: 9,
      fontFamily: 'monospace', padding: '4px 6px', lineHeight: 1.4,
      maxHeight: '60vh', overflowY: 'auto',
    }}>
      <div>innerHeight: {info.innerHeight}px</div>
      <div style={{ fontWeight: 700 }}>--mobile-chrome-height: {info.rootVar}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>.mob-page elements found: {info.mobPageCount}</div>
      {info.mobPageEls.map((el, i) => (
        <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 2, paddingTop: 2 }}>
          [{i}] &lt;{el.tag}&gt; class=&quot;{el.cls}&quot;<br/>
          padding-bottom: <b>{el.paddingBottom}</b> | height: {el.height} | overflow-y: {el.overflowY}<br/>
          scrollHeight: {el.scrollHeight} | clientHeight: {el.clientHeight}
        </div>
      ))}
      {info.commOuterInfo && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 4, paddingTop: 2 }}>
          <b>.comm-outer</b>: height={info.commOuterInfo.computedHeight}, overflow={info.commOuterInfo.computedOverflow}, hasMobPage={String(info.commOuterInfo.hasMobPage)}
        </div>
      )}
    </div>
  );
}
