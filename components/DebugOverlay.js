'use client';

import { useEffect, useState } from 'react';

// TEMPORARY, ?debug=1-gated diagnostic overlay — round 3, races middle-column
// diagnosis. Checking the real rendered dims of RaceHeader's sub-blocks (to see
// whether it's genuinely wrapping or just intrinsically 2-3 stacked divs) and
// the middle-column scroll container's actual flex/overflow computed values.
// Remove this file and its one import in app/layout.js once confirmed fixed.
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const describe = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        id,
        top: Math.round(r.top), left: Math.round(r.left),
        width: Math.round(r.width), height: Math.round(r.height),
        flexWrap: cs.flexWrap, flexDirection: cs.flexDirection,
        flex: cs.flex, minHeight: cs.minHeight,
        overflowY: cs.overflowY, overflowX: cs.overflowX,
        clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
      };
    };

    const measure = () => {
      setInfo({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        rhOuter: describe('rh-outer'),
        rhLeftBlock: describe('rh-left-block'),
        rhTagsRow: describe('rh-tags-row'),
        rhRightBlock: describe('rh-right-block'),
        middleScroll: describe('races-middle-scroll'),
      });
    };

    measure();
    window.addEventListener('resize', measure);
    const interval = setInterval(measure, 500);
    const stopTimer = setTimeout(() => clearInterval(interval), 10000);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(interval);
      clearTimeout(stopTimer);
    };
  }, [enabled]);

  if (!enabled || !info) return null;

  const Row = ({ label, d }) => !d ? (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 2, paddingTop: 2 }}>{label}: not found</div>
  ) : (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 2, paddingTop: 2 }}>
      <b>{label}</b> (#{d.id})<br/>
      top:{d.top} left:{d.left} w:{d.width} h:{d.height}<br/>
      flex-wrap:{d.flexWrap} flex-dir:{d.flexDirection} flex:{d.flex} min-h:{d.minHeight}<br/>
      overflow-y:{d.overflowY} overflow-x:{d.overflowX} clientH:{d.clientHeight} scrollH:{d.scrollHeight}
    </div>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999999,
      background: 'rgba(220,38,38,0.97)', color: '#fff', fontSize: 9,
      fontFamily: 'monospace', padding: '4px 6px', lineHeight: 1.4,
      maxHeight: '75vh', overflowY: 'auto',
    }}>
      <div>innerWidth: {info.innerWidth}px / innerHeight: {info.innerHeight}px</div>
      <Row label="RaceHeader outer (rh-outer)" d={info.rhOuter} />
      <Row label="RaceHeader left block (title+tags)" d={info.rhLeftBlock} />
      <Row label="RaceHeader tags row" d={info.rhTagsRow} />
      <Row label="RaceHeader right block (condition+weights)" d={info.rhRightBlock} />
      <Row label="Middle column scroll container" d={info.middleScroll} />
    </div>
  );
}
