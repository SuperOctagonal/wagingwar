'use client';

import { useEffect, useRef, useState } from 'react';

// TEMPORARY, ?debug=1-gated diagnostic overlay — round 4. Left rail scrolls,
// right rail + middle column don't, despite identical grid/scroll CSS on all
// three — logging real touch events plus horizontal-overflow geometry to see
// whether this is a touch-interception problem or columns sitting outside the
// visible/interactive viewport. Remove this file and its one import in
// app/layout.js once confirmed fixed.
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [info, setInfo] = useState(null);
  const touchLogRef = useRef([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const colOf = (el) => {
      const left = document.getElementById('races-left-col');
      const mid = document.getElementById('races-middle-scroll');
      const right = document.getElementById('races-right-col');
      if (left && left.contains(el)) return 'LEFT';
      if (mid && mid.contains(el)) return 'MIDDLE';
      if (right && right.contains(el)) return 'RIGHT';
      return 'none of the 3 columns';
    };

    const logTouch = (type) => (e) => {
      const t = e.target;
      const entry = {
        type,
        time: new Date().toISOString().slice(11, 23),
        tag: t.tagName,
        id: t.id || '(none)',
        cls: (t.className && typeof t.className === 'string') ? t.className.slice(0, 60) : '(none)',
        column: colOf(t),
      };
      touchLogRef.current = [entry, ...touchLogRef.current].slice(0, 5);
      forceRender(n => n + 1);
    };

    const onStart = logTouch('touchstart');
    const onMove = logTouch('touchmove');
    document.addEventListener('touchstart', onStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onMove, { capture: true, passive: true });

    const describe = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { id, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), overflowY: cs.overflowY };
    };

    const measure = () => {
      const outer = document.getElementById('races-grid-outer');
      setInfo({
        innerWidth: window.innerWidth,
        bodyScrollWidth: document.body.scrollWidth,
        gridTemplateColumns: outer ? getComputedStyle(outer).gridTemplateColumns : '(no grid outer found)',
        outerRect: outer ? (() => { const r = outer.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; })() : null,
        left: describe('races-left-col'),
        middle: describe('races-middle-scroll'),
        right: describe('races-right-col'),
      });
    };

    measure();
    window.addEventListener('resize', measure);
    const interval = setInterval(measure, 500);
    const stopTimer = setTimeout(() => clearInterval(interval), 20000);
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('touchmove', onMove, { capture: true });
      window.removeEventListener('resize', measure);
      clearInterval(interval);
      clearTimeout(stopTimer);
    };
  }, [enabled]);

  if (!enabled || !info) return null;

  const overflowing = info.bodyScrollWidth > info.innerWidth;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999999,
      background: 'rgba(220,38,38,0.97)', color: '#fff', fontSize: 9,
      fontFamily: 'monospace', padding: '4px 6px', lineHeight: 1.4,
      maxHeight: '80vh', overflowY: 'auto',
    }}>
      <div>innerWidth: {info.innerWidth}px | body.scrollWidth: {info.bodyScrollWidth}px
        {' '}<b style={{ color: overflowing ? '#fde047' : '#86efac' }}>{overflowing ? '⚠ HORIZONTAL OVERFLOW' : 'no horizontal overflow'}</b>
      </div>
      <div>grid-template-columns: {info.gridTemplateColumns}</div>
      {info.outerRect && <div>grid outer: left:{info.outerRect.left} right:{info.outerRect.right} width:{info.outerRect.width}</div>}

      {['left', 'middle', 'right'].map(k => {
        const d = info[k];
        return (
          <div key={k} style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 2, paddingTop: 2 }}>
            <b>{k}</b>: {d ? `left:${d.left} right:${d.right} width:${d.width} overflow-y:${d.overflowY}` : 'not found'}
          </div>
        );
      })}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.5)', marginTop: 4, paddingTop: 2, fontWeight: 700 }}>Last 5 touch events:</div>
      {touchLogRef.current.length === 0 && <div>(none yet — touch the screen)</div>}
      {touchLogRef.current.map((e, i) => (
        <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 2, paddingTop: 2 }}>
          [{e.time}] {e.type} → &lt;{e.tag}&gt; id={e.id} col=<b>{e.column}</b><br/>
          class: {e.cls}
        </div>
      ))}
    </div>
  );
}
