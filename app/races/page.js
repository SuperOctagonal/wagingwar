'use client';

import { useState, useCallback, useRef, useMemo, useEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import usePlan from '@/hooks/usePlan';
import { hasFeature } from '@/lib/planFeatures';
import useIsMobile from '@/hooks/useIsMobile';
import useUserSettings from '@/hooks/useUserSettings';
import UpgradeModal from '@/components/UpgradeModal';
import BottomSheet from '@/components/BottomSheet';
import ShareMenu from '@/components/ShareMenu';
import PuntersEdgeCredit from '@/components/PuntersEdgeCredit';
import OddsTable from '@/components/OddsTable';
import { awardPoints } from '@/lib/points';
import { normaliseVenue, stripSponsorPrefix, SPONSOR_PREFIXES, resolveCrseAbbrev, isNzVenue } from '@/lib/venues';
import { isRacesAdmin, isSiteAdmin } from '@/lib/admin';
import { validateBetForm } from '@/lib/betValidation';
import { estimatePlacePrice, paidPlacesForFieldSize } from '@/lib/placePrice';
import { BOOKMAKERS as BOOKIES } from '@/lib/bookmakers';
import { PUNTERSEDGE_BOOKMAKER_COLUMNS, bookmakerNameForSlug, getPuntersEdgeSlug } from '@/lib/puntersedgeBookmakers';
import { fetchMarketMoveFlags, nameKey as marketMoveNameKey, MARKET_MOVE_THRESHOLD } from '@/lib/marketMoves';
import { sydneyDateTimeToInstant, viewerTimeZoneLabel } from '@/lib/raceTime';
import FirmingDriftingBadge from '@/components/FirmingDriftingBadge';
import { generatePaceAnalysis, classifyPaceShape } from '@/lib/paceAnalysis';
import ScrollHint from '@/components/ScrollHint';
import RaceTimeLocal from '@/components/RaceTimeLocal';
import { useScrollOverflow } from '@/hooks/useScrollOverflow';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { fetchAllRows } from '@/lib/fetchAllRows';

// Races-specific: the MeetingStrip/Ticker top-strip layout is a width
// decision, not a touch/coarse-pointer one — a landscape phone (e.g.
// 844x390, coarse pointer) is plenty wide enough for it, so this
// deliberately does NOT use useIsMobile.
function useIsNarrowWidth() {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isNarrow;
}
import {
  scoreGroup, blendFirstStarterLivePrices, calcPaceMap, pointsForPlace,
  formatRacingOdds, getDefaultWeights, FACTORS, FACTOR_GROUPS_DEF, GRP_KEYS, GRP_LABELS,
  computeValueEdge,
} from '@/lib/scoring';
import { calculateLiveOdds, CALIBRATION_ENABLED } from '@/lib/livePricing';
import { getConfidenceFlags } from '@/lib/confidence';

// ─── small helpers ────────────────────────────────────────────────────────────

function jShort(jname) {
  const parts = (jname || '').split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : (jname || '—');
}

function fmtDate(d) {
  if (!d) return '';
  const p = d.split('/');
  if (p.length === 3) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${p[0]} ${months[parseInt(p[1],10)-1]||p[1]}`;
  }
  return d;
}

function fmtSP(v) { return (v && !isNaN(+v) && +v > 0) ? `$${+v}` : '—'; }

function toISO(d) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

// Parses HH:MM or HH.MM (24hr) or H:MM/H.MM AM/PM (12hr) + DD/MM/YYYY date
// into a real instant. timeStr is a race_schedule-style post_time string --
// Sydney-clock (confirmed 2026-10-05, see lib/raceTime.js), not the naive
// runtime-local time this used to build (new Date(`${dateISO}T...`) with no
// zone suffix takes on whatever timezone the server/browser itself runs
// in) -- wrong basically everywhere this isn't Sydney/Melbourne, and this
// function drives the actual race-countdown timers shown to every user.
function parseRaceTime(timeStr, dateStr) {
  if (!timeStr) return null;
  const dateISO = toISO(dateStr) || new Date().toISOString().slice(0, 10);
  return sydneyDateTimeToInstant(dateISO, timeStr);
}

// Strip trailing country-of-origin suffix before scratchings key comparison
// e.g. "NAMARA (NZ)" → "NAMARA", "TRUE TO FORM (IRE)" → "TRUE TO FORM"
const stripCountry = n => (n || '').replace(/\s*\([A-Z]{2,4}\)$/i, '').trim();

async function fetchRaceResultsForDate(dateStr) {
  if (!SURL || !SKEY || !dateStr) return {};
  try {
    const res = await fetch(
      `${SURL}/rest/v1/race_results?select=*&date=eq.${dateStr}&order=venue,race_num,finish_pos`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const g = {};
    rows.forEach(row => {
      const normV = normaliseVenue(row.venue);
      const key = `${normV}||${String(row.race_num)}`;
      if (!g[key]) g[key] = { venue: normV, raceNum:row.race_num, runners:[] };
      if (row.finish_pos) g[key].runners.push({ place:row.finish_pos, name:row.horse_name, sp:row.sp||0, margin:row.margin||'' });
    });
    Object.values(g).forEach(x => x.runners.sort((a,b) => a.place - b.place));
    return g;
  } catch { return {}; }
}

function statColor(w, s) {
  if (!s) return '';
  const r = w / s;
  return r >= 0.25 ? 'text-emerald-600 font-semibold' : r >= 0.12 ? 'text-amber-600 font-semibold' : '';
}

function pct(w, s) { return s > 0 ? `${Math.round(w/s*100)}%` : '0%'; }
function statColor2(w, s) {
  if (!s) return '#111827';
  const r = w / s;
  return r >= 0.25 ? '#059669' : r >= 0.12 ? '#d97706' : '#111827';
}

function pipStyle(n) {
  if (n === 1) return { background: '#fbbf24', color: '#78350f' };
  if (n === 2) return { background: '#d1d5db', color: '#374151' };
  if (n === 3) return { background: '#cd7f32', color: '#fff' };
  return { background: '#f3f4f6', color: '#374151' };
}

function classChangeEl(cc) {
  if (cc === 'up') return <span className="ml-1 text-[8px] font-extrabold bg-emerald-100 text-emerald-700 rounded px-1">▲ UP</span>;
  if (cc === 'dn') return <span className="ml-1 text-[8px] font-extrabold bg-red-100 text-red-700 rounded px-1">▼ DN</span>;
  return null;
}

const TC_OPTIONS = [
  { key: 'good',      label: 'Good',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { key: 'soft',      label: 'Soft',   bg: 'bg-sky-100',     text: 'text-sky-700' },
  { key: 'heavy',     label: 'Heavy',  bg: 'bg-slate-200',   text: 'text-slate-700' },
  { key: 'synthetic', label: 'Synth',  bg: 'bg-purple-100',  text: 'text-purple-700' },
];

const GRP_LABEL_TO_KEY = { 'Form': 'form', 'Speed': 'speed', 'Conditions': 'cond', 'Connections': 'conn' };

function weightsByGroup(group) {
  const grpKey = GRP_LABEL_TO_KEY[group];
  if (!grpKey) return getDefaultWeights();
  const grpFactors = new Set((FACTOR_GROUPS_DEF.find(g => g.key === grpKey)?.factors || []).map(f => f.key));
  const w = {};
  FACTORS.forEach(f => { if (!f.scoreZero) w[f.key] = grpFactors.has(f.key) ? 10 : 3; });
  return w;
}

const PACE_ROLES = [
  { label: 'Leader',     color: '#00b050' },
  { label: 'Presser',    color: '#7ec820' },
  { label: 'Midfield',   color: '#ffc000' },
  { label: 'Closer',     color: '#ff8000' },
  { label: 'Backmarker', color: '#dc3545' },
];
const PACE_ROLE_ABBR = { Leader: 'Ldr', Presser: 'Pres', Midfield: 'Mid', Closer: 'Clo', Backmarker: 'Bkm' };

// Compact meeting-wide Pace Bias bar for the race-selector row — same
// points-based scoring as the Results page's TrackBiasPanel (see
// pointsForPlace in lib/scoring.js), just a horizontal segmented-bar
// layout instead of Results' vertical per-role list. Segment width is
// each role's share of total points awarded so far today (not relative to
// the top role), so it directly matches the % shown on hover and always
// sums to ~100% across the five segments.
function PaceBiasBar({ roles }) {
  const [showTip, setShowTip] = useState(false);
  const [tipPos, setTipPos] = useState(null);
  const triggerRef = useRef(null);
  const total = roles ? PACE_ROLES.reduce((s, r) => s + (roles[r.label] || 0), 0) : 0;
  // No data yet (e.g. no race at this meeting has resulted) -- roles is
  // always a non-null {Leader:0,...} object from RacesPageInner, never
  // actually null, so this must check the real signal (zero total) rather
  // than roles' own truthiness, or the bar/label never hide.
  if (!roles || total === 0) return null;

  // The tooltip is portaled to document.body rather than rendered inline,
  // positioned via the trigger's live viewport coordinates. It has to be --
  // this row (its direct parent) needs overflow-x:auto for horizontal
  // scrolling when a venue has many races, which per the CSS overflow spec
  // silently forces overflow-y to auto too (confirmed via getComputedStyle,
  // not assumed), clipping an absolutely-positioned bottom:100% tooltip down
  // to an invisible sliver at the row's own top edge. Portaling escapes that
  // (and any other ancestor's) clipping entirely.
  const showTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setTipPos({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 5 });
    setShowTip(true);
  };
  const hideTooltip = () => setShowTip(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginLeft: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Today&apos;s pace bias</span>
            <span ref={triggerRef} style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
              <i className="ti ti-info-circle" style={{ fontSize: 11, color: '#9ca3af', cursor: 'default' }} />
            </span>
            {showTip && tipPos && typeof document !== 'undefined' && createPortal(
              <div style={{
                position: 'fixed', bottom: tipPos.bottom, left: tipPos.left, transform: 'translateX(-50%)',
                width: 190, padding: '6px 8px', borderRadius: 5, background: '#1e2936', color: '#fff',
                fontSize: 9, fontWeight: 500, lineHeight: 1.35, textTransform: 'none', letterSpacing: 0,
                zIndex: 200, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}>
                Where the early speed sits today - which running style has the edge in this race
              </div>,
              document.body
            )}
          </div>
          <div style={{ width: 200, height: 22, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#f3f4f6' }}>
            {total > 0 ? PACE_ROLES.map(r => {
              const pts = roles[r.label] || 0;
              const pct = pts / total * 100;
              return pct > 0 ? <div key={r.label} title={`${r.label}: ${Math.round(pct)}%`} style={{ width: `${pct}%`, height: '100%', background: r.color }} /> : null;
            }) : null}
          </div>
          <div style={{ width: 200, display: 'flex', justifyContent: 'space-between' }}>
            {PACE_ROLES.map(r => (
              <span key={r.label} style={{ fontSize: 8, fontWeight: 600, color: r.color }}>{PACE_ROLE_ABBR[r.label]}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── upload zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handle = useCallback(file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onFile(e.target.result, file.name);
    reader.readAsText(file);
  }, [onFile]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        title="EveryRace CSV" /* admin-only tooltip; visible text below stays vendor-free, same standing rule as never naming Racing Australia publicly */
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={[
          'w-full max-w-md border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors',
          dragging ? 'border-brand bg-brand/5' : 'border-gray-300 bg-white hover:border-gray-400',
        ].join(' ')}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => handle(e.target.files[0])} />
        <i className="ti ti-upload text-3xl text-gray-400" />
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">Drop today&apos;s CSV here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        </div>
      </div>
    </div>
  );
}

// ─── shared rail helpers ──────────────────────────────────────────────────────

function countdownSecs(rc, now) {
  const at = parseRaceTime(rc.time, rc.date);
  return at ? Math.floor((at.getTime() - now) / 1000) : null;
}

function fmtCd(secs) {
  if (secs === null) return null;
  if (secs > 86400) { const d=Math.floor(secs/86400),h=Math.floor((secs%86400)/3600); return h?`${d}d ${h}h`:`${d}d`; }
  if (secs > 3600)  { const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60);   return m?`${h}h ${m}m`:`${h}h`; }
  if (secs > 0)     return `${Math.ceil(secs/60)}m`;
  if (secs >= -240) { const abs=Math.abs(secs), m=Math.floor(abs/60), s=abs%60; return m>0?`-${m}m ${s}s`:`-${s}s`; }
  return 'Off';
}

function venueAbbr(v) {
  const words = (v||'').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
}

const TC_PILL = {
  good:      { bg: '#16a34a', label: 'Good' },
  soft:      { bg: '#d97706', label: 'Soft' },
  heavy:     { bg: '#dc2626', label: 'Heavy' },
  synthetic: { bg: '#6d28d9', label: 'Synth' },
};

// ─── meeting strip (replaces LeftRail) ─────────────────────────────────────────

function chipCountdown(secs) {
  if (secs === null) return { label: '—', color: 'rgba(0,0,0,0.35)', bg: 'transparent' };
  if (secs > 0) return secs <= 600
    ? { label: fmtCd(secs), color: '#92400e', bg: '#fef3c7' }
    : { label: fmtCd(secs), color: 'rgba(0,0,0,0.5)', bg: 'rgba(0,0,0,0.04)' };
  // Only reached from the "every remaining race has jumped" fallback below
  // (the normal next-race path never passes a jumped race's secs in here
  // any more) -- "OFF -Nm" red for the first 5 minutes, then nothing
  // alarming (the chip switches to "Awaiting results" text instead).
  const abs = Math.abs(secs), m = Math.floor(abs / 60);
  return { label: `OFF -${m}m`, color: '#fff', bg: '#dc2626' };
}

// Diagonal-hatch fill for a dot/segment representing a race that's jumped
// but has no result yet -- distinct from both "resulted" (solid green) and
// "upcoming" (solid light grey), so the strip doesn't claim a race is
// still to come when it's actually just awaiting a result.
const HATCH_BG = 'repeating-linear-gradient(45deg, #cbd5e1 0, #cbd5e1 2px, #eef1ec 2px, #eef1ec 4px)';

function MeetingStrip({ allVenues, allRaces, selectedRaceKey, onSelect, trackConds, raceResults, abandonedVenues, calendarMismatchVenues, minRunners, dateToggle }) {
  const [now, setNow] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ww_pinned_meetings') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const togglePin = useCallback((venue, e) => {
    e.stopPropagation();
    setPinned(prev => {
      const next = prev.includes(venue) ? prev.filter(v => v !== venue) : [...prev, venue];
      try { localStorage.setItem('ww_pinned_meetings', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const bestRaceKey = useCallback((venue) => {
    const keys = allVenues[venue] || [];
    let bestUpcoming = null, bestSecs = Infinity;
    for (const k of keys) {
      const s = countdownSecs(allRaces[k], now);
      if (s !== null && s >= -240 && s <= 30) return k;
      if (s !== null && s > 0 && s < bestSecs) { bestSecs = s; bestUpcoming = k; }
    }
    return bestUpcoming || keys[0];
  }, [allVenues, allRaces, now]);

  const minCount = minRunners && minRunners !== 'None' ? +minRunners : 0;
  const venuePassesFilter = (venue) => {
    if (!minCount || showAll) return true;
    const keys = allVenues[venue] || [];
    return keys.some(k => (allRaces[k]?.horses?.filter(h => !h.scratched).length || 0) >= minCount);
  };

  const venues = Object.keys(allVenues);
  const pinnedVenues   = venues.filter(v =>  pinned.includes(v) && venuePassesFilter(v));
  const unpinnedVenues = venues.filter(v => !pinned.includes(v) && venuePassesFilter(v));
  const hiddenCount    = venues.filter(v => !venuePassesFilter(v)).length;
  const ordered = [...pinnedVenues, ...unpinnedVenues];

  const renderChip = (venue) => {
    const raceKeys = (allVenues[venue] || []).slice().sort((a, b) => (allRaces[a]?.num||0) - (allRaces[b]?.num||0));
    const normV = normaliseVenue(venue);
    const isAbandoned = (abandonedVenues || new Set()).has(normV);
    const isCalendarMismatch = !isAbandoned && (calendarMismatchVenues || new Set()).has(normV);
    const tc = !isAbandoned && !isCalendarMismatch && trackConds[venue];
    const pill = TC_PILL[tc];
    const isActive = raceKeys.some(k => k === selectedRaceKey);
    const isPinned = pinned.includes(venue);

    // "Next" must be the first race that hasn't jumped yet (s === null or
    // s > 0) -- a race that's already jumped but has no result is shown as
    // "awaiting result" (hatch), never picked as the chip's R#/countdown,
    // even if it's the first non-resulted race in the list.
    let nextRc = null, nextSecs = null, foundNext = false;
    let anyRemaining = false, allJumped = true;
    let lastJumpedSecs = -Infinity, lastJumpedRc = null; // closest-to-zero (most recent) jump among remaining races
    const dots = raceKeys.map(k => {
      const resulted = !!(raceResults || {})[`${normV}||${String(allRaces[k]?.num)}`];
      if (resulted) return { c: '#22c55e' };
      anyRemaining = true;
      const s = countdownSecs(allRaces[k], now);
      const jumped = s !== null && s <= 0;
      if (!jumped) allJumped = false;
      else if (s > lastJumpedSecs) { lastJumpedSecs = s; lastJumpedRc = allRaces[k]; }
      if (!foundNext && !jumped) {
        foundNext = true;
        nextRc = allRaces[k]; nextSecs = s;
        return { c: '#f59e0b' };
      }
      if (jumped) return { bg: HATCH_BG };
      return { c: '#e2e8f0' };
    });

    const allResulted = raceKeys.length > 0 && !anyRemaining;
    // Every remaining race has jumped and none are upcoming: show "Awaiting
    // results" once we're more than 5 minutes past the most recent jump,
    // otherwise still show that race's "OFF -Nm" (red, not yet alarming-free).
    const awaitingResults = anyRemaining && allJumped && lastJumpedSecs < -300;
    if (anyRemaining && allJumped) { nextRc = lastJumpedRc; nextSecs = lastJumpedSecs; }
    const cd = awaitingResults ? null : chipCountdown(nextSecs);

    return (
      <div
        key={venue}
        onClick={() => { const k = bestRaceKey(venue); if (k) onSelect(k); }}
        style={{
          flex: '1 1 0', minWidth: 148, maxWidth: 200, scrollSnapAlign: 'start',
          border: `1px solid ${isActive ? '#12834a' : '#dfe4dc'}`,
          background: isActive ? '#eefaf2' : '#fff',
          borderRadius: 8, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 5,
          cursor: 'pointer', flexShrink: 0, opacity: allResulted ? 0.55 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 11, letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <button onClick={e => togglePin(venue, e)} title={isPinned ? 'Unpin' : 'Pin to top'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, color: isPinned ? '#e0a800' : '#cdd5cb', flexShrink: 0 }}>★</button>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue}</span>
          </span>
          <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {isAbandoned ? (
              <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#6b7280', color: '#fff' }}>Abandoned</span>
            ) : isCalendarMismatch ? (
              <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#0891b2', color: '#fff' }} title="No longer listed on Racing Australia's calendar for today">Not on Calendar</span>
            ) : pill && (
              <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: pill.bg, color: '#fff' }}>{pill.label}</span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {dots.map((d, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: d.bg || d.c }} />)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'monospace' }}>
          {allResulted ? (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Resulted</span>
          ) : awaitingResults ? (
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Awaiting results</span>
          ) : (
            <>
              <span style={{ color: '#55645a' }}>{nextRc ? `R${nextRc.num}` : raceKeys.length ? `${raceKeys.length} races` : '—'}</span>
              <span style={{ fontWeight: 600, color: cd.color, background: cd.bg, borderRadius: 3, padding: '0 4px' }}>{cd.label}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #dfe4dc', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x proximity', flex: 1, minWidth: 0 }}>
        {ordered.map(renderChip)}
        {!showAll && hiddenCount > 0 && (
          <button onClick={() => setShowAll(true)} style={{ flexShrink: 0, alignSelf: 'center', fontSize: 10, fontWeight: 600, color: '#6b7a70', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
            +{hiddenCount} hidden
          </button>
        )}
        {showAll && minCount > 0 && (
          <button onClick={() => setShowAll(false)} style={{ flexShrink: 0, alignSelf: 'center', fontSize: 10, fontWeight: 600, color: '#6b7a70', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
            Filter
          </button>
        )}
      </div>
      {dateToggle && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{dateToggle}</div>}
    </div>
  );
}

// ─── ticker (replaces RightRail) ───────────────────────────────────────────────

function Ticker({ allRaces, allVenues, selectedRaceKey, onSelect, onOpenUpNext }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Only races that haven't jumped yet (s === null or s > 0) -- a race
  // past its jump time belongs in the Field table's "awaiting result"
  // state, not the ticker/NEXT RACE button, even briefly after it jumps.
  const keys = Object.values(allVenues).flat()
    .filter(k => {
      const s = countdownSecs(allRaces[k], now);
      return s === null || s > 0;
    })
    .sort((a, b) => {
      const sa = countdownSecs(allRaces[a], now) ?? 99999;
      const sb = countdownSecs(allRaces[b], now) ?? 99999;
      return sa - sb;
    });

  const next = keys[0] ? allRaces[keys[0]] : null;
  const pillKeys = keys.slice(0, 6);

  return (
    <div style={{ flexShrink: 0, background: '#0a2a18', color: '#cfe3d6', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 38, overflowX: 'auto', whiteSpace: 'nowrap' }}>
      {next && (
        <button
          onClick={() => onSelect(keys[0])}
          style={{ background: '#f5c542', color: '#2b2200', fontWeight: 700, border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, letterSpacing: '0.4px', cursor: 'pointer', flexShrink: 0, marginRight: 6 }}
        >
          ▶ NEXT RACE · {venueAbbr(next.venue)} R{next.num}
        </button>
      )}
      {pillKeys.map(k => {
        const rc = allRaces[k];
        const secs = countdownSecs(rc, now);
        const label = fmtCd(secs);
        const urgent = secs !== null && secs >= 0 && secs <= 600;
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            style={{
              display: 'flex', gap: 7, alignItems: 'center', border: `1px solid ${k === selectedRaceKey ? '#4ade80' : '#1f4d33'}`,
              borderRadius: 5, padding: '3px 9px', background: 'transparent', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 600, color: '#fff' }}>{venueAbbr(rc.venue)} R{rc.num}</span>
            <span style={{ fontFamily: 'monospace', color: urgent ? '#fcd34d' : '#cfe3d6' }}>{label}</span>
          </button>
        );
      })}
      <button onClick={onOpenUpNext} style={{ marginLeft: 'auto', fontSize: 11, color: '#8fb09b', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 2px' }}>
        All upcoming ›
      </button>
    </div>
  );
}

// ─── right rail (kept — reused inside the Ticker's "All upcoming" drawer) ─────

function RightRail({ allRaces, allVenues, selectedRaceKey, onSelect, isPro, userId, todayBets = {} }) {
  const [now, setNow] = useState(() => Date.now());
  // Client-only (same reasoning as RaceTimeLocal) -- shown once in the Time
  // column header's tooltip/label, since every row's own "showZone={false}"
  // time omits it to avoid colliding with the adjacent countdown column.
  const [tzLabel, setTzLabel] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setTzLabel(viewerTimeZoneLabel()); }, []);

  // Sort all races by countdown, include up to -4 min past
  const keys = Object.values(allVenues).flat()
    .filter(k => {
      const s = countdownSecs(allRaces[k], now);
      return s === null || s >= -240;
    })
    .sort((a, b) => {
      const sa = countdownSecs(allRaces[a], now) ?? 99999;
      const sb = countdownSecs(allRaces[b], now) ?? 99999;
      return sa - sb;
    })
    .slice(0, 18);

  const thS = { padding: '4px 8px', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.70)', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '0.5px solid rgba(255,255,255,0.15)', background: 'transparent', textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <aside style={{ width: 200, flexShrink: 0, background: '#fff', borderLeft: '0.5px solid #e5e7eb', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#00471b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '6px 10px', letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0 }}>
        Up Next
      </div>

      <div className="mob-page" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ background: '#1a2634' }}>
            <th style={{ ...thS, width: '52%' }}>Race</th>
            <th style={{ ...thS, textAlign: 'right', width: '24%' }} title={tzLabel ? `Times shown in your local time (${tzLabel})` : undefined}>Time</th>
            <th style={{ ...thS, textAlign: 'right', width: '24%', paddingRight: 10 }}>−</th>
          </tr>
        </thead>
        <tbody>
          {keys.flatMap((rk, idx) => {
            const rc    = allRaces[rk];
            const secs  = countdownSecs(rc, now);
            const label = fmtCd(secs);
            const off   = label === 'Off';
            const neg   = secs !== null && secs < 0 && !off;
            const urgent= secs !== null && secs >= 0 && secs <= 600;
            const cdColor = neg    ? '#ef4444'
                          : urgent ? '#059669'
                          :          '#111827';
            const betKey = `${normaliseVenue(rc.venue)}||${String(rc.num)}`;
            const betArr = isPro ? (todayBets[betKey] || []) : [];
            const hasBet = betArr.length > 0;

            const tdBase = { padding: '4px 8px', borderBottom: '0.5px solid #e5e7eb', ...(idx > 0 ? { borderTop: '1px solid #86efac' } : {}), verticalAlign: 'middle' };

            const rows = [
              <tr key={rk}
                onClick={() => onSelect(rk)}
                style={{ cursor: 'pointer', background: 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...tdBase, fontSize: 10, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {hasBet && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#00471b', marginRight: 4, verticalAlign: 'middle', flexShrink: 0 }} />}
                  <span style={{ color: '#111827', fontSize: 9 }}>{venueAbbr(rc.venue)}</span>
                  {' '}<span style={{ fontWeight: 600 }}>R{rc.num}</span>
                  {rc.dist && <span style={{ color: '#111827', fontSize: 9, marginLeft: 3 }}>{rc.dist}m</span>}
                </td>
                <td style={{ ...tdBase, textAlign: 'right', fontSize: 9, color: '#111827', whiteSpace: 'nowrap' }}><RaceTimeLocal dateISO={toISO(rc.date)} time={rc.time} showZone={false} /></td>
                <td style={{ ...tdBase, textAlign: 'right', fontWeight: (urgent || neg) ? 700 : 400, color: cdColor, fontSize: 10, whiteSpace: 'nowrap', paddingRight: 10 }}>
                  {label}
                </td>
              </tr>,
            ];

            if (hasBet) {
              rows.push(
                <tr key={`${rk}-bet`} style={{ background: '#f0fdf4' }}>
                  <td colSpan={3} style={{ padding: '2px 10px 4px 18px', fontSize: 9, color: '#059669', borderBottom: '0.5px solid #e5e7eb', fontStyle: 'italic' }}>
                    ↳ {betArr.join(', ')}
                  </td>
                </tr>
              );
            }

            return rows;
          })}
        </tbody>
      </table>
      </div>
    </aside>
  );
}

// ─── view tab bar ─────────────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'field',      label: 'Field',    icon: 'ti-layout-list' },
  { id: 'form',       label: 'Form',     icon: 'ti-horse-toy' },
  { id: 'pacemap',    label: 'Pace Map', icon: 'ti-map', premium: true },
  { id: 'movers',     label: 'Movers',   icon: 'ti-arrows-vertical', premium: true },
  { id: 'value',      label: 'Value',    icon: 'ti-target-arrow', premium: true },
  { id: 'sectionals', label: 'Sectionals', icon: 'ti-chart-line', locked: true },
];

// Open to everyone as of 2026-10-01 (PuntersEdge moved to a Plus plan,
// 140k credits/month, 200 req/min -- licensing no longer requires gating
// this behind admin). Always appended to VIEW_TABS now; see the git
// history for the admin-only version this replaced.
const ODDS_TAB = { id: 'odds', label: 'Odds', icon: 'ti-coin' };

function ViewTabBar({ view, setView, runnerCount, isPast, tabs = VIEW_TABS }) {
  return (
    <div className="flex items-center border-b border-gray-200 bg-white px-2 flex-shrink-0 h-10">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => !t.locked && setView(t.id)}
          className={[
            'flex items-center gap-1.5 px-3 h-full text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap',
            view === t.id
              ? 'text-brand border-brand'
              : t.locked
                ? 'text-gray-300 border-transparent cursor-not-allowed'
                : 'text-gray-500 border-transparent hover:text-gray-700',
          ].join(' ')}
        >
          <i className={`ti ${t.icon} text-xs`} />
          {t.label}
          {t.locked && <i className="ti ti-lock text-[9px] text-gray-300" />}
          {t.premium && !t.locked && <span className="text-[8px] text-amber-500 font-bold">★</span>}
        </button>
      ))}
      {!isPast && (
        <button
          onClick={() => window.location.reload()}
          title="Refresh page"
          className="ml-auto mr-2 flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
        >
          <i className="ti ti-refresh text-[14px]" />
        </button>
      )}
    </div>
  );
}

// ─── race countdown ───────────────────────────────────────────────────────────

function RaceCountdown({ rc }) {
  const [secsLeft, setSecsLeft] = useState(null);

  useEffect(() => {
    function compute() {
      const raceAt = parseRaceTime(rc.time, rc.date);
      if (!raceAt) { setSecsLeft(null); return; }
      setSecsLeft(Math.floor((raceAt.getTime() - Date.now()) / 1000));
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [rc.time, rc.date, rc.venue, rc.num]);

  const rcDateISO = toISO(rc.date);

  if (secsLeft === null) {
    return (
      <>
        {rc.time && <RaceTimeLocal dateISO={rcDateISO} time={rc.time} style={{ fontSize: 10, color: '#111827' }} />}
        {rc.date && <span style={{ fontSize: 10, color: '#111827' }}>{rc.date}</span>}
      </>
    );
  }

  if (secsLeft <= 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af' }}>
        {rc.time && <RaceTimeLocal dateISO={rcDateISO} time={rc.time} />}
        <span style={{ fontWeight: 700, color: '#A32D2D' }}>· Passed</span>
      </span>
    );
  }

  const h = Math.floor(secsLeft / 3600);
  const mins = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;
  const label = h > 0 ? `${h}h ${mins}m` : secsLeft < 300 ? `${mins}m ${s}s` : `${mins}m`;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#00471b' }}>
      <i className="ti ti-clock" style={{ fontSize: 9 }} />
      {rc.time && <RaceTimeLocal dateISO={rcDateISO} time={rc.time} style={{ fontWeight: 400, color: '#374151' }} />}
      <span>({label})</span>
    </span>
  );
}

// ─── race header ──────────────────────────────────────────────────────────────

function RaceHeader({ rc, trackCond, trackCondConfirmed, setTrackCond, weights, setWeights, runnerCount, onUpgrade, isPro, isMobile, onOpenGeneralBet }) {
  const [tcOpen, setTcOpen] = useState(false);
  return (
    <div id="rh-outer" className="px-2.5 md:px-4 py-1.5 md:py-2.5 bg-white flex flex-nowrap items-center justify-between gap-3 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '4px solid #00471B' }}>
      <div id="rh-left-block">
        <div className="flex items-baseline gap-2">
          <h2 className="font-bebas text-[19px] md:text-[22px] tracking-widest text-gray-900 leading-none">
            {rc.venue} R{rc.num}
          </h2>
          {rc.name && <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{rc.name}</span>}
        </div>
        <div id="rh-tags-row" className="flex flex-wrap items-center gap-1.5 mt-1">
          {rc.dist && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{rc.dist}m</span>}
          {rc.cls  && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{rc.cls}</span>}
          {rc.prize && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">${rc.prize}</span>}
          <RaceCountdown rc={rc} />
        </div>
      </div>
      <div id="rh-right-block" className="flex items-center gap-2 flex-wrap relative">
        {/* Track condition — desktop inline, mobile dropdown. trackCond always
            resolves to a real value ('good' default) so scoring always has
            something to score against — trackCondConfirmed tracks separately
            whether that value is real (DB-confirmed or user-picked) vs just the
            unset fallback, so an unconfirmed race (e.g. tomorrow, before the
            track is rated) shows a neutral "not yet confirmed" state instead of
            silently pretending Good is the confirmed condition. */}
        {!isMobile ? (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg p-0.5 border border-gray-100">
              {TC_OPTIONS.map(tc => (
                <button key={tc.key} onClick={() => { if (!isPro) { onUpgrade(); } else { setTrackCond(tc.key); } }}
                  className={['text-[9px] font-bold px-2 py-1 rounded-md transition-colors',
                    trackCondConfirmed && trackCond === tc.key ? `${tc.bg} ${tc.text}` : 'text-gray-400 hover:text-gray-600',
                  ].join(' ')}>
                  {tc.label}
                </button>
              ))}
            </div>
            {!trackCondConfirmed && (
              <span style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', whiteSpace: 'nowrap' }}>Not yet confirmed</span>
            )}
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setTcOpen(o => !o)}
              style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: trackCondConfirmed ? '#6b7280' : '#9ca3af', cursor: 'pointer', whiteSpace: 'nowrap', fontStyle: trackCondConfirmed ? 'normal' : 'italic' }}
            >
              {trackCondConfirmed ? (TC_OPTIONS.find(t => t.key === trackCond)?.label || 'Good') : 'Not confirmed'} ▾
            </button>
            {tcOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                {TC_OPTIONS.map(tc => (
                  <button
                    key={tc.key}
                    onClick={() => { if (!isPro) { onUpgrade(); setTcOpen(false); } else { setTrackCond(tc.key); setTcOpen(false); } }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: trackCondConfirmed && trackCond === tc.key ? '#00471b' : '#6b7280', background: trackCondConfirmed && trackCond === tc.key ? '#f0fdf4' : '#fff', border: 'none', cursor: 'pointer', borderBottom: tc.key !== TC_OPTIONS[TC_OPTIONS.length-1].key ? '1px solid #f3f4f6' : 'none' }}
                  >
                    {tc.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Weights */}
        <WeightsPanel weights={weights} setWeights={setWeights} onUpgrade={onUpgrade} />
        {/* General Log Bet — meeting/race/horse picker, for logging a bet
            without going via a specific runner row first */}
        <button
          onClick={onOpenGeneralBet}
          className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap"
          style={{ color: '#00471b', background: '#f0fdf4', borderColor: '#bbf7d0' }}
        >
          <i className="ti ti-plus text-xs" />
          Log Bet
        </button>
      </div>
    </div>
  );
}

// ─── weights panel ────────────────────────────────────────────────────────────

function WeightsPanel({ weights, setWeights, onUpgrade }) {
  const [open, setOpen]       = useState(false);
  const [openGrp, setOpenGrp] = useState(null);
  const [pos, setPos]         = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const isPro = useIsPro();
  const isMobile = useIsMobile();

  // RaceHeader's root (#rh-outer) has overflow-x-auto for narrow-viewport
  // horizontal scrolling, and per the CSS overflow spec that forces its
  // overflow-y to compute to 'auto' too (a non-'visible' x with a 'visible' y
  // isn't a legal combination) — so a `position: absolute` dropdown anchored
  // inside it gets clipped to the header row's own height on every date, not
  // just when the "Upcoming" banner is present. Anchoring via `position:
  // fixed` off the button's real screen coordinates escapes that clipping
  // entirely without touching #rh-outer's horizontal-scroll behavior.
  useEffect(() => {
    if (!open || isMobile || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [open, isMobile]);

  const panelInner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-700">Factor Weights</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><i className="ti ti-x text-xs" /></button>
      </div>
      {FACTOR_GROUPS_DEF.map(grp => (
        <div key={grp.key} className="mb-1.5">
          <button
            onClick={() => setOpenGrp(openGrp === grp.key ? null : grp.key)}
            className="w-full flex items-center justify-between text-[10px] font-semibold py-1 px-1.5 rounded hover:bg-gray-50 transition-colors"
            style={{ color: '#111827' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: grp.color }} />
              {grp.label}
              <span className="text-gray-400 font-normal ml-1">
                ({grp.factors.reduce((s,f) => s + (weights[f.key] ?? 10), 0)})
              </span>
            </div>
            <i className={`ti ti-chevron-${openGrp === grp.key ? 'up' : 'down'} text-xs text-gray-400`} />
          </button>
          {openGrp === grp.key && (
            <div className="pl-3 pr-1 pb-1 space-y-1.5 mt-1">
              {grp.factors.map(fd => (
                <div key={fd.key}>
                  <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                    <span>{fd.label}</span>
                    <span className="font-semibold" style={{ color: grp.color }}>{weights[fd.key] ?? 10}</span>
                  </div>
                  <input type="range" min={0} max={10} step={1}
                    value={weights[fd.key] ?? 10}
                    onChange={e => setWeights(w => ({ ...w, [fd.key]: +e.target.value }))}
                    className="w-full ww-slider appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #00471b 0%, #00471b ${(weights[fd.key] ?? 10) * 10}%, #e5e7eb ${(weights[fd.key] ?? 10) * 10}%, #e5e7eb 100%)` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[9px] text-gray-400">
        <span>Total weight</span>
        <span className="font-semibold text-gray-600">
          {FACTORS.filter(f => !f.scoreZero).reduce((s,f) => s + (weights[f.key]??10), 0)} / {FACTORS.filter(f=>!f.scoreZero).length * 10}
        </span>
      </div>
    </>
  );

  return (
    <div className="relative" ref={ref}>
      <button ref={btnRef} onClick={() => { if (!isPro) { onUpgrade(); } else { setOpen(v => !v); } }}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 border border-gray-200 bg-white rounded-md px-2.5 py-[5px] hover:bg-gray-50 transition-colors">
        <i className="ti ti-adjustments text-sm" />
        Weights
      </button>
      {open && isMobile && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(0,0,0,0.3)' }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 40, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.18)', width: 280, padding: 12, maxHeight: '80vh', overflowY: 'auto' }}>
            {panelInner}
          </div>
        </>
      )}
      {open && !isMobile && pos && (
        <div style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 40 }} className="bg-white border border-gray-200 rounded-xl shadow-xl w-64 p-3">
          {panelInner}
        </div>
      )}
    </div>
  );
}

// ─── pace legend bar ──────────────────────────────────────────────────────────

function PaceLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-4 py-1.5 bg-slate-50 border-b border-gray-100 text-[9px] text-gray-500 flex-shrink-0">
      {PACE_ROLES.map(r => (
        <span key={r.label} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }} />
          {r.label}
        </span>
      ))}
      <span className="ml-2 text-gray-400">· Hover group score for factor breakdown · Hover horse name for detail</span>
    </div>
  );
}

// ─── combined factors cell (with tooltip) ────────────────────────────────────

// Merged Form/Speed/Good(track)/Conn column -- default appearance is
// deliberately quiet (a single small dot, same visual weight as any other
// single-value column) rather than restating all 4 numbers inline, which
// would just recreate the four-column width this replaces. Hover reveals
// the same 4 labeled values the old separate columns showed, including
// each one's existing best/worst-in-field color coding. Still respects
// each factor's individual colVis toggle (a user can still hide e.g. just
// Speed via settings) -- only the ones currently visible are listed.
function CombinedFactorsCell({ runner, colVis, tcLabel }) {
  const [tip, setTip] = useState(false);
  const visibleKeys = GRP_KEYS.filter(gk => colVis[gk]);
  if (!visibleKeys.length) return null;
  return (
    <td
      className="px-[3px] py-[5px] text-center relative cursor-default select-none"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#cbd5e1' }} />
      {tip && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 text-white rounded-lg shadow-xl p-2 min-w-[140px] text-left pointer-events-none">
          {visibleKeys.map(gk => {
            const info = GRP_LABELS[gk];
            const label = gk === 'cond' ? tcLabel : info.label;
            const grpScore = runner.grpScores[gk];
            const isBest = runner._grpIsBest?.[gk];
            const isWorst = runner._grpIsWorst?.[gk];
            const valColor = isBest ? '#34d399' : isWorst ? '#f87171' : '#fff';
            return (
              <div key={gk} className="flex justify-between gap-3 text-[10px] py-0.5">
                <span style={{ color: info.color }}>{label}</span>
                <span style={{ color: valColor, fontWeight: 700 }}>{grpScore.total.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </td>
  );
}

// ─── horse hover popup (innerHTML injection) ─────────────────────────────────

function buildPopupHTML(h) {
  const bp = h['BP'] || '';
  const wt = h['Weight'] ? `${h['Weight']}kg` : '';
  const allow = h.allowance ? ` -${h.allowance}kg` : '';
  const starts = h.starts||0, wins = h.wins||0, secs = h.seconds||0, thirds = h.thirds||0;
  const places = wins + secs + thirds;
  const winPct = starts > 0 ? Math.round(wins/starts*100) : 0;
  const plcPct = starts > 0 ? Math.round(places/starts*100) : 0;

  const finArr = Array.isArray(h.lastFin) ? h.lastFin : [h.lastFin,null,null,null];
  const spArr  = Array.isArray(h.lastSP)  ? h.lastSP  : [h.lastSP,null,null,null];
  const pips   = finArr.slice(0,4).filter(v => v !== null && v !== undefined && v !== '').reverse();

  const pipSty = n => {
    if (n===1) return 'background:#fbbf24;color:#78350f';
    if (n===2) return 'background:#d1d5db;color:#374151';
    if (n===3) return 'background:#cd7f32;color:#fff';
    return 'background:#f3f4f6;color:#374151';
  };

  const pipsHTML = pips.length > 0
    ? pips.map(v => `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:700;${pipSty(+v)}">${+v>9?'0':v}</span>`).join('')
    : '<span style="font-size:9px;color:#4b5563">FS</span>';

  let runRowsHTML = '';
  for (let ri = 0; ri < 4; ri++) {
    const pos = finArr[ri];
    if (pos===null||pos===undefined||pos==='') continue;
    const dtl = h.lastRunDetails?.[ri];
    if (!dtl||!dtl.date) continue;
    const sp = spArr[ri];
    const spTxt = (sp&&!isNaN(+sp)&&+sp>0) ? `$${+sp}` : '—';
    const mgTxt = +pos===1 ? `Won ${dtl.margin||0}L` : (dtl.margin!=null ? `${dtl.margin}L` : '—');
    const mgColor = +pos===1?'#059669':+pos<=3?'#d97706':'#6b7280';
    const rowBg = ri%2===0?'#ffffff':'#f9fafb';
    const n = +pos;
    runRowsHTML += `<tr style="background:${rowBg}">
      <td style="padding:3px 6px;font-size:10px;color:#111827;white-space:nowrap">${fmtDate(dtl.date)}</td>
      <td style="padding:3px 4px;text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:700;${pipSty(n)}">${n>9?'0':pos}</span></td>
      <td style="padding:3px 6px;font-size:10px;color:#1f2937;white-space:nowrap">${dtl.crse||'—'}</td>
      <td style="padding:3px 4px"><span style="font-size:9px;padding:1px 4px;border-radius:4px;background:#eff6ff;color:#1d4ed8;white-space:nowrap">${dtl.cls||'—'}</span></td>
      <td style="padding:3px 6px;font-size:10px;color:#1f2937;white-space:nowrap">${dtl.dist?`${dtl.dist}m`:'—'}</td>
      <td style="padding:3px 6px;font-size:10px;color:#111827;white-space:nowrap">${dtl.wt?`${dtl.wt}kg`:'—'}</td>
      <td style="padding:3px 6px;font-size:10px;color:#111827;white-space:nowrap">${spTxt}</td>
      <td style="padding:3px 6px;font-size:10px;font-weight:${n===1?'600':'400'};color:${mgColor};white-space:nowrap">${mgTxt}</td>
    </tr>`;
  }

  // w/p left as raw (possibly undefined) — undefined means the field was
  // stripped for free tier, distinct from a genuine 0. Only treat a category
  // as "known" when both win and place counts are actually present, so a
  // free user never sees an allowed count (e.g. courseStarts) paired with a
  // fabricated 0W/0P from a stripped field in the same category.
  const stats = [
    { label:'Joc 12m',   w:h.jocLoc12mW,  p:h.jocLoc12mP,  s:h.jocLoc12mS  },
    { label:'Trn 12m',   w:h.trnLoc12mW,  p:h.trnLoc12mP,  s:h.trnLoc12mS },
    { label:'J/T Combo', w:h.jocTrnWins,  p:h.jocTrnPlaces, s:h.jocTrnStarts },
    { label:'Course',    w:h.courseWins,  p:h.coursePlaces, s:h.courseStarts },
    { label:'Distance',  w:h.distWins,    p:h.distPlaces,   s:h.distStarts   },
    { label:'1st-up',    w:h.prepRuns1W,  p:h.prepRuns1P,  s:h.prepRuns1S   },
  ];

  const stColor = (w, s, known) => !known || !s ? '#d1d5db' : w/s>=0.25 ? '#059669' : w/s>=0.12 ? '#d97706' : '#374151';
  const pct2    = (w, s) => s > 0 ? `${Math.round(w/s*100)}%` : '0%';

  const statsHTML = stats.map((st, i) => {
    const known = st.w !== undefined && st.p !== undefined;
    const s = st.s || 0, w = st.w || 0, p = st.p || 0;
    return `<div style="padding:8px 10px;${i%3!==0?'border-left:1px solid #f3f4f6;':''}${i>=3?'border-top:1px solid #f3f4f6;':''}">
      <div style="font-size:8px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${st.label}</div>
      <div style="font-size:11px;font-weight:600;color:${stColor(w,s,known)}">${known && s?`${s}S ${w}W ${p}P`:'—'}</div>
      <div style="font-size:9px;color:#374151;margin-top:1px">${known && s>0 ? `${pct2(w,s)} win · ${pct2(p,s)} plc` : ''}</div>
    </div>`;
  }).join('');

  const winColor = winPct>=25?'#059669':winPct>=12?'#d97706':'#4b5563';
  const plcColor = plcPct>=45?'#059669':plcPct>=25?'#d97706':'#4b5563';
  const jt = [jShort(h.jname), h.trainer].filter(Boolean).join(' · ');
  const bbPayload = encodeURIComponent(JSON.stringify({ name: h.name, venue: h._venue || '', raceNumber: h._raceNum || '', distance: h._dist || '', cls: h._cls || '' }));

  const sire2 = h.sire || '';
  const dam2 = h.dam || '';
  const gsire2 = h.gsire || h.grandsire || '';
  const winDists2 = Array.isArray(h.winDists) ? h.winDists.join(', ') : (h.winDists || '');
  const breedParts2 = [];
  if (sire2) breedParts2.push(`By ${sire2}`);
  if (dam2) breedParts2.push(`Dam: ${dam2}`);
  if (gsire2) breedParts2.push(`GSire: ${gsire2}`);
  if (winDists2) breedParts2.push(`Win dists: ${winDists2}`);
  const breedLine2 = breedParts2.join(' · ');
  const avgPrize2 = h['Average Prizemoney'];
  const avgPrizeFmt2 = avgPrize2 ? `$${Math.round(avgPrize2).toLocaleString('en-AU')}` : null;
  const estCareer2 = avgPrize2 && h.starts ? Math.round(avgPrize2 * h.starts) : null;
  const estCareerFmt2 = estCareer2 ? `$${estCareer2.toLocaleString('en-AU')}` : null;
  const prizeStr2 = [avgPrizeFmt2 && `Avg: ${avgPrizeFmt2}`, estCareerFmt2 && `Career Prizemoney: ${estCareerFmt2}`].filter(Boolean).join(' · ');

  return `
  <div style="background:#00471b;padding:5px 10px 3px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${bp?`<span style="background:rgba(29,78,216,0.7);color:white;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px">B${bp}</span>`:''}
      <span style="color:white;font-weight:700;font-size:12px">${h.name}</span>
      ${wt?`<span style="color:rgba(255,255,255,0.85);font-size:9px">${wt}${allow}</span>`:''}
      ${jt?`<span style="color:rgba(255,255,255,0.85);font-size:9px">· ${jt}</span>`:''}
    </div>
    <div style="display:flex;gap:10px;flex-shrink:0">
      <span style="font-size:9px;color:rgba(255,255,255,0.85)">Career <strong style="color:white">${starts}-${wins}-${secs}-${thirds}</strong></span>
      <span style="font-size:9px;font-weight:700;color:${winColor}">${winPct}% win</span>
      <span style="font-size:9px;font-weight:700;color:${plcColor}">${plcPct}% plc</span>
    </div>
  </div>
  ${(breedLine2 || prizeStr2) ? `<div style="background:#00471b;padding:0 10px 5px;display:flex;gap:16px;flex-wrap:wrap">
    ${breedLine2 ? `<span style="font-size:9px;color:rgba(255,255,255,0.55)">${breedLine2}</span>` : ''}
    ${prizeStr2 ? `<span style="font-size:9px;color:rgba(255,255,255,0.55)">${prizeStr2}</span>` : ''}
  </div>` : ''}
  ${runRowsHTML ? `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
    <tr style="background:#f9fafb">
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Date</td>
      <td style="padding:1px 4px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Pos</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Track</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Class</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Dist</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Wgt</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">SP</td>
      <td style="padding:1px 5px;font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase">Margin</td>
    </tr>
    ${runRowsHTML}
  </table>` : ''}
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr;border-top:1px solid #f3f4f6;background:#f9fafb">
    ${statsHTML}
  </div>
  <div style="padding:5px 10px;border-top:1px solid #f3f4f6;display:flex;gap:6px">
    <button onclick="window.__logBet&&window.__logBet(JSON.parse(decodeURIComponent('${bbPayload}')))" style="flex:1;padding:5px;background:#00471b;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer">+ Log Bet</button>
    <button onclick="window.__addToBlackbook&&window.__addToBlackbook(JSON.parse(decodeURIComponent('${bbPayload}')))" style="flex:1;padding:5px;background:#fff;color:#00471b;border:1px solid #00471b;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer">🔖 Blackbook</button>
  </div>`;
}

// ─── race result modal ────────────────────────────────────────────────────────

function RaceResultModal({ result, results, onClose }) {
  const norm = n => (n||'').replace(/\s*\([A-Z]{2,4}\)\s*$/i,'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  const sysRankMap = {};
  results.forEach((r, i) => { sysRankMap[norm(r.name)] = i + 1; });
  const placePs = p => {
    if (p===1) return { background:'#fbbf24', color:'#78350f' };
    if (p===2) return { background:'#d1d5db', color:'#374151' };
    if (p===3) return { background:'#fed7aa', color:'#92400e' };
    return { background:'#f3f4f6', color:'#9ca3af' };
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:10, overflow:'hidden', width:420, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ background:'#1e2936', padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>{result.venue} R{result.raceNum} — Results</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f1f5f9' }}>
              {['Pos','Horse','Rank','SP','Margin'].map(h => (
                <th key={h} style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#374151', textAlign:h==='Pos'||h==='Rank'?'center':'left', textTransform:'uppercase', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.runners.map(r => {
              const ps = placePs(r.place);
              const sr = sysRankMap[norm(r.name)] || null;
              const rowBg = r.place===1?'#fffbeb':r.place===2?'#f8fafc':r.place===3?'#fdf4ff':'#fff';
              return (
                <tr key={r.place} style={{ background:rowBg, borderBottom:'0.5px solid #f3f4f6' }}>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ width:22, height:22, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, ...ps }}>{r.place}</span>
                  </td>
                  <td style={{ padding:'4px 6px', fontSize:13, fontWeight:600, color:'#111827' }}>{r.name}</td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    {sr
                      ? <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, background:sr===1?'#fbbf24':sr===2?'#d1d5db':sr===3?'#cd7f32':'#f3f4f6', color:sr<=3?'#78350f':'#9ca3af' }}>{sr}</span>
                      : <span style={{ fontSize:9, color:'#d1d5db' }}>—</span>
                    }
                  </td>
                  <td style={{ padding:'4px 6px', fontSize:11, fontWeight:500, color:'#374151', fontFamily:'monospace' }}>{r.sp>0?`$${Number(r.sp).toFixed(2)}`:'—'}</td>
                  <td style={{ padding:'4px 6px', fontSize:10, color:'#111827' }}>{r.margin||'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── bet modal ────────────────────────────────────────────────────────────────

function BetModal({ horse, onClose, isAdmin = false, oddsBookmaker = '' }) {
  const { user } = useUser();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open,          setOpen]          = useState(false);
  const [stake,         setStake]         = useState('');
  const [odds,          setOdds]          = useState(horse.rawOdds ? horse.rawOdds.toFixed(2) : '');
  const [placeOdds,     setPlaceOdds]     = useState('');
  const [bookie,        setBookie]        = useState('Sportsbet');
  const [betType,       setBetType]       = useState('win');
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState(null);
  const [stakingAlert,  setStakingAlert]  = useState('');
  const [stakeWarning,  setStakeWarning]  = useState(false);
  const [formError,     setFormError]     = useState('');
  const [shareToast,    setShareToast]    = useState(null); // Share Bet -> Share to Community outcome message

  useEffect(() => { setOpen(true); }, []);

  // Mirrors the current `odds` value into a ref so the async fetch below can
  // check "has the user already typed something" without depending on
  // `odds` (which would re-fire the on-open effect every keystroke).
  const oddsRef = useRef(odds);
  useEffect(() => { oddsRef.current = odds; }, [odds]);

  // Admin-only: looks up a fresh odds_snapshot price for this runner under a
  // given PuntersEdge bookmaker slug -- same venue/race/bookmaker query shape
  // as the Field tab/Pace Map tab's livePrices fetch, matched client-side by
  // stripCountry+uppercase like everywhere else. Shared by the on-open
  // pre-fill below and the bookmaker grid's onClick, so both stay backed by
  // the exact same lookup.
  const fetchLivePriceForBookmaker = useCallback(async (slug) => {
    if (!slug || !horse?._venue || !horse?._raceNum || !horse?._meetingDate || !horse?.name || !SURL || !SKEY) return null;
    try {
      const venue = normaliseVenue(horse._venue);
      const raceNum = String(horse._raceNum);
      const res = await fetch(
        `${SURL}/rest/v1/odds_snapshot?race_date=eq.${horse._meetingDate}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&bookmaker=eq.${encodeURIComponent(slug)}&select=horse_name,price,captured_at&order=captured_at.desc&limit=200`,
        { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
      );
      if (!res.ok) return null;
      const rows = await res.json();
      const targetName = stripCountry(horse.name).toUpperCase();
      const hit = rows.find(r => stripCountry(r.horse_name).toUpperCase() === targetName);
      return hit ? Number(hit.price) : null;
    } catch { return null; }
  }, [horse?._venue, horse?._raceNum, horse?.name]);

  // On open: pre-fill from the currently-selected live-price bookmaker
  // (same picker/source as the Field tab and Pace Map tab), rather than
  // trusting whatever's already in the parent's livePrices state -- that can
  // be up to 60s stale (its own poll interval). Only overwrites the odds
  // field if it still holds the CSV-default pre-fill, so it never clobbers a
  // value the user already typed -- and only then also syncs the bookmaker
  // grid's highlighted button to match, so the two never disagree about
  // which bookmaker the shown price actually came from.
  useEffect(() => {
    if (!isAdmin || !oddsBookmaker) return;
    let cancelled = false;
    (async () => {
      const livePrice = await fetchLivePriceForBookmaker(oddsBookmaker);
      if (livePrice == null || cancelled) return;
      const csvDefault = horse.rawOdds ? horse.rawOdds.toFixed(2) : '';
      if (oddsRef.current === csvDefault) {
        setOdds(livePrice.toFixed(2));
        setBookie(bookmakerNameForSlug(oddsBookmaker));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id || !SURL || !SKEY) return;
    fetch(`${SURL}/rest/v1/user_settings?clerk_id=eq.${user.id}&select=settings&limit=1`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const s = rows?.[0]?.settings;
        if (!s) return;
        if (s.defStake)     setStake(String(s.defStake));
        if (s.defBookmaker) setBookie(s.defBookmaker);
        if (s.defBetType) {
          const dbt = s.defBetType.toLowerCase();
          setBetType(dbt);
          if (dbt === 'place') setOdds('');
        }
        if (s.stakingAlert) setStakingAlert(String(s.stakingAlert));
      })
      .catch(() => {});
  }, [user?.id]);

  // Admin-only: clicking a bookmaker in the grid re-fetches that bookmaker's
  // live price and re-fills odds with it, keeping the grid's selection and
  // the odds field in sync going forward (not just on initial open). Falls
  // back to the CSV rawOdds value if this bookmaker has no live price (or no
  // PuntersEdge coverage at all -- see getPuntersEdgeSlug). Non-admins: the
  // isAdmin check below makes this identical to the plain setBookie(b) it
  // replaced.
  const handleBookieClick = async (b) => {
    setBookie(b);
    if (!isAdmin || !oddsBookmaker) return;
    const slug = getPuntersEdgeSlug(b);
    if (!slug) return;
    const livePrice = await fetchLivePriceForBookmaker(slug);
    if (livePrice != null) setOdds(livePrice.toFixed(2));
    else if (horse.rawOdds) setOdds(horse.rawOdds.toFixed(2));
  };

  const handleSave = async () => {
    const err = validateBetForm({ betType, stake, odds, placeOdds });
    if (err) { setFormError(err); return; }
    setFormError('');
    if (stakingAlert && +stakingAlert > 0 && +stake > +stakingAlert && !stakeWarning) {
      setStakeWarning(true);
      return;
    }
    setStakeWarning(false);
    setSaving(true);
    const placeOddsVal = betType === 'place' ? +odds : betType === 'each-way' ? +placeOdds : null;
    const bet = {
      id: Date.now(),
      horse: horse.name,
      tab: horse.tab,
      bookie,
      betType,
      stake: +stake,
      odds: +odds,
      placeOdds: placeOddsVal,
      potential: +(+stake * +odds).toFixed(2),
      savedAt: new Date().toISOString(),
    };
    const existing = JSON.parse(localStorage.getItem('ww_bets') || '[]');
    localStorage.setItem('ww_bets', JSON.stringify([bet, ...existing]));

    let dbSuccess = !user?.id; // not logged in → localStorage-only, treat as success
    if (user?.id) {
      try {
        const raceNumVal = horse._raceNum != null ? (isNaN(+horse._raceNum) ? String(horse._raceNum) : +horse._raceNum) : null;
        const insertBody = {
          date:            toISO(horse._meetingDate) || new Date().toISOString().slice(0, 10),
          horse_name:      horse.name,
          track:           horse._venue        || null,
          venue:           horse._venue        || null,
          race_number:     raceNumVal,
          bet_type:        betType,
          stake:           +stake,
          odds:            +odds,
          place_odds:      placeOddsVal,
          bookmaker:       bookie              || null,
          rank:            horse._rank         || null,
          my_odds:         horse._myOdds       ?? horse.rawOdds ?? null,
          track_condition: horse._trackCond    || null,
          race_name:       horse._raceName     || null,
          meeting_date:    horse._meetingDate  || null,
          race_time:       horse._raceTime     || null,
          tab_no:          horse.tab != null   ? String(horse.tab) : null,
        };
        const res = await fetch('/api/log-bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(insertBody),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[BetSave] /api/log-bet error — status:', res.status, '| body:', errText);
        } else {
          dbSuccess = true;
          awardPoints(user.id, 'bet_logged', horse.name).catch(err => { console.error('[BetSave] points error:', err); });
        }
      } catch (err) {
        console.error('[BetSave] Network error:', err);
      }
    }

    setSaving(false);
    setToast(dbSuccess ? 'success' : 'error');
    if (dbSuccess) {
      window.dispatchEvent(new Event('ww:profile:refresh'));
      setTimeout(() => onClose(), 1500);
    } else {
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Share Bet — same infra as My Bets' Quick Log form (components/ShareMenu.js,
  // /api/bet-card, /api/bet-card/share), fed from this modal's own horse
  // prop + local stake/odds state instead of qlHorse/qlMeeting/qlRace/etc.
  const createBetShareUrl = useCallback(async () => {
    const res = await fetch('/api/bet-card/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horse_name: horse.name,
        venue: horse._venue || null,
        race_number: horse._raceNum != null ? String(horse._raceNum) : null,
        odds,
        stake,
      }),
    });
    if (!res.ok) throw new Error(`bet-card/share ${res.status}`);
    return res.json(); // { id, url }
  }, [horse, stake, odds]);
  const fetchBetCardImage = useCallback(share => fetch(`/api/bet-card?shareId=${share.id}`), []);

  // Same Pro-gate behavior as My Bets' Share to Community: the reused
  // /api/community/post route 403s for free users, and that's surfaced
  // clearly rather than failing silently.
  const handleShareBetToCommunity = useCallback(async ({ id }) => {
    if (!user?.id) return;
    const title = `${horse.name} @ ${horse._venue || 'TBC'} — $${(+stake).toFixed(2)} at $${(+odds).toFixed(2)}`;
    const res = await fetch('/api/community/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'shared_bets',
        title,
        body: 'Shared from my Waging War bet slip',
        image_url: `/api/bet-card?shareId=${id}`,
      }),
    });
    if (res.ok) {
      window.dispatchEvent(new Event('ww:profile:refresh'));
      awardPoints(user.id, 'community_post', title.slice(0, 100)).catch(() => {});
      setShareToast('Posted to Community');
    } else if (res.status === 403) {
      setShareToast('Community posting is a Pro feature');
    } else {
      setShareToast('Couldn’t post to Community — try again');
    }
    setTimeout(() => setShareToast(null), 4000);
  }, [user?.id, horse, stake, odds]);

  // Estimated place price from the entered win odds + race field size — placeholder only,
  // never a real value the field is auto-filled with.
  const placeOddsPlaceholder = (odds && +odds > 1 && horse._fieldSize)
    ? estimatePlacePrice(+odds, paidPlacesForFieldSize(horse._fieldSize)).toFixed(2)
    : '1.80';

  // Shared form body (used in both mobile sheet and desktop modal)
  const betBody = (
    <div className="p-4 space-y-3">
      {/* Horse name row (mobile only, since desktop has a header) */}
      {isMobile && (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="bg-blue-800/60 text-white text-[9px] font-bold px-1.5 py-[1px] rounded">{horse.tab}</span>
          {horse.name}
        </div>
      )}
      {/* Bet type */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200">
        {['win','each-way','place'].map(t => (
          <button key={t}
            onClick={() => {
              setBetType(t);
              if (t === 'place') {
                setOdds('');
              } else if (!odds) {
                setOdds(horse.rawOdds ? horse.rawOdds.toFixed(2) : '');
              }
            }}
            className={['flex-1 py-1.5 text-[11px] font-semibold capitalize transition-colors',
              betType === t ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50',
            ].join(' ')}>
            {t}
          </button>
        ))}
      </div>

      {betType === 'each-way' ? (
        <>
          {/* Stake (full width) */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Stake ($)</label>
            <input
              type="number" min="0.01" step="0.01" placeholder="10.00"
              value={stake} onChange={e => setStake(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
            />
          </div>
          {/* Win Odds + Place Odds, side by side (wraps to stacked if the container is too narrow) */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Win Odds ($)</label>
              <input
                type="number" min="1.01" step="0.01" placeholder="3.50"
                value={odds} onChange={e => setOdds(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Place Odds ($)</label>
              <input
                type="number" min="1.01" step="0.01" placeholder={placeOddsPlaceholder}
                value={placeOdds} onChange={e => setPlaceOdds(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        </>
      ) : (
        /* Stake + Odds */
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Stake ($)</label>
            <input
              type="number" min="0.01" step="0.01" placeholder="10.00"
              value={stake} onChange={e => setStake(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">
              {betType === 'place' ? 'Place Odds ($)' : 'Odds ($)'}
            </label>
            <input
              type="number" min="1.01" step="0.01" placeholder="3.50"
              value={odds} onChange={e => setOdds(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
            />
          </div>
        </div>
      )}

      {/* Inline validation error */}
      {formError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700 font-semibold">
          {formError}
        </div>
      )}

      {/* Potential return */}
      {betType === 'each-way' && stake && odds && placeOdds && +stake > 0 && +odds > 1 && +placeOdds > 1 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] space-y-1">
          <div className="flex justify-between">
            <span className="text-emerald-700">Total outlay</span>
            <span className="font-bold text-emerald-700">${(+stake * 2).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-700">Best case return</span>
            <span className="font-bold text-emerald-700">${(+stake * +odds + +stake * +placeOdds).toFixed(2)}</span>
          </div>
        </div>
      ) : betType !== 'each-way' && stake && odds && +stake > 0 && +odds > 1 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex justify-between text-[11px]">
          <span className="text-emerald-700">Potential return</span>
          <span className="font-bold text-emerald-700">${(+stake * +odds).toFixed(2)}</span>
        </div>
      )}

      {/* Bookie selector */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Bookmaker</label>
        <div className="grid grid-cols-4 gap-1">
          {BOOKIES.map(b => (
            <button key={b}
              onClick={() => handleBookieClick(b)}
              className={['text-[9px] font-semibold py-1.5 px-1 rounded-lg border transition-colors truncate',
                bookie === b ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
              ].join(' ')}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Staking alert warning */}
      {stakeWarning && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
            This stake is higher than your usual — are you sure?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{ flex: 1, padding: '7px 0', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Confirm &amp; Save
            </button>
            <button onClick={() => setStakeWarning(false)} style={{ flex: 1, padding: '7px 0', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Save + Share */}
      {!stakeWarning && (
        <div className="flex gap-2 items-stretch">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Bet'}
          </button>
          <ShareMenu
            userId={user?.id}
            qualifies={!!horse.name && +stake > 0 && +odds > 1}
            openTitle="Share this bet"
            lockedTitle="Fill in stake and odds to share"
            label="Share Bet"
            pointsAction="bet_card_share"
            createPublicUrl={createBetShareUrl}
            fetchImage={fetchBetCardImage}
            fileName="bet-card.png"
            shareTitle="My Waging War Bet"
            shareText={`${horse.name} @ ${horse._venue || 'TBC'} — $${stake || '0'} at $${odds || '0'}`}
            extraActions={[
              { label: 'Share to Community', icon: 'ti-users', onClick: handleShareBetToCommunity },
            ]}
            wrapperStyle={{ flexShrink: 0 }}
          />
        </div>
      )}
      {shareToast && (
        <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: shareToast === 'Posted to Community' ? '#059669' : '#92400e' }}>
          {shareToast}
        </div>
      )}
    </div>
  );

  const toastEl = (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background: toast === 'error' ? '#dc2626' : '#059669', color:'#fff', padding:'10px 22px', borderRadius:8, fontWeight:700, fontSize:13, zIndex:9999, boxShadow:'0 4px 16px rgba(0,0,0,0.25)', whiteSpace:'nowrap' }}>
      {toast === 'error' ? 'Failed to save bet — check your connection' : 'Bet logged! +5pts'}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <BottomSheet isOpen={open} onClose={onClose} title="Log a Bet">
          {betBody}
        </BottomSheet>
        {toast && toastEl}
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80" onClick={e => e.stopPropagation()}>
        {/* Header — rounded-t-2xl instead of relying on the parent's
            overflow-hidden, which used to clip the ShareMenu dropdown's
            absolutely-positioned popup near the bottom of this box. */}
        <div className="bg-brand px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-white font-semibold text-[13px]">Log Bet</div>
            <div className="text-white/70 text-[11px] mt-0.5 flex items-center gap-1">
              <span className="bg-blue-800/60 text-white text-[9px] font-bold px-1.5 py-[1px] rounded">{horse.tab}</span>
              {horse.name}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <i className="ti ti-x text-lg" />
          </button>
        </div>
        {betBody}
      </div>
      {toast && toastEl}
    </div>
  );
}

// ─── general log bet modal ──────────────────────────────────────────────────
// Entry point for logging a bet without going through a specific runner row
// first — user picks Meeting → Race → Horse themselves, then it hands off to
// the same BetModal every per-runner "+ Bet" button already uses, so bet
// type/stake/odds/bookmaker/save/share all come from one shared implementation.

function GeneralLogBetModal({ allVenues, allRaces, trackConds, onPick, onClose }) {
  const isMobile = useIsMobile();
  const venues = useMemo(() => Object.keys(allVenues).sort(), [allVenues]);
  const [venue, setVenue] = useState('');
  const [raceKey, setRaceKey] = useState('');
  const [horseName, setHorseName] = useState('');

  const raceOptions = useMemo(() => {
    if (!venue) return [];
    return (allVenues[venue] || [])
      .slice()
      .sort((a, b) => (+allRaces[a]?.num || 0) - (+allRaces[b]?.num || 0));
  }, [venue, allVenues, allRaces]);

  const horseOptions = useMemo(() => {
    if (!raceKey || !allRaces[raceKey]) return [];
    return (allRaces[raceKey].horses || []).filter(h => !h.scratched);
  }, [raceKey, allRaces]);

  const canContinue = venue && raceKey && horseName;

  const handleContinue = () => {
    const rc = allRaces[raceKey];
    const horse = horseOptions.find(h => h.name === horseName);
    if (!rc || !horse) return;
    onPick({
      ...horse,
      _venue: rc.venue,
      _raceNum: rc.num,
      _raceName: rc.name || null,
      _meetingDate: rc.date || null,
      _trackCond: trackConds[rc.venue] || 'good',
      _myOdds: horse.rawOdds,
      _raceTime: rc.time || null,
      _fieldSize: (rc.horses ? rc.horses.filter(h => !h.scratched).length : 0) || null,
    });
  };

  const inp = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 500 };

  const body = (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Meeting</label>
        <select value={venue} onChange={e => { setVenue(e.target.value); setRaceKey(''); setHorseName(''); }} style={inp}>
          <option value="">Meeting…</option>
          {venues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Race</label>
        <select value={raceKey} onChange={e => { setRaceKey(e.target.value); setHorseName(''); }} disabled={!venue} style={inp}>
          <option value="">Race…</option>
          {raceOptions.map(k => <option key={k} value={k}>R{allRaces[k]?.num}{allRaces[k]?.name ? ` — ${allRaces[k].name}` : ''}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Horse</label>
        <select value={horseName} onChange={e => setHorseName(e.target.value)} disabled={!raceKey} style={inp}>
          <option value="">Horse…</option>
          {horseOptions.map(h => <option key={h.name} value={h.name}>{h.tab ? `${h.tab}. ` : ''}{h.name}</option>)}
        </select>
      </div>
      <button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full py-2 rounded-lg text-[13px] font-bold text-white transition-colors"
        style={{ background: canContinue ? '#00471b' : '#9ca3af', cursor: canContinue ? 'pointer' : 'default' }}
      >
        Continue
      </button>
    </div>
  );

  if (isMobile) {
    return <BottomSheet isOpen onClose={onClose} title="Log a Bet">{body}</BottomSheet>;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80" onClick={e => e.stopPropagation()}>
        <div className="bg-brand px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="text-white font-semibold text-[13px]">Log a Bet</div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <i className="ti ti-x text-lg" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

// ─── mobile race picker ───────────────────────────────────────────────────────

function MobileRacePicker({ allVenues, allRaces, selectedRaceKey, onSelect }) {
  const venues = Object.keys(allVenues);
  const [selVenue, setSelVenue] = useState(() => {
    if (selectedRaceKey) {
      const rc = allRaces[selectedRaceKey];
      return rc?.venue || venues[0] || null;
    }
    return venues[0] || null;
  });
  const [trackOpen, setTrackOpen] = useState(false);

  useEffect(() => {
    if (selectedRaceKey) {
      const rc = allRaces[selectedRaceKey];
      if (rc?.venue) setSelVenue(rc.venue);
    }
  }, [selectedRaceKey, allRaces]);

  const venueRaces = selVenue ? (allVenues[selVenue] || []) : [];
  const currentRc = allRaces[selectedRaceKey];
  const nextTime  = currentRc?.time || '';

  return (
    <div style={{ background: '#fff', flexShrink: 0, position: 'relative', borderBottom: '1px solid #e5e7eb' }}>
      {/* Track switcher header */}
      <div style={{ fontSize: 8, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.3px', padding: '4px 12px 0' }}>Select Meeting</div>
      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <button
          onClick={() => setTrackOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '4px 8px 6px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{selVenue || venues[0] || '—'}</span>
          <i className="ti ti-chevron-down" style={{ fontSize: 11, color: '#6b7280' }} />
        </button>
        <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto', padding: '4px 10px 6px 0', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {venueRaces.map(rk => {
            const rr = allRaces[rk];
            const active = rk === selectedRaceKey;
            return (
              <button key={rk} onClick={() => onSelect(rk)}
                style={{ flexShrink: 0, minWidth: 26, height: 26, borderRadius: 13, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '0 5px',
                  background: active ? '#00471b' : '#f3f4f6', color: active ? '#fff' : '#111827', transition: 'all 0.15s' }}>
                {rr.num}
              </button>
            );
          })}
        </div>
      </div>
      {/* Track switcher panel */}
      {trackOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, maxHeight: 280, overflowY: 'auto', background: '#fff', borderTop: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', padding: '5px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Select track</div>
          {Object.keys(allVenues).map(v => (
            <div key={v}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', padding: '6px 12px 3px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{v}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 12px 8px' }}>
                {(allVenues[v] || []).map(rk => {
                  const rr = allRaces[rk];
                  const active = rk === selectedRaceKey;
                  return (
                    <button key={rk} onClick={() => { onSelect(rk); setTrackOpen(false); }}
                      style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, background: active ? '#00471b' : '#f3f4f6', color: active ? '#fff' : '#111827', transition: 'all 0.15s' }}>
                      {rr.num}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── mobile runner card ───────────────────────────────────────────────────────

function MobileRunnerCard({ runner, rank, rc, trackCond, onLogBet, isResulted, betBlocked = false, isPro, onUpgrade, isDbScratched, layers, canLivePrices = false, livePrices = {}, marketMoves = {}, calibrationCurve = null }) {
  const mktO = runner.rawOdds;
  const myO  = runner.myOdds;
  const wt   = runner['Weight'] ? `${runner['Weight']}kg` : '';

  // Lite+ (or site admin): odds_snapshot live price for the currently-
  // picked bookmaker, falling back to the CSV rawOdds value -- never
  // touches rawOdds itself, which the bet-modal pre-fill and Results page
  // still read directly.
  const liveP = canLivePrices ? livePrices[stripCountry(runner.name).toUpperCase()] : undefined;
  const displayPrice = liveP ?? mktO;
  const isLivePrice = liveP != null;
  const runnerMoveEntry = canLivePrices ? marketMoves[marketMoveNameKey(runner.name)] : undefined;
  const runnerMove = runnerMoveEntry?.move;
  // Confidence label -- had never been wired into the mobile/narrow card at
  // all (only the desktop RunnerRow table got it originally). Found while
  // investigating the DRAGON PORT report (2026-09-18): unrelated to that
  // specific bug (BABY CAN CAN's badge working there confirms the desktop
  // path/calibrationCurve wiring was fine -- the deployed build was simply
  // behind the extreme-edge-trigger commit), but a genuine separate gap
  // fixed here for parity with the desktop view.
  const confidenceFlags = isPro && myO
    ? getConfidenceFlags({ starts: runner.starts, dist: rc?.dist, calPrice: myO, oosMetrics: calibrationCurve?.oos_metrics, marketPrice: displayPrice })
    : null;

  let valStr = '—', valColor = '#374151', valPillBg = 'transparent';
  if (displayPrice && myO) {
    const p = (displayPrice - myO) / myO * 100;
    const arrow = p >= 30 ? '▲' : p <= -30 ? '▼' : '';
    valStr  = `${arrow}${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
    // Same deepens-with-size pill scale as the desktop Value column (C).
    if (p < 0) { valColor = '#991b1b'; valPillBg = '#fee2e2'; }
    else if (p < 20) { valColor = '#15803d'; valPillBg = '#f0fdf4'; }
    else if (p <= 100) { valColor = '#047857'; valPillBg = '#d1fae5'; }
    else { valColor = '#fff'; valPillBg = '#059669'; }
  }
  // C's row highlight (top-rated / big firmer / big drifter), same rule as
  // RunnerRow's desktop table.
  const mobBigMove = canLivePrices && runnerMove && (runnerMove.pct / 100) >= MARKET_MOVE_THRESHOLD ? runnerMove.direction : null;
  const mobEdge = isDbScratched ? 'transparent'
    : mobBigMove === 'firming' ? '#16a34a'
    : mobBigMove === 'drifting' ? '#dc2626'
    : rank === 1 ? '#d97706'
    : 'transparent';

  const pm  = calcPaceMap(runner, rc.venue, +rc.dist, trackCond);
  const rfs = runner.rfs || 0;
  const prepCell1 = rfs >= 2
    ? { label:'2nd-up', w:runner.prepRuns2W, p:runner.prepRuns2P, s:runner.prepRuns2S }
    : { label:'1st-up', w:runner.prepRuns1W, p:runner.prepRuns1P, s:runner.prepRuns1S };
  const prepCell2 = rfs >= 2
    ? { label:'3rd-up', w:runner.prepRuns3W, p:runner.prepRuns3P, s:runner.prepRuns3S }
    : { label:'2nd-up', w:runner.prepRuns2W, p:runner.prepRuns2P, s:runner.prepRuns2S };
  // w/p left raw (possibly undefined) — undefined means stripped for free
  // tier, distinct from a genuine 0; `known` below gates on that.
  const stColor = (w, s, known) => { if (!known || !s) return '#d1d5db'; const rv = w/s; return rv>=0.25?'#059669':rv>=0.12?'#d97706':'#374151'; };
  const finArr = Array.isArray(runner.lastFin) ? runner.lastFin : [runner.lastFin,null,null,null];
  const spArr  = Array.isArray(runner.lastSP)  ? runner.lastSP  : [runner.lastSP,null,null,null];
  const last4  = finArr.slice(0,4).filter(v => v!==null && v!==undefined && v!=='').reverse().map(v => +v>9?'0':v).join(' ');
  const bbPayload = { name: runner.name, venue: rc?.venue||'', raceNumber: rc?.num||'', distance: rc?.dist||'', cls: rc?.cls||'' };

  return (
    <div style={{ background: isDbScratched ? '#fafafa' : (rank===1 ? '#FAEEDA' : '#fff'), borderBottom: '1px solid #f1f5f9', padding: '4px 6px 5px 10px', opacity: isDbScratched ? 0.45 : 1, overflow: 'hidden' }}>

      {/* Line 1: RNK (16) | NO/badge (16) | name (flex:1) | Score (32) | WW $ (34) | Live $ (38) | Val (28) — gap:5 mirrors column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
        <div style={{ flexShrink: 0, width: 16, textAlign: 'center', fontSize: 9, fontWeight: 500, color: isDbScratched ? '#d1d5db' : '#6b7280', lineHeight: '16px' }}>
          {isDbScratched ? '—' : !isPro ? <LockBtn onClick={onUpgrade} /> : (rank || '—')}
        </div>
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, background: '#1e3a8a', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>{runner.tab}</span>
        <span style={{ flex: 1, fontWeight: 500, fontSize: 11, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDbScratched ? 'line-through' : 'none' }}>
          {runner.name}{runner['BP'] ? <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 400 }}> ({runner['BP']})</span> : null}{isDbScratched && <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '0 3px', borderRadius: 2 }}>SCR</span>}
        </span>
        <div style={{ flexShrink: 0, width: 36, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#111827' }}>
          {isDbScratched ? '—' : !isPro ? <LockBtn onClick={onUpgrade} /> : runner.totalFromGroups.toFixed(1)}
        </div>
        <div style={{ flexShrink: 0, width: 34, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#059669' }}>
          {isDbScratched ? '—' : !isPro ? <LockBtn onClick={onUpgrade} /> : (myO ? `$${formatRacingOdds(myO)}` : '—')}
          {/* Two independent, distinctly-labelled flags -- NOT the same
              "Limited data" text for both, since they mean different things
              (see lib/confidence.js). Both shown, stacked, if both trip. */}
          {confidenceFlags?.thinData && (
            <div style={{ fontSize: 6, fontWeight: 700, color: '#b91c1c', letterSpacing: '0.2px' }}>⚠ LTD</div>
          )}
          {confidenceFlags?.disagreement && (
            <div style={{ fontSize: 6, fontWeight: 700, color: '#9a3412', letterSpacing: '0.2px' }}>⚠ GAP</div>
          )}
        </div>
        {/* Widened 42 -> 76 to fit the open/current price line below the
            pill without wrapping -- the row's other fixed-width columns
            (Rank/Total/WW$/Value) leave enough slack at any real phone
            width for this, since the horse-name column (flex:1, already
            ellipsis-truncated) is what actually absorbs the extra space. */}
        <div style={{ flexShrink: 0, width: 76, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#111827' }}>
          {displayPrice ? `$${displayPrice.toFixed(2)}` : '—'}
          {/* pctLayout="stacked": the arrow+% goes on its own line below
              the price range rather than appended inline -- phones have no
              hover for a tooltip, so it has to be visible, but this box is
              a fixed 76px flex item with no horizontal-scroll fallback
              (unlike the desktop Field table). A short "▲14%"/"▼6%" fits
              that width on its own line with room to spare (it's the price
              range line, e.g. "$18.00 → $14.00", that's the wide one), so
              this adds one extra ~10px line rather than widening further --
              acceptable per-row height growth given other cells here
              (confidence LTD/GAP flags, the name/jockey-trainer stack) are
              already multi-line. */}
          {canLivePrices && <FirmingDriftingBadge move={runnerMove} prices={runnerMoveEntry ? { open: runnerMoveEntry.open, current: runnerMoveEntry.current } : null} pctLayout="stacked" />}
          {isLivePrice
            ? <span title="Best price across bookmakers" style={{ display: 'block', fontSize: 6, fontWeight: 800, color: '#059669', letterSpacing: '0.3px' }}>LIVE</span>
            : !canLivePrices && <LockBtn onClick={onUpgrade} label="Lite" />}
        </div>
        <div style={{ flexShrink: 0, width: 36, textAlign: 'right' }}>
          {isPro ? (
            <span style={{ fontSize: 10, fontWeight: 600, color: valColor, background: valPillBg, borderRadius: 4, padding: '2px 4px' }}>{valStr}</span>
          ) : <button onClick={onUpgrade} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, color: '#9ca3af' }}><i className="ti ti-lock" style={{ fontSize: 13 }} /></button>}
        </div>
      </div>

      {/* Career record — 42px indent = 16(RNK)+5(gap)+16(NO)+5(gap) */}
      <div style={{ paddingLeft: 42, fontSize: 9, color: '#111827', marginBottom: 1 }}>
        {runner.starts > 0
          ? `${runner.starts}-${runner.wins}-${runner.seconds||0}-${runner.thirds||0} · ${Math.round((runner.wins||0)/(runner.starts||1)*100)}% win`
          : 'First starter'}
      </div>

      {/* Weight · jockey */}
      <div style={{ paddingLeft: 42, fontSize: 9, color: '#111827', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[wt, jShort(runner.jname)].filter(Boolean).join(' · ')}
      </div>

      {/* Last-4 · trainer + buttons — same line, buttons right-aligned */}
      <div style={{ paddingLeft: 42, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <div style={{ flex: 1, fontSize: 9, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {last4 && <span>{last4}</span>}{runner.trainer && <span style={{ color: '#6b7280' }}>{last4 ? ' · ' : ''}{runner.trainer}</span>}
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={() => !betBlocked && onLogBet(runner, rank)} disabled={betBlocked}
            style={{ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: betBlocked ? '#9ca3af' : '#374151', cursor: betBlocked ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            + Log bet
          </button>
          <button onClick={() => isPro ? window.__addToBlackbook?.(bbPayload) : onUpgrade()}
            style={{ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🔖 Blackbook
          </button>
        </div>
      </div>

      {/* ── PILL LAYERS ── */}

      {/* FORM DETAIL (layers.form) */}
      {layers?.form && (() => {
        const runRows = [];
        for (let ri = 0; ri < 4; ri++) {
          const pos = finArr[ri];
          if (pos===null||pos===undefined||pos==='') continue;
          const dtl = runner.lastRunDetails?.[ri];
          if (!dtl||!dtl.date) continue;
          const sp = spArr[ri];
          const n = +pos;
          const mgTxt = n===1 ? `Won ${dtl.margin||0}L` : (dtl.margin!=null ? `${dtl.margin}L` : '');
          const mgColor = n===1?'#059669':n<=3?'#d97706':'#6b7280';
          runRows.push({ ri, date: fmtDate(dtl.date), pos: n, track: dtl.crse, cls: dtl.cls, dist: dtl.dist, wgt: dtl.wt, sp: fmtSP(sp), margin: mgTxt, mgColor });
        }
        const statItems = [
          { label:'Jockey 12m',    w:runner.jocLoc12mW,  p:runner.jocLoc12mP,  s:runner.jocLoc12mS },
          { label:'Trainer 12m',   w:runner.trnLoc12mW,  p:runner.trnLoc12mP,  s:runner.trnLoc12mS },
          { label:'Joc/Trn Combo', w:runner.jocTrnWins,  p:runner.jocTrnPlaces, s:runner.jocTrnStarts },
          prepCell1, prepCell2,
          { label:'Course/Dist',   w:runner.courseWins,  p:runner.coursePlaces, s:runner.courseStarts },
        ];
        return (
          <div style={{ margin: '3px 0 3px 42px', paddingBottom: 4, borderBottom: '1px solid #f1f5f9' }}>
            {runRows.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Last Runs</div>
                {runRows.map(r => (
                  <div key={r.ri} style={{ display: 'grid', gridTemplateColumns: 'auto 14px auto auto auto auto auto auto', gap: '0 3px', padding: '1.5px 0', fontSize: 7, lineHeight: 1.3, alignItems: 'center' }}>
                    <span style={{ color: '#9ca3af' }}>{r.date}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', fontSize: 7, fontWeight: 700, ...pipStyle(r.pos) }}>{r.pos>9?'0':r.pos}</span>
                    <span style={{ color: '#111827' }}>{r.track}</span>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0 3px', borderRadius: 2 }}>{r.cls}</span>
                    <span style={{ color: '#111827' }}>{r.dist}m</span>
                    <span style={{ color: '#111827' }}>{r.wgt}kg</span>
                    <span style={{ color: '#6b7280' }}>{r.sp}</span>
                    <span style={{ color: r.mgColor, fontWeight: 600 }}>{r.margin}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 6px', fontSize: 7 }}>
              {statItems.map(st => {
                const known = st.w !== undefined && st.p !== undefined;
                const s = st.s || 0, w = st.w || 0, p = st.p || 0;
                return (
                  <div key={st.label}>
                    <div style={{ fontWeight: 700, color: '#9ca3af', marginBottom: 1, textTransform: 'uppercase', letterSpacing: '0.2px' }}>{st.label}</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: stColor(w, s, known) }}>{known && s ? `${s}S ${w}W ${p}P` : '—'}</div>
                    <div style={{ color: '#6b7280' }}>{known && s>0 ? `${Math.round(w/s*100)}% win` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SCORE BREAKDOWN (layers.scores) */}
      {layers?.scores && isPro && runner.grpScores && (
        <div style={{ paddingLeft: 42, marginTop: 2, fontSize: 9, color: '#6b7280' }}>
          Form <span style={{ color: '#111827', fontWeight: 600 }}>{runner.grpScores.form?.total?.toFixed(1)??'—'}</span>
          {' · '}Speed <span style={{ color: '#111827', fontWeight: 600 }}>{runner.grpScores.speed?.total?.toFixed(1)??'—'}</span>
          {' · '}Cond <span style={{ color: '#111827', fontWeight: 600 }}>{runner.grpScores.cond?.total?.toFixed(1)??'—'}</span>
          {' · '}Conn <span style={{ color: '#111827', fontWeight: 600 }}>{runner.grpScores.conn?.total?.toFixed(1)??'—'}</span>
        </div>
      )}

      {/* PACE MAP (layers.pace) — single-color fill bar */}
      {layers?.pace && pm && isPro && (
        <div style={{ paddingLeft: 42, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, height: 7, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pm.pct}%`, background: pm.color }} />
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, color: pm.color, whiteSpace: 'nowrap' }}>{pm.role}</span>
          {!pm.hasTPPC && <span style={{ fontSize: 7, color: '#d97706', fontWeight: 600, whiteSpace: 'nowrap' }}>Est</span>}
        </div>
      )}

    </div>
  );
}

// ─── field view ───────────────────────────────────────────────────────────────

// label: default 'Pro' (every existing call site), 'Lite' for the new
// live-price/Move placeholders below -- same visual treatment either way.
function LockBtn({ onClick, label = 'Pro' }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, whiteSpace: 'nowrap' }}>
      <i className="ti ti-lock" style={{ fontSize: 10 }} /> {label}
    </button>
  );
}

const DEFAULT_COL_VIS = { form: true, speed: true, cond: true, conn: true, score: true, edge: true, value: true };

function RunnerRow({ runner, rank, rc, trackCond, onLogBet, onShowPopup, onHidePopup, isResulted, betBlocked = false, isPro, onUpgrade, isDbScratched, colVis = DEFAULT_COL_VIS, todayBets = {}, canLivePrices = false, livePrices = {}, marketMoves = {}, calibrationCurve = null, trustBuckets = null, compact = false, highlighted = false, expanded = false, onToggleExpand, oddsBookmaker = '' }) {
  const myO  = runner.myOdds;
  const mktO = runner.rawOdds;
  // Admin-only: odds_snapshot live price for the currently-picked bookmaker,
  // falling back to the CSV rawOdds value -- never touches rawOdds itself,
  // which the bet-modal pre-fill and Results page still read directly.
  const liveP = canLivePrices ? livePrices[stripCountry(runner.name).toUpperCase()] : undefined;
  const displayPrice = liveP ?? mktO;
  // Same marketMoves entry the % badge itself is computed from (open/current
  // best-price-across-bookmakers -- lib/marketMoves.js), not livePrices'
  // single-selected-bookmaker price, so the "$open -> $current" text shown
  // under the pill is always arithmetically consistent with that pill's own
  // percentage.
  const runnerMoveEntry = canLivePrices ? marketMoves[marketMoveNameKey(runner.name)] : undefined;
  const runnerMove = runnerMoveEntry?.move;
  const isLivePrice = liveP != null;
  const pm   = calcPaceMap(runner, rc.venue, +rc.dist, trackCond);
  const crsLabel = (() => { const c = runner.courseStarts||0; return c===0?'NEW':c===1?'1x':c<=4?`${c}x`:'VET'; })();
  // Same label the merged Factors column's th uses for the "cond" row --
  // computed here too (rather than passed down) since RunnerRow already
  // has trackCond as its own prop.
  const tcLabel = { good:'Good', soft:'Soft', heavy:'Heavy', synthetic:'Synth' }[trackCond] || 'Good';

  // Shared with the Value Bets tab (lib/scoring.js's computeValueEdge) so
  // both always agree on the exact same formula -- see that function's
  // comment for the known small discrepancies (matrix-odds jitter, default
  // vs. session-customised weights) that mean the two can differ slightly
  // in practice despite using identical logic.
  const valueEdge = displayPrice && myO ? computeValueEdge(displayPrice, myO) : null;
  const valStr = valueEdge ? valueEdge.str : '—';
  // Pill colour/background deepen with the size of the edge -- purely a
  // display choice layered on top of computeValueEdge's existing pct/str
  // (lib/scoring.js itself untouched, so Value Bets tab's own rendering of
  // the same computeValueEdge output is unaffected).
  const valuePillStyle = (() => {
    if (!valueEdge) return { color: '#374151', background: 'transparent' };
    const pct = valueEdge.pct;
    if (pct < 0) return { color: '#991b1b', background: '#fee2e2' };
    if (pct < 20) return { color: '#15803d', background: '#f0fdf4' };
    if (pct <= 100) return { color: '#047857', background: '#d1fae5' };
    return { color: '#fff', background: '#059669' };
  })();

  const pips = (runner.lastFin || []).slice(0, 4).filter(v => v !== null && v !== undefined && v !== '').reverse();
  const bp   = runner['BP'] || runner.BP || '';
  const wt   = runner['Weight'] ? `${runner['Weight']}kg` : '';
  const rankColor = rank===1?'#d97706':rank===2?'#6b7280':rank===3?'#b45309':'#9ca3af';

  const td = 'px-[3px] py-[2px]';
  const rowId = `runner-row-${stripCountry(runner.name).toUpperCase()}`;
  // Row highlight precedence: a big firmer/drifter (>= MARKET_MOVE_THRESHOLD,
  // the exact same gate computeMoveFlag already applied before runnerMove
  // ever reaches here) outranks the plain "top rated" tint -- a mover is
  // the more actionable signal of the two. isDbScratched/highlighted (the
  // Firmer/Drifter-chip jump target) still take priority over both.
  const bigMove = canLivePrices && runnerMove && (runnerMove.pct / 100) >= MARKET_MOVE_THRESHOLD ? runnerMove.direction : null;
  const rowEdge = isDbScratched ? 'transparent'
    : bigMove === 'firming' ? '#16a34a'
    : bigMove === 'drifting' ? '#dc2626'
    : rank === 1 ? '#d97706'
    : 'transparent';
  const rowBg = highlighted ? '#fef9c3'
    : isDbScratched ? '#fafafa'
    : bigMove === 'firming' ? '#f0fdf4'
    : bigMove === 'drifting' ? '#fef2f2'
    : rank === 1 ? '#fffbeb'
    : 'white';
  return (
    <>
    <tr id={rowId} className="border-b border-gray-100 text-[11px]" style={{ background: rowBg, opacity: isDbScratched ? 0.45 : 1, borderLeft: `3px solid ${rowEdge}`, outline: highlighted ? '2px solid #f59e0b' : 'none', transition: 'background 0.3s' }}>
      <td className={`${td} text-center font-bold w-7`} style={{ color: rankColor }}>
        {isDbScratched || !isPro ? (
          isDbScratched ? '—' : <LockBtn onClick={onUpgrade} />
        ) : (
          <button type="button" onClick={onToggleExpand} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${runner.name}`}
            className="flex items-center justify-center gap-0.5 w-full"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}>
            {rank}
            <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 9, color: '#9ca3af' }} />
          </button>
        )}
      </td>
      <td className={`${td} overflow-hidden`}>
        <div className="flex items-center flex-wrap gap-x-1 leading-snug">
          <span className="flex-shrink-0 bg-blue-800 text-white text-[8px] font-bold font-mono px-[4px] py-[1px] rounded-sm leading-tight mr-0.5">{runner.tab}</span>
          {isPro && (() => { const bk = `${normaliseVenue(rc?.venue||'')}||${String(rc?.num)}`; return (todayBets[bk]||[]).some(h => h.toUpperCase() === stripCountry(runner.name).toUpperCase()); })() && <i className="ti ti-ticket flex-shrink-0" style={{ fontSize: 9, color: '#00471b' }} />}
          <span
            className="font-semibold text-[11px] hover:text-brand hover:underline cursor-pointer"
            style={{ color: '#111827', textDecoration: isDbScratched ? 'line-through' : 'none' }}
            onMouseEnter={e => onShowPopup({ ...runner, _venue: rc?.venue, _raceNum: rc?.num, _dist: rc?.dist, _cls: rc?.cls }, e.clientX, e.clientY)}
            onMouseLeave={onHidePopup}
          >
            {runner.name}
          </span>
          {isDbScratched && <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>SCR</span>}
          {bp && <span className="text-[9px] text-gray-400 font-mono">({bp})</span>}
          {runner.allowance > 0 && <span className="text-[8px] font-bold bg-amber-100 text-amber-800 rounded px-1">-{runner.allowance}kg</span>}
          {classChangeEl(runner.classChange)}
        </div>
        <div className="text-[9px] mt-0.5 truncate" style={{ color: '#111827' }}>
          {[wt, jShort(runner.jname), runner.trainer].filter(Boolean).join(' · ')}
        </div>
      </td>
      {/* Last 4 */}
      {!compact && (
      <td className={`${td} text-center`}>
        <div className="flex items-center justify-center gap-[2px]">
          {pips.length > 0
            ? pips.map((v, i) => (
                <span key={i} style={{ width:16, height:16, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, ...pipStyle(+v) }}>
                  {+v>9?'0':v}
                </span>
              ))
            : <span className="text-[9px] text-gray-600">FS</span>
          }
        </div>
      </td>
      )}
      {/* Career record */}
      {!compact && (
      <td className={`${td} text-center text-[9px] font-mono whitespace-nowrap`} style={{ color: '#111827', paddingLeft: 4 }}>
        {runner.starts}-{runner.wins}-{runner.seconds||0}-{runner.thirds||0}
      </td>
      )}
      {/* Form/Speed/Good/Conn -- merged into one quiet column (hover for
          the breakdown) rather than 4 separate ones, to free up horizontal
          space in the table. */}
      {!compact && GRP_KEYS.some(gk => colVis[gk]) && (
        isDbScratched
          ? <td className="px-[3px] py-[5px] text-center" />
          : !isPro
            ? <td className="px-[3px] py-[5px] text-center"><LockBtn onClick={onUpgrade} /></td>
            : <CombinedFactorsCell runner={runner} colVis={colVis} tcLabel={tcLabel} />
      )}
      {/* Total */}
      {!compact && colVis.score && (
        <td className={`${td} text-right font-bold text-[12px] tabular-nums`} style={{ color: rankColor }}>
          {isDbScratched ? '—' : !isPro ? <LockBtn onClick={onUpgrade} /> : runner.totalFromGroups.toFixed(1)}
        </td>
      )}
      {/* WW $ */}
      {!compact && colVis.edge && (
        <td className={`${td} text-right text-[11px] font-semibold text-emerald-600 tabular-nums whitespace-nowrap`}>
          {!isPro ? <LockBtn onClick={onUpgrade} /> : (myO ? `$${formatRacingOdds(myO)}` : '—')}
          {/* Confidence labels -- real, live for all Pro users (not a
              preview). A well-tested runner shows nothing extra, keeping
              the already-dense Field tab uncluttered. Two INDEPENDENT
              flags (see lib/confidence.js): thinData (genuine thin-data
              cases -- first starter, first-starter-in-a-sprint, a
              calibration-curve price bucket too thin to trust) vs.
              disagreement (an extreme market-vs-model gap on an otherwise
              well-tested runner, e.g. DAWN ON ME/FINE VINTAGE, both 40+
              starts) -- these mean different things and are never merged
              into one label. Both render, stacked, if a runner trips both
              at once -- never silently drop one in favour of the other.
              Compact "LTD"/"GAP" badge style swapped in 2026-10-01 (was
              full "Limited data"/"Large disagreement" sentences) --
              now that this column is public-facing, the verbose text was
              making the WW $ cell too tall and misshaping the table row.
              Reuses MobileRunnerCard's exact compact-badge markup so the
              two surfaces stay visually consistent; only the label/style
              changed here, not the underlying flags or thresholds. */}
          {isPro && myO && (() => {
            const flags = getConfidenceFlags({ starts: runner.starts, dist: rc?.dist, calPrice: myO, oosMetrics: calibrationCurve?.oos_metrics, marketPrice: displayPrice });
            return (
              <>
                {flags.thinData && (
                  <div style={{ fontSize: 6, fontWeight: 700, color: '#b91c1c', letterSpacing: '0.2px' }}>⚠ LTD</div>
                )}
                {flags.disagreement && (
                  <div style={{ fontSize: 6, fontWeight: 700, color: '#9a3412', letterSpacing: '0.2px' }}>⚠ GAP</div>
                )}
              </>
            );
          })()}
          {/* Phase 3 Trust Engine preview removed from display 2026-10-01 --
              Adam decided it's never shipping as a real feature. The
              underlying trustBuckets fetch (admin-only gate untouched,
              see RacesPageInner), lib/trustApply.js, and lib/trustBlend.js
              are all left completely alone -- this is a display-only
              removal, not a teardown of the Trust Engine's data layer. */}
          {/* Joc/Trn Combo ('jtrat') shipped live 2026-09-18 -- it's just
              part of totalFromGroups/myOdds above now, like every other
              Connections factor, so the separate "J/T: $X.XX" preview line
              this used to be (admin-only, 2809622) is retired: there's no
              second number to show alongside WW $ any more. */}
        </td>
      )}
      {/* Price $ -- the static CSV-derived price (mktO) is free-tier
          content regardless (lib/freeTierFields.js's FREE_HORSE_FIELDS
          includes 'odds'/'rawOdds'), unaffected by canLivePrices: liveP is
          already undefined for a free user (see above), so displayPrice
          already falls back to mktO with no extra logic needed here. Only
          the LIVE badge is gated -- replaced with a small Lite lock for a
          free user instead of removing the (already-free) price itself. */}
      <td className={`${td} text-right text-[11px] tabular-nums whitespace-nowrap`} style={{ color: '#111827' }}>
        {displayPrice ? `$${displayPrice.toFixed(2)}` : '—'}
        {isLivePrice
          ? <span title="Best price across bookmakers" style={{ marginLeft: 3, fontSize: 7, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '1px 3px', borderRadius: 3, letterSpacing: '0.3px' }}>LIVE</span>
          : !canLivePrices && <span style={{ marginLeft: 3 }}><LockBtn onClick={onUpgrade} label="Lite" /></span>}
      </td>
      {/* Move -- own column, Field tab (RunnerRow) only. Odds tab/page and
          Pace Map keep the badge stacked under the price as before; this is
          a Field-tab-specific layout choice, not a shared component change.
          Always rendered (not canLivePrices-gated) -- a free user gets a
          locked placeholder, not a missing column, so column counts always
          agree between thead and tbody and nothing shifts between a free
          and a paying user. */}
      <td className={`${td} text-right whitespace-nowrap`} style={{ verticalAlign: 'middle' }}>
        {canLivePrices
          ? <FirmingDriftingBadge move={runnerMove} compact prices={runnerMoveEntry ? { open: runnerMoveEntry.open, current: runnerMoveEntry.current } : null} />
          : <LockBtn onClick={onUpgrade} label="Lite" />}
      </td>
      {/* Value */}
      {colVis.value && (
        <td className={`${td} text-right`}>
          {!isPro ? <LockBtn onClick={onUpgrade} /> : (
            <span className="text-[10px] font-semibold tabular-nums whitespace-nowrap" style={{ ...valuePillStyle, borderRadius: 4, padding: '2px 6px' }}>
              {valStr}
            </span>
          )}
        </td>
      )}
      {/* Bet -- labelled with the same displayPrice (selected bookmaker's
          live price, falling back to the static CSV price) shown in the
          Price $ cell above, and that's the price handed to the Log Bet
          flow too (overriding rawOdds only on the object this click
          passes down, not the runner itself). */}
      <td className={`${td} text-center`}>
        <button onClick={() => !betBlocked && onLogBet({ ...runner, rawOdds: displayPrice ?? runner.rawOdds }, rank)} disabled={betBlocked}
          className="text-[9px] font-semibold px-2 py-[3px] rounded border whitespace-nowrap transition-colors"
          style={{ color:betBlocked?'#9ca3af':'#374151', background:betBlocked?'#f9fafb':'#fff', borderColor:'#e5e7eb', cursor:betBlocked?'default':'pointer' }}>
          {betBlocked ? 'Closed' : displayPrice ? `+ Bet $${displayPrice.toFixed(2)}` : '+ Bet'}
        </button>
      </td>
      {/* Pace */}
      {!compact && (
      <td className={td}>
        {pm && (
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold w-6 flex-shrink-0" style={{ color: pm.color }}>{pm.role.slice(0,3).toUpperCase()}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ width: 36 }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pm.pct}%`, background: pm.color }} />
            </div>
            <span className="text-[8px] font-semibold w-6 text-right" style={{ color: '#111827' }}>{crsLabel}</span>
          </div>
        )}
      </td>
      )}
    </tr>
    {expanded && !isDbScratched && (
      <tr>
        <td colSpan={20} style={{ padding: 0, border: 'none' }}>
          <ExpandedRunnerPanel runner={runner} rc={rc} canLivePrices={canLivePrices} oddsBookmaker={oddsBookmaker} displayPrice={displayPrice} onUpgrade={onUpgrade} />
        </td>
      </tr>
    )}
    </>
  );
}

// ─── expandable runner row panel ───────────────────────────────────────────────

// Lazy-fetched sparklines cached in module scope (session-lifetime, not
// persisted) so re-expanding the same runner never re-fetches.
const sparklineCache = new Map();

function ExpandedRunnerPanel({ runner, rc, canLivePrices, oddsBookmaker, displayPrice, onUpgrade }) {
  const [sparkState, setSparkState] = useState({ loading: false, points: null });
  const cacheKey = `${toISO(rc?.date)}|${normaliseVenue(rc?.venue || '')}|${rc?.num}|${oddsBookmaker}|${stripCountry(runner.name).toUpperCase()}`;

  useEffect(() => {
    if (!canLivePrices || !oddsBookmaker || !rc) return;
    if (sparklineCache.has(cacheKey)) { setSparkState({ loading: false, points: sparklineCache.get(cacheKey) }); return; }
    setSparkState({ loading: true, points: null });
    fetch(`/api/odds-sparkline?venue=${encodeURIComponent(normaliseVenue(rc.venue))}&raceNum=${encodeURIComponent(rc.num)}&date=${encodeURIComponent(toISO(rc.date))}&bookmaker=${encodeURIComponent(oddsBookmaker)}&horse=${encodeURIComponent(runner.name)}`)
      .then(r => r.ok ? r.json() : { points: [] })
      .then(data => {
        const pts = data.points || [];
        sparklineCache.set(cacheKey, pts);
        setSparkState({ loading: false, points: pts });
      })
      .catch(() => setSparkState({ loading: false, points: [] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, canLivePrices, oddsBookmaker]);

  // Last 4 runs -- same lastFin/lastSP/lastRunDetails fields buildPopupHTML
  // already reads, just rendered as JSX instead of an HTML string.
  const finArr = Array.isArray(runner.lastFin) ? runner.lastFin : [runner.lastFin, null, null, null];
  const spArr  = Array.isArray(runner.lastSP)  ? runner.lastSP  : [runner.lastSP, null, null, null];
  const lastRuns = [];
  for (let ri = 0; ri < 4; ri++) {
    const pos = finArr[ri];
    if (pos === null || pos === undefined || pos === '') continue;
    const dtl = runner.lastRunDetails?.[ri];
    if (!dtl || !dtl.date) continue;
    const sp = spArr[ri];
    lastRuns.push({
      date: fmtDate(dtl.date), pos, crse: dtl.crse || '—', cls: dtl.cls || '—',
      dist: dtl.dist ? `${dtl.dist}m` : '—',
      cond: dtl.cond || null,
      sp: (sp && !isNaN(+sp) && +sp > 0) ? `$${+sp}` : '—',
      margin: +pos === 1 ? `Won ${dtl.margin || 0}L` : (dtl.margin != null ? `${dtl.margin}L` : '—'),
    });
  }

  // Strike-rate/record blocks -- same fields + "known" test buildPopupHTML
  // uses (w/p both present, not just truthy, since 0 is a real value but
  // undefined means the field was stripped for free tier).
  const statDefs = [
    { label: 'Jockey 12m',  w: runner.jocLoc12mW, p: runner.jocLoc12mP, s: runner.jocLoc12mS },
    { label: 'Trainer 12m', w: runner.trnLoc12mW, p: runner.trnLoc12mP, s: runner.trnLoc12mS },
    { label: 'J/T Combo',   w: runner.jocTrnWins, p: runner.jocTrnPlaces, s: runner.jocTrnStarts },
    { label: 'Course',      w: runner.courseWins, p: runner.coursePlaces, s: runner.courseStarts },
    { label: 'Distance',    w: runner.distWins,   p: runner.distPlaces,   s: runner.distStarts },
    { label: '1st-up',      w: runner.prepRuns1W, p: runner.prepRuns1P,   s: runner.prepRuns1S },
  ].filter(st => st.w !== undefined && st.p !== undefined && (st.s || 0) > 0);

  const sparkPoints = sparkState.points;
  const sparkOpen = sparkPoints && sparkPoints.length ? sparkPoints[0].price : null;
  const sparkNow = sparkPoints && sparkPoints.length ? sparkPoints[sparkPoints.length - 1].price : null;

  return (
    <div style={{ display: 'flex', gap: 24, padding: '12px 18px 14px', background: '#f8faf6', borderBottom: '1px solid #e1e7de', fontSize: 12, flexWrap: 'wrap' }}>
      {lastRuns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
          <b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70', textTransform: 'uppercase' }}>Last 4 runs</b>
          {lastRuns.map((r, i) => (
            <span key={i} style={{ color: '#374151' }}>
              {r.pos === 1 ? '1st' : r.pos === 2 ? '2nd' : r.pos === 3 ? '3rd' : `${r.pos}th`} {r.crse} {r.dist}{r.cond ? ` ${r.cond}` : ''} {r.sp} · {r.margin} <span style={{ color: '#9ca3af' }}>({r.date})</span>
            </span>
          ))}
        </div>
      )}
      {statDefs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70', textTransform: 'uppercase' }}>Strike rates</b>
          {statDefs.map((st, i) => (
            <span key={i} style={{ color: '#374151' }}>
              {st.label}: {st.s}S {st.w}W {st.p}P <span style={{ color: '#9ca3af' }}>({Math.round(st.w / st.s * 100)}% win · {Math.round(st.p / st.s * 100)}% plc)</span>
            </span>
          ))}
        </div>
      )}
      {canLivePrices && oddsBookmaker && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
          <b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70', textTransform: 'uppercase' }}>Price today ({bookmakerNameForSlug(oddsBookmaker)})</b>
          {sparkState.loading ? (
            <span style={{ color: '#9ca3af', fontSize: 11 }}>Loading…</span>
          ) : sparkPoints && sparkPoints.length >= 2 ? (
            <PriceSparkline points={sparkPoints} openPrice={sparkOpen} nowPrice={sparkNow} />
          ) : (
            <span style={{ color: '#9ca3af', fontSize: 11 }}>No price history yet for this bookmaker.</span>
          )}
        </div>
      )}
      {!canLivePrices && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <LockBtn onClick={onUpgrade} label="Lite" />
          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>Price history is a Lite feature</span>
        </div>
      )}
    </div>
  );
}

function PriceSparkline({ points, openPrice, nowPrice }) {
  const w = 220, h = 56, pad = 4;
  const prices = points.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const xStep = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const y = pad + (1 - (p.price - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const rising = nowPrice > openPrice; // drifting = rising price
  const lineColor = rising ? '#dc2626' : '#059669';
  const lastCoord = coords.split(' ').slice(-1)[0].split(',');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Price from $${openPrice} to $${nowPrice}`}>
      <rect x={0} y={0} width={w} height={h} fill="#f1f4ef" rx={6} />
      <polyline points={coords} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={lastCoord[0]} cy={lastCoord[1]} r={3} fill={lineColor} />
      <text x={6} y={h - 6} fontSize={9} fill="#6b7a70" fontFamily="monospace">${openPrice.toFixed(2)} open</text>
      <text x={w - 6} y={10} fontSize={9} fill={lineColor} fontFamily="monospace" textAnchor="end">${nowPrice.toFixed(2)} now</text>
    </svg>
  );
}

function FieldView({ results, scratched, rc, trackCond, onLogBet, onShowPopup, onHidePopup, isResulted, betBlocked = false, isPro, onUpgrade, scratchingsSet = new Set(), colVis = DEFAULT_COL_VIS, todayBets = {}, isMobile, canLivePrices = false, livePrices = {}, marketMoves = {}, calibrationCurve = null, trustBuckets = null, compact = false, highlightName = null, oddsBookmaker = '' }) {
  const scrKey = h => `${normaliseVenue(rc.venue)}||${rc.num}||${stripCountry(h.name).toUpperCase()}`;
  const activeResults = results.filter(h => !scratchingsSet.has(scrKey(h)));
  const dbScratched   = results.filter(h =>  scratchingsSet.has(scrKey(h)));
  const [layers, setLayers] = useState({ form: false, pace: false, scores: false, picks: false });
  // D (expandable row) -- one open at a time, keyed by stripCountry(name).
  const [expandedKey, setExpandedKey] = useState(null);
  // Falls back to display order for any runner with no systemRank (e.g. the
  // appended DB-scratched-only entries, which never go through scoring).
  const mobRankMap = new Map(activeResults.map((r, i) => [r.tab || r.name, r.systemRank ?? i + 1]));
  const mobDisplayResults = layers.pace
    ? [...activeResults].sort((a, b) => (+a['BP'] || +a.tab || 99) - (+b['BP'] || +b.tab || 99))
    : activeResults;
  const th = { background: '#f8fafc', color: '#374151', letterSpacing: '0.5px', position: 'sticky', top: 0, zIndex: 1, padding: '3px 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', lineHeight: '1.3', borderBottom: '1px solid #e5e7eb' };
  // Table has grown several columns (Move, Value, etc.) and now overflows
  // its container on narrower layouts -- same shared scroll-overflow
  // wrapper as OddsTable/Movers/Value Bets (.ww-scroll-x, useScrollOverflow,
  // ScrollHint) rather than a new solution. Was previously overflow-x-hidden,
  // which clipped the rightmost columns (e.g. Pace/Crs) with no way to
  // reach them at all.
  const { scrollRef: fieldScrollRef, hasOverflow: fieldHasOverflow } = useScrollOverflow([activeResults, dbScratched, colVis, canLivePrices]);
  return (
    <>
      {/* Desktop table */}
      <div className={!isMobile ? '' : 'hidden'}>
        {fieldHasOverflow && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <ScrollHint />
          </div>
        )}
        {/* overflowY explicitly 'hidden' (not left as the default
            'visible') -- the CSS overflow spec forces a 'visible' Y to
            'auto' whenever X is non-visible, which would make THIS div
            (not the scrollable contentBlock ancestor above it) the
            thead's sticky containing block, breaking the sticky column
            header (B). An explicit non-visible value isn't subject to
            that forcing rule, so the real vertical scroll stays owned by
            contentBlock and sticky resolves against it correctly. */}
        <div ref={fieldScrollRef} className="ww-scroll-x" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <table className="ww-race-table w-full border-collapse" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr className="border-b border-gray-200">
              <th style={{ ...th, textAlign:'center', width:'3%' }}>RANK</th>
              <th style={{ ...th, textAlign:'left', width:'18%' }}>Horse / Jockey / Trainer</th>
              {!compact && <th style={{ ...th, textAlign:'center', width:'7%' }}>Last 4 →</th>}
              {!compact && <th style={{ ...th, textAlign:'center', width:'6%', paddingLeft: 14 }}>Record</th>}
              {/* Form/Speed/Good/Conn merged into one column -- still gated
                  on any of the 4 individual colVis toggles being on, so
                  hiding all of them via settings still hides this column
                  entirely, same as before. */}
              {!compact && (colVis.form || colVis.speed || colVis.cond || colVis.conn) && (
                <th style={{ ...th, textAlign:'center', width:'4%' }}>Factors</th>
              )}
              {!compact && colVis.score && <th style={{ ...th, textAlign:'right', width:'5%' }}>Score</th>}
              {!compact && colVis.edge && <th style={{ ...th, textAlign:'right', width:'6%' }}>WW $</th>}
              <th style={{ ...th, textAlign:'right', width:'6%' }}>Price $</th>
              {/* Widened 3% -> 7% (table is tableLayout:auto, so this is a
                  sizing hint, not a hard cap, but the old 3% badly
                  under-stated the real content width once the open/current
                  price line was added underneath the pill). */}
              {/* Always rendered (not canLivePrices-gated) -- a free user
                  gets a locked placeholder in the body cell below, not a
                  missing column, so the table layout never shifts between
                  a free and a paying user. */}
              <th style={{ ...th, textAlign:'right', width:'7%', padding: '3px 3px' }}>Move</th>
              {colVis.value && <th style={{ ...th, textAlign:'right', width:'5%' }}>Value</th>}
              <th style={{ ...th, width:'8%' }} />
              {!compact && <th style={{ ...th, textAlign:'left', width:'16%' }}>Pace / Crs</th>}
            </tr>
          </thead>
          <tbody>
            {activeResults.map((r, i) => {
              const rKey = stripCountry(r.name).toUpperCase();
              return (
              <RunnerRow key={r.tab || r.name} runner={r} rank={r.systemRank ?? i+1} rc={rc} trackCond={trackCond} onLogBet={onLogBet} onShowPopup={onShowPopup} onHidePopup={onHidePopup} isResulted={isResulted} betBlocked={betBlocked} isPro={isPro} onUpgrade={onUpgrade} colVis={colVis} todayBets={todayBets} canLivePrices={canLivePrices} livePrices={livePrices} marketMoves={marketMoves} calibrationCurve={calibrationCurve} trustBuckets={trustBuckets} compact={compact} highlighted={highlightName === rKey}
                expanded={expandedKey === rKey} onToggleExpand={() => setExpandedKey(k => k === rKey ? null : rKey)} oddsBookmaker={oddsBookmaker} />
              );
            })}
            {dbScratched.map(r => (
              <RunnerRow key={r.tab || r.name} runner={r} rank={null} rc={rc} trackCond={trackCond} onLogBet={onLogBet} onShowPopup={onShowPopup} onHidePopup={onHidePopup} isResulted={true} betBlocked isPro={isPro} onUpgrade={onUpgrade} isDbScratched colVis={colVis} todayBets={todayBets} canLivePrices={canLivePrices} livePrices={livePrices} marketMoves={marketMoves} compact={compact} />
            ))}
          </tbody>
          {scratched.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={20} className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50">
                  Scratched: {scratched.map(h => h.name).join(' · ')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Mobile section */}
      <div className={isMobile ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
        {/* Toggle pills: Top picks | Form detail | Score breakdown | Pace map */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 10px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          {[['picks','Top picks'],['form','Form detail'],['scores','Score breakdown'],['pace','Pace map']].map(([key, label]) => (
            <button key={key} onClick={() => {
              if ((key === 'pace' || key === 'picks') && !isPro) { onUpgrade(); return; }
              setLayers(l => ({ ...l, [key]: !l[key] }));
            }}
              style={{ flexShrink: 0, borderRadius: 12, fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontWeight: 500,
                background: layers[key] ? '#00471b' : '#fff',
                color: layers[key] ? '#fff' : '#111827',
                border: '1px solid #00471b' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Top picks strip — above column header */}
        {layers.picks && isPro && (
          <div style={{ flexShrink: 0, display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {[...activeResults].sort((a,b) => b.totalFromGroups - a.totalFromGroups).slice(0,3).map((r, i) => (
              <div key={r.tab||r.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5px 8px', borderRadius: 6, flexShrink: 0,
                background: i === 0 ? '#FAEEDA' : '#fff', border: `1px solid ${i === 0 ? '#e5b95f' : '#e5e7eb'}`, minWidth: 72 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: i === 0 ? '#d97706' : '#9ca3af' }}>#{i+1}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: i === 0 ? '#412402' : '#111827', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.name}</div>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{r.rawOdds ? `$${r.rawOdds.toFixed(2)}` : '—'}</div>
              </div>
            ))}
          </div>
        )}

        {/* Column headers — gap:5, pad:10px left/6px right — mirrors card line 1 exactly */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 8, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          <div style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>RNK</div>
          <div style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>NO</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Horse</span>
            {layers.pace && <span style={{ fontSize: 10, fontWeight: 400, color: '#6b7280', textTransform: 'none', letterSpacing: 0 }}>· Sorted by barrier</span>}
          </div>
          <div style={{ flexShrink: 0, width: 36, textAlign: 'right' }}>Score</div>
          <div style={{ flexShrink: 0, width: 34, textAlign: 'right' }}>WW $</div>
          <div style={{ flexShrink: 0, width: 42, textAlign: 'right' }}>Price $</div>
          <div style={{ flexShrink: 0, width: 32, textAlign: 'right' }}>Val</div>
        </div>

        {/* Scrollable runner cards */}
        <div className="mob-page" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {mobDisplayResults.map(r => (
            <MobileRunnerCard key={r.tab || r.name} runner={r} rank={mobRankMap.get(r.tab || r.name)} rc={rc} trackCond={trackCond}
              onLogBet={onLogBet} isResulted={isResulted} betBlocked={betBlocked} isPro={isPro} onUpgrade={onUpgrade} layers={layers} canLivePrices={canLivePrices} livePrices={livePrices} marketMoves={marketMoves} calibrationCurve={calibrationCurve} />
          ))}
          {dbScratched.map(r => (
            <MobileRunnerCard key={r.tab || r.name} runner={r} rank={null} rc={rc} trackCond={trackCond}
              onLogBet={onLogBet} isResulted={true} betBlocked isPro={isPro} onUpgrade={onUpgrade} isDbScratched layers={layers} canLivePrices={canLivePrices} livePrices={livePrices} marketMoves={marketMoves} />
          ))}
          {scratched.length > 0 && (
            <div style={{ padding: '8px 12px', fontSize: 9, color: '#9ca3af', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
              Scratched: {scratched.map(h => h.name).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── form view ────────────────────────────────────────────────────────────────

function FormCard({ runner: r, rank, onLogBet, isResulted, betBlocked = false, rc, isPro, onUpgrade, isDbScratched, getWinner }) {
  const bp      = r['BP'] || r.BP || '';
  const wt      = r['Weight'] ? `${r['Weight']}kg` : '';
  const allow   = r.allowance ? ` -${r.allowance}kg` : '';
  const ageSex  = r.ageSex || '';
  const starts  = r.starts||0, wins = r.wins||0, secs = r.seconds||0, thirds = r.thirds||0;
  const winPct  = starts > 0 ? Math.round(wins/starts*100) : 0;
  const dslast  = r['Days Since Last Start'];
  const sire    = r.sire || '';
  const dam     = r.dam || '';
  const gsire   = r.gsire || r.grandsire || '';
  const winDists = Array.isArray(r.winDists) ? r.winDists.join(', ') : (r.winDists || '');
  const rfs     = r.rfs || 0;

  const avgPrize      = r['Average Prizemoney'];
  const avgPrizeFmt   = avgPrize ? `$${Math.round(avgPrize).toLocaleString('en-AU')}` : null;
  const estCareer     = avgPrize && r.starts ? Math.round(avgPrize * r.starts) : null;
  const estCareerFmt  = estCareer ? `$${estCareer.toLocaleString('en-AU')}` : null;

  const rankBg  = rank===1?'#fbbf24':rank===2?'#d1d5db':rank===3?'#cd7f32':'#4b5563';
  const rankTxt = rank<=3?'#78350f':'#fff';

  const prepCell1 = rfs >= 2
    ? { label:'2nd-up', w:r.prepRuns2W, p:r.prepRuns2P, s:r.prepRuns2S }
    : { label:'1st-up', w:r.prepRuns1W, p:r.prepRuns1P, s:r.prepRuns1S };
  const prepCell2 = rfs >= 2
    ? { label:'3rd-up', w:r.prepRuns3W, p:r.prepRuns3P, s:r.prepRuns3S }
    : { label:'2nd-up', w:r.prepRuns2W, p:r.prepRuns2P, s:r.prepRuns2S };

  // w/p left raw (possibly undefined) — undefined means stripped for free
  // tier, distinct from a genuine 0; `known` in the render below gates on that.
  const statItems = [
    { label:'Jockey 12m',    w:r.jocLoc12mW,  p:r.jocLoc12mP,  s:r.jocLoc12mS   },
    { label:'Trainer 12m',   w:r.trnLoc12mW,  p:r.trnLoc12mP,  s:r.trnLoc12mS   },
    { label:'Joc/Trn Combo', w:r.jocTrnWins,  p:r.jocTrnPlaces, s:r.jocTrnStarts },
    prepCell1,
    prepCell2,
    { label:'Course/Dist',   w:r.courseWins,  p:r.coursePlaces, s:r.courseStarts  },
  ];

  const stColor = (w, s, known) => { if (!known || !s) return '#d1d5db'; const rv = w/s; return rv>=0.25?'#059669':rv>=0.12?'#d97706':'#374151'; };

  const finArr = Array.isArray(r.lastFin) ? r.lastFin : [r.lastFin,null,null,null];
  const spArr  = Array.isArray(r.lastSP)  ? r.lastSP  : [r.lastSP,null,null,null];

  const runRows = [];
  for (let ri = 0; ri < 4; ri++) {
    const pos = finArr[ri];
    if (pos===null||pos===undefined||pos==='') continue;
    const dtl = r.lastRunDetails?.[ri];
    if (!dtl||!dtl.date) continue;
    const sp = spArr[ri];
    const n = +pos;
    const mgTxt = n===1 ? `Won ${dtl.margin||0}L` : (dtl.margin!=null ? `${dtl.margin}L` : '');
    const mgColor = n===1?'#059669':n<=3?'#d97706':'#6b7280';
    const rowBg = ri%2===0?'#fff':'#f9fafb';
    const winner = getWinner ? getWinner(dtl, r.name) : '—';
    runRows.push(
      <tr key={ri} style={{ background:rowBg }}>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmtDate(dtl.date)}</td>
        <td style={{ padding:'3px 6px', textAlign:'center' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, ...pipStyle(n) }}>{n>9?'0':pos}</span>
        </td>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{dtl.crse||'—'}</td>
        <td style={{ padding:'3px 6px', overflow:'hidden' }}>
          <span style={{ fontSize:10, padding:'1px 5px', borderRadius:3, background:'#eff6ff', color:'#1d4ed8', whiteSpace:'nowrap' }}>{dtl.cls||'—'}</span>
        </td>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap' }}>{dtl.dist?`${dtl.dist}m`:'—'}</td>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap' }}>{dtl.wt?`${dtl.wt}kg`:'—'}</td>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap' }}>{fmtSP(sp)}</td>
        <td style={{ padding:'3px 6px', fontSize:11, color:mgColor, whiteSpace:'nowrap' }}>{mgTxt}</td>
        <td style={{ padding:'3px 6px', fontSize:11, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:100 }}>{winner}</td>
      </tr>
    );
  }

  const breedParts = [];
  if (sire)      breedParts.push(`By ${sire}`);
  if (dam)       breedParts.push(`Dam: ${dam}`);
  if (gsire)     breedParts.push(`GSire: ${gsire}`);
  if (winDists)  breedParts.push(`Win dists: ${winDists}`);
  const breedLine = breedParts.join(' · ');

  return (
    <div style={{ borderRadius:6, border:'0.5px solid #e5e7eb', borderLeft: `3px solid ${mobEdge}`, background: mobBigMove === 'firming' ? '#f0fdf4' : mobBigMove === 'drifting' ? '#fef2f2' : rank === 1 ? '#fffbeb' : '#fff', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:'#00471b', borderRadius:'6px 6px 0 0', padding:'6px 10px' }}>
        {/* Row 1 */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {isPro
            ? <span style={{ width:20, height:20, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, background:rankBg, color:rankTxt }}>{rank}</span>
            : <LockBtn onClick={onUpgrade} />
          }
          <span style={{ background:'#1e3a8a', color:'#fff', fontSize:9, fontWeight:700, fontFamily:'monospace', padding:'1px 5px', borderRadius:3, flexShrink:0 }}>{r.tab}</span>
          <span style={{ fontSize:13, fontWeight:500, color:'white', flexShrink:0, textDecoration: isDbScratched ? 'line-through' : 'none' }}>{r.name}</span>
          {isDbScratched && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#dc2626', color: '#fff', flexShrink: 0 }}>SCR</span>}
          {bp && <span style={{ fontSize:11, color:'rgba(255,255,255,0.65)', flexShrink:0 }}>({bp})</span>}
          {r.winJockBack && <span style={{ background:'rgba(251,191,36,0.25)', color:'#fcd34d', fontSize:9, fontWeight:700, padding:'3px 6px', borderRadius:3, flexShrink:0 }}>WJ BACK</span>}
          {(wt||allow) && <span style={{ fontSize:11, color:'rgba(255,255,255,0.75)', flexShrink:0 }}>{wt}{allow}</span>}
          {r.jname && <span style={{ fontSize:11, color:'rgba(255,255,255,0.75)', flexShrink:0 }}>· {jShort(r.jname)}</span>}
          {r.trainer && <span style={{ fontSize:11, color:'rgba(255,255,255,0.75)', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>· {r.trainer}</span>}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {ageSex && <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)' }}>{ageSex}</span>}
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)', fontFamily:'monospace' }}>{starts}-{wins}-{secs}-{thirds}</span>
            <span style={{ fontSize:10, color:winPct>=25?'#6ee7b7':winPct>=12?'#fcd34d':'rgba(255,255,255,0.75)' }}>{winPct}%win</span>
            {dslast!=null && <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)' }}>{dslast}d</span>}
            <button type="button" onClick={() => !betBlocked && onLogBet({ ...r, rawOdds: displayPrice ?? r.rawOdds }, rank)} disabled={betBlocked}
              style={{ fontSize:9, fontWeight:600, padding:'2px 8px', minHeight: 24, borderRadius:3, border:'1px solid rgba(255,255,255,0.25)', color:betBlocked?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.8)', background:'transparent', cursor:betBlocked?'default':'pointer', flexShrink:0 }}>
              {betBlocked ? 'Closed' : displayPrice ? `+ Bet $${displayPrice.toFixed(2)}` : '+ Bet'}
            </button>
            <button type="button" onClick={() => { if (!isPro) { onUpgrade(); } else { window.__addToBlackbook && window.__addToBlackbook({ name: r.name, venue: rc?.venue || '', raceNumber: rc?.num || '', distance: rc?.dist || '', cls: rc?.cls || '' }); } }}
              style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:3, border:'1px solid rgba(255,255,255,0.25)', color:'rgba(255,255,255,0.8)', background:'transparent', cursor:'pointer', flexShrink:0 }}>
              🔖 Blackbook
            </button>
          </div>
        </div>
        {/* Row 1b: prizemoney */}
        {(avgPrizeFmt || estCareerFmt) && (
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:2, paddingLeft:28, display:'flex', gap:10 }}>
            {avgPrizeFmt  && <span>Avg Prize: {avgPrizeFmt}</span>}
            {estCareerFmt && <span>Career Prizemoney: {estCareerFmt}</span>}
          </div>
        )}
        {/* Row 2: breeding */}
        {breedLine && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:3, paddingLeft:28 }}>{breedLine}</div>
        )}
      </div>

      {/* Run history table */}
      {runRows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse:'collapse', border:'0.5px solid #e5e7eb', borderTop:'none', background:'#fff' }}>
          <thead>
            <tr style={{ background:'#f1f5f9' }}>
              <th style={{ width:90,  padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Date</th>
              <th style={{ width:44,  padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'center', borderBottom:'0.5px solid #e5e7eb' }}>Pos</th>
              <th style={{ width:70,  padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Track</th>
              <th style={{ width:90,  padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Class</th>
              <th style={{            padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Dist</th>
              <th style={{            padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Wgt</th>
              <th style={{            padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>SP</th>
              <th style={{            padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Margin</th>
              <th style={{ width:100, padding:'4px 6px', fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', textAlign:'left',   borderBottom:'0.5px solid #e5e7eb' }}>Winner</th>
            </tr>
          </thead>
          <tbody>{runRows}</tbody>
        </table>
        </div>
      )}

      {/* Stats footer */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 6px 6px', overflow:'hidden', background:'#fff' }}>
        {statItems.map((st, i) => {
          const known = st.w !== undefined && st.p !== undefined;
          const s = st.s || 0, w = st.w || 0, p = st.p || 0;
          return (
            <div key={st.label} style={{ padding:'5px 6px', borderRight: i < 5 ? '0.5px solid #e5e7eb' : 'none' }}>
              <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>{st.label}</div>
              <div style={{ fontSize:11, fontWeight:500, color:stColor(w, s, known) }}>
                {known && s ? `${s}S ${w}W ${p}P` : '—'}
              </div>
              <div style={{ fontSize:10, color:'#111827', marginTop:1 }}>{known && s>0 ? `${Math.round(w/s*100)}% win` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormView({ results, scratched, onLogBet, isResulted, betBlocked = false, rc, isPro, onUpgrade, scratchingsSet = new Set() }) {
  const scrKey = h => `${normaliseVenue(rc.venue)}||${rc.num}||${stripCountry(h.name).toUpperCase()}`;
  const sorted = [...results].sort((a, b) => (+a.tab || 99) - (+b.tab || 99));
  const activeSorted     = sorted.filter(r => !scratchingsSet.has(scrKey(r)));
  const dbScratchedSorted = sorted.filter(r =>  scratchingsSet.has(scrKey(r)));

  const [histResults, setHistResults] = useState({});
  useEffect(() => {
    if (!SURL || !SKEY || !results.length) return;
    const dates = new Set();
    results.forEach(r => (r.lastRunDetails||[]).forEach(dtl => { const iso = toISO(dtl.date); if (iso) dates.add(iso); }));
    if (!dates.size) return;
    Promise.all([...dates].map(async iso => {
      try {
        const res = await fetch(
          `${SURL}/rest/v1/race_results?select=venue,race_num,horse_name,finish_pos&date=eq.${iso}&order=venue,race_num,finish_pos`,
          { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        const horseRace = {}, raceWinner = {};
        rows.forEach(row => {
          const normV = normaliseVenue(row.venue);
          const hk = `${normV}||${(row.horse_name||'').toUpperCase()}`;
          if (!horseRace[hk]) horseRace[hk] = row.race_num;
          if (row.finish_pos === 1) raceWinner[`${normV}||${row.race_num}`] = (row.horse_name||'').toUpperCase();
        });
        return { iso, horseRace, raceWinner };
      } catch { return null; }
    })).then(all => {
      const acc = {};
      all.forEach(r => { if (r) acc[r.iso] = { horseRace: r.horseRace, raceWinner: r.raceWinner }; });
      setHistResults(acc);
    });
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const getWinner = (dtl, horseName) => {
    const iso = toISO(dtl.date);
    if (!iso || !histResults[iso]) return '—';
    // dtl.crse is the CSV's raw course abbreviation (e.g. "Cant", "Wfrm") --
    // normaliseVenue() alone can't recognise these (see resolveCrseAbbrev's
    // comment in lib/venues.js), which was why this column was blank on
    // every row regardless of whether the horse itself won.
    const normV = resolveCrseAbbrev(dtl.crse);
    const raceNum = histResults[iso].horseRace?.[`${normV}||${horseName.toUpperCase()}`];
    if (!raceNum) return '—';
    return histResults[iso].raceWinner?.[`${normV}||${raceNum}`] || '—';
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding:'10px 14px' }}>
      {activeSorted.map((r, i) => (
        <div key={r.tab||r.name} style={{ marginBottom: i < activeSorted.length-1 ? 12 : 0 }}>
          <FormCard runner={r} rank={i+1} onLogBet={onLogBet} isResulted={isResulted} betBlocked={betBlocked} rc={rc} isPro={isPro} onUpgrade={onUpgrade} getWinner={getWinner} />
        </div>
      ))}
      {dbScratchedSorted.map(r => (
        <div key={r.tab||r.name} style={{ marginBottom: 12, opacity: 0.45 }}>
          <FormCard runner={r} rank={null} onLogBet={onLogBet} isResulted={true} rc={rc} isPro={isPro} onUpgrade={onUpgrade} isDbScratched getWinner={getWinner} />
        </div>
      ))}
      {scratched.length > 0 && (
        <div className="text-[10px] text-gray-400 py-1 px-2">Scratched: {scratched.map(h=>h.name).join(' · ')}</div>
      )}
    </div>
  );
}

// ─── pace map view ────────────────────────────────────────────────────────────

function PaceMapView({ results, scratched, rc, trackCond, canAccess, onUpgrade, scratchingsSet = new Set(), canLivePrices = false, livePrices = {}, marketMoves = {}, paceBiasPoints = null }) {
  const scrKey = h => `${normaliseVenue(rc.venue)}||${rc.num}||${stripCountry(h.name).toUpperCase()}`;
  const activeResults = results.filter(h => !scratchingsSet.has(scrKey(h)));
  const ranked = activeResults.map((r, i) => ({ ...r, systemRank: i + 1 }));
  const byBarrier = ranked.map(r => ({
    ...r,
    pm: calcPaceMap(r, rc.venue, +rc.dist, trackCond),
  })).sort((a, b) => (+a['BP'] || +a.tab || 99) - (+b['BP'] || +b.tab || 99));

  const leaderCount  = byBarrier.filter(h => h.pm?.role === 'Leader').length;
  const presserCount = byBarrier.filter(h => h.pm?.role === 'Presser').length;
  const tempo = leaderCount >= 4
    ? `Hot pace — ${leaderCount} horses will fight for the lead`
    : leaderCount >= 2 ? 'Strong tempo — balanced pace scenario'
    : leaderCount === 1 ? 'One leader — likely to hold on'
    : 'No leader identified — slow pace expected';
  const tempoColor = leaderCount >= 4 ? '#dc2626' : leaderCount >= 2 ? '#d97706' : '#059669';
  const distType = +rc.dist <= 1200 ? 'Sprint' : +rc.dist <= 1600 ? 'Mile' : +rc.dist <= 2000 ? 'Middle dist' : 'Staying';
  // Combinatorial phrase-bank analysis (lib/paceAnalysis.js) -- pace shape +
  // distance framing + today's track bias, each an independently-seeded
  // pick from several real-terminology variants, rather than one generic
  // template. Seeded by venue+race so the same race shows the same text
  // across re-renders (this view re-renders on every 60s livePrices/
  // marketMoves poll) instead of visibly changing underneath the reader.
  const aiText = generatePaceAnalysis({
    byBarrier,
    dist: rc.dist,
    paceBiasPoints,
    seedBase: `${normaliseVenue(rc.venue)}||${rc.num}`,
  });

  return (
    <div className="flex flex-1 overflow-hidden" style={{ position: 'relative' }}>
      {!canAccess && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', background: 'rgba(255,255,255,0.4)' }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <i className="ti ti-lock" style={{ fontSize: 36, color: '#9ca3af', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Pace maps are a Pro feature</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>Upgrade to see the full pace analysis</div>
            <button onClick={onUpgrade} style={{ padding: '9px 22px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Unlock with Pro
            </button>
          </div>
        </div>
      )}
      {/* Main bars column */}
      <div className="flex-1 overflow-y-auto p-3" style={{ filter: canAccess ? 'none' : 'blur(4px)', pointerEvents: canAccess ? 'auto' : 'none' }}>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {PACE_ROLES.map(r => (
            <span key={r.label} className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: r.color }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
        {/* Column headers */}
        <div className="flex items-center gap-2 py-1 border-b border-gray-200 mb-1 text-[8px] font-bold text-gray-400 uppercase tracking-[0.4px]" style={{ padding:'2px 6px' }}>
          <div className="w-8 text-right flex-shrink-0">No</div>
          <div className="w-6 text-center flex-shrink-0">Rank</div>
          <div className="w-8 text-center flex-shrink-0">Bar</div>
          <div className="w-36 pl-1 flex-shrink-0">Horse</div>
          <div className="w-16 flex-shrink-0">Role</div>
          <div className="flex-1">Pace score</div>
          <div className="w-7 text-right flex-shrink-0">%</div>
          <div className="w-20 text-right pr-1 border-l border-gray-100 ml-2 flex-shrink-0">Edge$ / SP</div>
        </div>
        {byBarrier.map(h => {
          if (!h.pm) return null;
          const bp = h['BP'] ?? h.BP ?? '—';
          const myO = h.myOdds ? `$${formatRacingOdds(h.myOdds)}` : '—';
          // canLivePrices here is canPaceMap||isSiteAdminUser (set at the
          // call site) -- Pace Map itself is already Pro-only at the view
          // level (canAccess, blurred above otherwise), so this is always
          // true for anyone who can actually see this far. odds_snapshot
          // live price for the currently-picked bookmaker (same source/
          // picker as the Field tab), falling back to the CSV rawOdds
          // value -- same pattern as RunnerRow's Price $ column.
          const liveP = canLivePrices ? livePrices[stripCountry(h.name).toUpperCase()] : undefined;
          const displayPrice = liveP ?? h.rawOdds;
          const isLivePrice = liveP != null;
          const spO = displayPrice ? `$${formatRacingOdds(displayPrice)}` : '—';
          const rkBg = h.systemRank===1?'#fbbf24':h.systemRank===2?'#d1d5db':h.systemRank===3?'#cd7f32':'#f3f4f6';
          const rkColor2 = h.systemRank<=3?'#374151':'#9ca3af';
          return (
            <div key={h.tab||h.name} className="flex items-center gap-2 border-b border-gray-50" style={{ padding:'3px 6px' }}>
              <div className="w-8 flex-shrink-0 text-right">
                <span style={{ fontSize:9, color:'#6b7280', fontWeight:600 }}>{h.tab||'—'}</span>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: rkBg, color: rkColor2 }}>{canAccess ? h.systemRank : '—'}</div>
              <div className="w-8 flex-shrink-0 text-center">
                <span className="bg-blue-800 text-white text-[9px] font-bold px-1.5 py-[2px] rounded">{bp}</span>
              </div>
              <div className="w-36 flex-shrink-0 overflow-hidden">
                <div className="truncate" style={{ fontSize:11, fontWeight:600, color:'#111827' }}>{h.name}</div>
                {h.pm.hasTPPC
                  ? <div className="text-[8px] text-gray-400">F:{Math.round(h.pm.tppcFront||0)}% P:{Math.round(h.pm.tppcOnpc||0)}% M:{Math.round(h.pm.tppcMid||0)}% B:{Math.round(h.pm.tppcBack||0)}% <span className="text-emerald-600 font-semibold">Data</span></div>
                  : <div className="text-[8px] text-amber-500">Estimated</div>
                }
              </div>
              <div className="w-16 flex-shrink-0">
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap', color: h.pm.color, background: `${h.pm.color}20` }}>{h.pm.role}</span>
              </div>
              <div className="flex-1 bg-gray-100 rounded-full overflow-hidden" style={{ height:8 }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${h.pm.pct}%`, background: h.pm.color }} />
              </div>
              <span className="text-[10px] font-bold w-8 text-right flex-shrink-0" style={{ color: h.pm.color }}>{h.pm.pct}%</span>
              <div className="w-20 flex-shrink-0 text-right border-l border-gray-100 pl-2">
                <div className="text-[10px] font-semibold text-emerald-600">{myO}</div>
                <div className="text-[9px] text-gray-400">
                  SP {spO}
                  {isLivePrice && <span style={{ marginLeft: 2, fontSize: 6, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '1px 2px', borderRadius: 3, letterSpacing: '0.3px' }}>LIVE</span>}
                  <FirmingDriftingBadge move={canLivePrices ? marketMoves[marketMoveNameKey(h.name)]?.move : undefined} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right summary panel */}
      <div className="w-48 flex-shrink-0 bg-gray-50 border-l border-gray-200 overflow-y-auto p-3 space-y-3" style={{ filter: canAccess ? 'none' : 'blur(4px)', pointerEvents: canAccess ? 'auto' : 'none' }}>
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5px] mb-2">Tempo rating</div>
          <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
            <div className="text-[12px] font-bold leading-snug" style={{ color: tempoColor }}>{tempo}</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5px] mb-2">Pace count</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[['#00b050','Leaders',leaderCount],['#7ec820','Pressers',presserCount]].map(([c,l,n]) => (
              <div key={l} className="bg-white rounded-lg p-2 border border-gray-200 text-center">
                <div className="text-[18px] font-bold" style={{ color: c }}>{n}</div>
                <div className="text-[8px] text-gray-400 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5px] mb-2">Analysis</div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-200 text-[10px] text-gray-600 leading-relaxed">
            {aiText}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5px] mb-1">Distance</div>
          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-gray-200 text-[11px] text-gray-700">
            {rc.dist}m · {distType}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── market movers view ───────────────────────────────────────────────────────

const MOVE_PCT_OPTIONS = [15, 25, 50, 75, 100, 150];
const TIME_WINDOW_OPTIONS = [
  { key: 'all', label: 'All day', hours: null },
  { key: '1h',  label: 'Next 1 hour', hours: 1 },
  { key: '3h',  label: 'Next 3 hours', hours: 3 },
];

// odds_snapshot/race_schedule post_time strings look like "01.33 pm" --
// Sydney-clock (Australia/Sydney, AEST/AEDT) time for every venue including
// QLD/SA (confirmed live 2026-10-05) -- parses to a real Date for the
// time-window filter via the shared DST-aware helper, not a fixed +10:00
// (which was wrong by an hour for every race while Sydney is on AEDT).
function parsePostTime(postTime, dateISO) {
  return sydneyDateTimeToInstant(dateISO, postTime);
}

// Shared "Hide resulted" + win-rate stat behavior for Movers and Value
// Bets (both annotate their rows with finishPos/margin/sp from the same
// race_results join, lib/raceResults.js). `filteredBase` is every active
// filter EXCEPT Hide Resulted -- the stat is always computed from that,
// never from the Hide-Resulted-narrowed `filtered`, so toggling it never
// hides the stat about the very rows it's hiding.
function useResultedFilter(filteredBase) {
  const [hideResulted, setHideResulted] = useState(false);
  const filtered = useMemo(
    () => hideResulted ? filteredBase.filter(r => r.finishPos == null) : filteredBase,
    [filteredBase, hideResulted]
  );
  const resultedStat = useMemo(() => {
    const resulted = filteredBase.filter(r => r.finishPos != null);
    const wins = resulted.filter(r => r.finishPos === 1).length;
    return { wins, total: resulted.length };
  }, [filteredBase]);
  return { hideResulted, setHideResulted, filtered, resultedStat };
}

// "1st"/"2nd"/"3rd"/"4th"... for the Result column (Movers, Value Bets).
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function MoversView({ canAccess, onUpgrade, isAdmin }) {
  const [movers, setMovers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [minPct, setMinPct]   = useState(15);
  const [minPrice, setMinPrice] = useState(0);
  const [sortBy, setSortBy]   = useState('move');
  const [venue, setVenue]     = useState('all');
  const [direction, setDirection] = useState('all');
  const [raceNum, setRaceNum] = useState('all');
  const [timeWindow, setTimeWindow] = useState('all');
  const [moreOpen, setMoreOpen] = useState(false);
  const dateRef = useRef(new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()));

  useEffect(() => {
    // Not Lite/Pro (and not the admin live-price bypass) -- skip the fetch
    // entirely rather than hitting the plan-gated route just to get a 403;
    // same blur-overlay UX as Pace Map, but there's no free data underneath
    // to blur since Movers spans every race, not just the selected one.
    if (!canAccess && !isAdmin) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/market-movers?date=${dateRef.current}`);
        if (!res.ok) { if (!cancelled) { setMovers([]); setLoading(false); } return; }
        const data = await res.json();
        if (!cancelled) { setMovers(data.movers || []); setLoading(false); }
      } catch {
        if (!cancelled) { setMovers([]); setLoading(false); }
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canAccess, isAdmin]);

  const venues = useMemo(() => [...new Set(movers.map(m => m.venue))].sort(), [movers]);
  const raceNums = useMemo(() => [...new Set(movers.map(m => m.raceNum))].sort((a, b) => +a - +b), [movers]);

  const filteredBase = useMemo(() => {
    const windowHours = TIME_WINDOW_OPTIONS.find(w => w.key === timeWindow)?.hours;
    const now = Date.now();
    const rows = movers.filter(m => {
      if (m.pct < minPct) return false;
      if (minPrice && !(m.currentPrice >= minPrice)) return false;
      if (venue !== 'all' && m.venue !== venue) return false;
      if (direction !== 'all' && m.direction !== direction) return false;
      if (raceNum !== 'all' && m.raceNum !== raceNum) return false;
      if (windowHours != null) {
        const post = parsePostTime(m.postTime, dateRef.current);
        if (!post) return false;
        const diffMs = post.getTime() - now;
        if (diffMs < 0 || diffMs > windowHours * 60 * 60 * 1000) return false;
      }
      return true;
    });
    rows.sort((a, b) => sortBy === 'time'
      ? (parsePostTime(a.postTime, dateRef.current)?.getTime() ?? Infinity) - (parsePostTime(b.postTime, dateRef.current)?.getTime() ?? Infinity)
      : b.pct - a.pct);
    return rows;
  }, [movers, minPct, minPrice, sortBy, venue, direction, raceNum, timeWindow]);

  const { hideResulted, setHideResulted, filtered, resultedStat } = useResultedFilter(filteredBase);

  const { scrollRef, hasOverflow } = useScrollOverflow([filtered]);

  const selectStyle = { padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 11, background: '#fff' };
  const labelStyle = { fontSize: 10, color: '#6b7280', fontWeight: 600 };

  return (
    <div className="flex flex-1 overflow-hidden" style={{ position: 'relative' }}>
      {!canAccess && !isAdmin && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)' }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <i className="ti ti-lock" style={{ fontSize: 36, color: '#9ca3af', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Market Movers is a Lite feature</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>Upgrade to see every firmer and drifter across today&apos;s races</div>
            <button onClick={onUpgrade} style={{ padding: '9px 22px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Unlock with Lite
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3" style={{ filter: (canAccess || isAdmin) ? 'none' : 'blur(4px)', pointerEvents: (canAccess || isAdmin) ? 'auto' : 'none' }}>
        {/* Primary filters always visible; the rest (min price, race number,
            time window) collapse behind "More filters" so this row doesn't
            grow to 7 pickers wide on narrower viewports -- the ones kept
            inline are the ones expected to be used most often. */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label style={labelStyle}>Venue</label>
          <select value={venue} onChange={e => setVenue(e.target.value)} style={selectStyle}>
            <option value="all">All venues</option>
            {venues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <label style={{ ...labelStyle, marginLeft: 8 }}>Direction</label>
          <select value={direction} onChange={e => setDirection(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="firming">Firmers only</option>
            <option value="drifting">Drifters only</option>
          </select>
          <label style={{ ...labelStyle, marginLeft: 8 }}>Min move</label>
          <select value={minPct} onChange={e => setMinPct(+e.target.value)} style={selectStyle}>
            {MOVE_PCT_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
          </select>
          <label style={{ ...labelStyle, marginLeft: 8 }}>Sort</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
            <option value="move">Biggest move first</option>
            <option value="time">Race time</option>
          </select>
          <label style={{ ...labelStyle, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideResulted} onChange={e => setHideResulted(e.target.checked)} style={{ cursor: 'pointer' }} />
            Hide resulted
          </label>
          <button
            onClick={() => setMoreOpen(o => !o)}
            style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#00471b', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', display: 'flex', alignItems: 'center', gap: 2 }}
          >
            More filters <i className={`ti ${moreOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 11 }} />
          </button>
        </div>
        {moreOpen && (
          <div className="flex flex-wrap items-center gap-2 mb-3" style={{ padding: '6px 8px', background: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' }}>
            <label style={labelStyle}>Min price</label>
            <select value={minPrice} onChange={e => setMinPrice(+e.target.value)} style={selectStyle}>
              <option value={0}>None</option>
              <option value={2}>$2.00</option>
              <option value={5}>$5.00</option>
              <option value={10}>$10.00</option>
            </select>
            <label style={{ ...labelStyle, marginLeft: 8 }}>Race</label>
            <select value={raceNum} onChange={e => setRaceNum(e.target.value)} style={selectStyle}>
              <option value="all">All races</option>
              {raceNums.map(n => <option key={n} value={n}>R{n}</option>)}
            </select>
            <label style={{ ...labelStyle, marginLeft: 8 }}>Time window</label>
            <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)} style={selectStyle}>
              {TIME_WINDOW_OPTIONS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </div>
        )}

        {/* Win-rate summary -- always reflects filteredBase (every active
            filter except Hide Resulted), so toggling that display-only
            filter never hides the stat about the picks it's hiding. */}
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          {resultedStat.total === 0
            ? 'No results yet today'
            : <>{resultedStat.wins} of {resultedStat.total} resulted picks won today</>}
        </div>

        {/* Required attribution -- this tab is entirely PuntersEdge-sourced
            market-price data, same as the Field/Pace Map live-price row.
            Rendered unconditionally (loading/empty/populated), not tucked
            behind the Pro blur overlay above. */}
        <PuntersEdgeCredit style={{ marginBottom: 10 }} />

        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>Loading movers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
            No runners currently match this filter.
          </div>
        ) : (
          <>
            {hasOverflow && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <ScrollHint />
              </div>
            )}
            {/* Shared scroll-overflow wrapper (.ww-scroll-x, app/globals.css)
                + useScrollOverflow/ScrollHint -- same pattern as every other
                horizontally-scrollable table in the app, not reimplemented. */}
            <div ref={scrollRef} className="ww-scroll-x" style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Horse</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Race</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Time</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Open</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Current</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Move</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Result</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Margin</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>SP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={`${m.venue}-${m.raceNum}-${m.horseKey}`} style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{m.horseKey}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{m.venue} R{m.raceNum}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{m.postTime ? <RaceTimeLocal dateISO={dateRef.current} time={m.postTime} fallback="—" /> : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', whiteSpace: 'nowrap' }}>{m.openPrice != null ? `$${Number(m.openPrice).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', whiteSpace: 'nowrap' }}>{m.currentPrice != null ? `$${Number(m.currentPrice).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <FirmingDriftingBadge move={{ direction: m.direction, pct: m.pct }} />
                      </td>
                      <td style={{ padding: '5px 8px', color: m.finishPos === 1 ? '#059669' : '#374151', fontWeight: m.finishPos === 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{m.finishPos != null ? ordinal(m.finishPos) : '—'}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{m.margin || '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', whiteSpace: 'nowrap' }}>{m.sp != null ? `$${Number(m.sp).toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── value bets view ──────────────────────────────────────────────────────────

const EDGE_PCT_OPTIONS = [30, 50, 75, 100, 150, 200];

// Small inline pill matching FirmingDriftingBadge's visual convention (green
// filled pill, arrow, since every row here already passed the positive-edge
// filter -- there's no "negative value bet" to distinguish, unlike
// firming/drifting which genuinely has two directions).
function ValueEdgeBadge({ pct }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#059669', background: '#d1fae5', fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
      ▲ +{pct}%
    </span>
  );
}

// Two independent flags (see lib/confidence.js), each rendered only when
// true -- a well-tested, low-disagreement bet shows nothing extra next to
// its Edge badge. "Limited data" (genuine thin-data cases) and "Large
// disagreement" (an extreme model-vs-market gap on an otherwise well-
// tested runner) mean different things and are never merged into one
// label -- a 40+-start horse tripping only the disagreement flag must
// never read as "we don't know much about this horse." Both render if a
// bet trips both flags at once.
function ConfidenceBadge({ flags }) {
  if (!flags?.thinData && !flags?.disagreement) return null;
  return (
    <>
      {flags.thinData && (
        <span title="First starter, a first-starter-in-a-sprint, or this price range has too little validation history yet -- treat this edge with extra caution." style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#b91c1c', background: '#fee2e2', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap', marginTop: 2 }}>
          ⚠ Limited data
        </span>
      )}
      {flags.disagreement && (
        <span title="The model and market strongly disagree on this runner's price -- this isn't about thin data, it's a large gap worth extra scrutiny either way." style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#9a3412', background: '#ffedd5', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap', marginTop: 2 }}>
          ⚠ Large disagreement
        </span>
      )}
    </>
  );
}

// Same shell/filter pattern as MoversView -- reused deliberately rather than
// a parallel implementation. Reuses TIME_WINDOW_OPTIONS/parsePostTime (both
// module-level above, defined for Movers) since the Time-window filter is
// identical in meaning here.
function ValueBetsView({ canAccess, onUpgrade, isAdmin }) {
  const [bets, setBets]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [minEdge, setMinEdge] = useState(30);
  const [minPrice, setMinPrice] = useState(3);
  const [sortBy, setSortBy]   = useState('edge');
  const [venue, setVenue]     = useState('all');
  const [raceNum, setRaceNum] = useState('all');
  const [timeWindow, setTimeWindow] = useState('all');
  const [moreOpen, setMoreOpen] = useState(false);
  const dateRef = useRef(new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()));

  useEffect(() => {
    // Not Lite/Pro (and not the admin bypass, for consistency with Movers) --
    // skip the fetch entirely rather than hitting the plan-gated route just
    // to get a 403.
    if (!canAccess && !isAdmin) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/value-bets?date=${dateRef.current}`);
        if (!res.ok) { if (!cancelled) { setBets([]); setLoading(false); } return; }
        const data = await res.json();
        if (!cancelled) { setBets(data.bets || []); setLoading(false); }
      } catch {
        if (!cancelled) { setBets([]); setLoading(false); }
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canAccess, isAdmin]);

  const venues = useMemo(() => [...new Set(bets.map(b => b.venue))].sort(), [bets]);
  const raceNums = useMemo(() => [...new Set(bets.map(b => b.raceNum))].sort((a, b) => +a - +b), [bets]);

  // Every filter EXCEPT Hide Resulted -- this is what the win-rate stat
  // below is computed from, so toggling Hide Resulted (a display-only
  // filter on the table) never hides the stat about the very picks it's
  // hiding.
  const filteredBase = useMemo(() => {
    const windowHours = TIME_WINDOW_OPTIONS.find(w => w.key === timeWindow)?.hours;
    const now = Date.now();
    const rows = bets.filter(b => {
      if (b.pct < minEdge) return false;
      if (minPrice && !(b.marketPrice >= minPrice)) return false;
      if (venue !== 'all' && b.venue !== venue) return false;
      if (raceNum !== 'all' && b.raceNum !== raceNum) return false;
      if (windowHours != null) {
        const post = parsePostTime(b.postTime, dateRef.current);
        if (!post) return false;
        const diffMs = post.getTime() - now;
        if (diffMs < 0 || diffMs > windowHours * 60 * 60 * 1000) return false;
      }
      return true;
    });
    rows.sort((a, b) => sortBy === 'time'
      ? (parsePostTime(a.postTime, dateRef.current)?.getTime() ?? Infinity) - (parsePostTime(b.postTime, dateRef.current)?.getTime() ?? Infinity)
      : b.pct - a.pct);
    return rows;
  }, [bets, minEdge, minPrice, sortBy, venue, raceNum, timeWindow]);

  const { hideResulted, setHideResulted, filtered, resultedStat } = useResultedFilter(filteredBase);

  const { scrollRef, hasOverflow } = useScrollOverflow([filtered]);

  const selectStyle = { padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 11, background: '#fff' };
  const labelStyle = { fontSize: 10, color: '#6b7280', fontWeight: 600 };

  return (
    <div className="flex flex-1 overflow-hidden" style={{ position: 'relative' }}>
      {!canAccess && !isAdmin && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)' }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <i className="ti ti-lock" style={{ fontSize: 36, color: '#9ca3af', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Value Bets is a Lite feature</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>Upgrade to see every value opportunity across today&apos;s races</div>
            <button onClick={onUpgrade} style={{ padding: '9px 22px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Unlock with Lite
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3" style={{ filter: (canAccess || isAdmin) ? 'none' : 'blur(4px)', pointerEvents: (canAccess || isAdmin) ? 'auto' : 'none' }}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label style={labelStyle}>Venue</label>
          <select value={venue} onChange={e => setVenue(e.target.value)} style={selectStyle}>
            <option value="all">All venues</option>
            {venues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <label style={{ ...labelStyle, marginLeft: 8 }}>Min edge</label>
          <select value={minEdge} onChange={e => setMinEdge(+e.target.value)} style={selectStyle}>
            {EDGE_PCT_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
          </select>
          <label style={{ ...labelStyle, marginLeft: 8 }}>Sort</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
            <option value="edge">Biggest edge first</option>
            <option value="time">Race time</option>
          </select>
          <label style={{ ...labelStyle, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideResulted} onChange={e => setHideResulted(e.target.checked)} style={{ cursor: 'pointer' }} />
            Hide resulted
          </label>
          <button
            onClick={() => setMoreOpen(o => !o)}
            style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#00471b', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', display: 'flex', alignItems: 'center', gap: 2 }}
          >
            More filters <i className={`ti ${moreOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 11 }} />
          </button>
        </div>
        {moreOpen && (
          <div className="flex flex-wrap items-center gap-2 mb-3" style={{ padding: '6px 8px', background: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' }}>
            <label style={labelStyle}>Min price</label>
            <select value={minPrice} onChange={e => setMinPrice(+e.target.value)} style={selectStyle}>
              <option value={0}>None</option>
              <option value={3}>$3.00</option>
              <option value={5}>$5.00</option>
              <option value={10}>$10.00</option>
            </select>
            <label style={{ ...labelStyle, marginLeft: 8 }}>Race</label>
            <select value={raceNum} onChange={e => setRaceNum(e.target.value)} style={selectStyle}>
              <option value="all">All races</option>
              {raceNums.map(n => <option key={n} value={n}>R{n}</option>)}
            </select>
            <label style={{ ...labelStyle, marginLeft: 8 }}>Time window</label>
            <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)} style={selectStyle}>
              {TIME_WINDOW_OPTIONS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </div>
        )}

        {/* Win-rate summary -- always reflects filteredBase (every active
            filter except Hide Resulted), so toggling that display-only
            filter never hides the stat about the picks it's hiding. */}
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          {resultedStat.total === 0
            ? 'No results yet today'
            : <>{resultedStat.wins} of {resultedStat.total} resulted picks won today</>}
        </div>

        {/* Required attribution -- this tab is entirely PuntersEdge-sourced
            market-price data, same as the Field/Pace Map live-price row.
            Rendered unconditionally (loading/empty/populated), not tucked
            behind the Pro blur overlay above. */}
        <PuntersEdgeCredit style={{ marginBottom: 10 }} />

        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>Loading value bets…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
            No runners currently match this filter.
          </div>
        ) : (
          <>
            {hasOverflow && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <ScrollHint />
              </div>
            )}
            {/* Shared scroll-overflow wrapper -- same pattern as every other
                horizontally-scrollable table in the app, not rebuilt. In
                practice this table has fewer columns than Movers and is
                unlikely to overflow, but the same measured check means it
                still shows the hint correctly if it ever does (e.g. a very
                narrow viewport). */}
            <div ref={scrollRef} className="ww-scroll-x" style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Horse</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Race</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Time</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>WW $</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Price $</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Edge</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Result</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Margin</th>
                    <th style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>SP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => (
                    <tr key={`${b.venue}-${b.raceNum}-${b.horseKey}`} style={{ borderBottom: i === filtered.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{b.horseKey}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{b.venue} R{b.raceNum}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{b.postTime ? <RaceTimeLocal dateISO={dateRef.current} time={b.postTime} fallback="—" /> : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>{b.wwPrice != null ? `$${Number(b.wwPrice).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', whiteSpace: 'nowrap' }}>{b.marketPrice != null ? `$${Number(b.marketPrice).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <ValueEdgeBadge pct={b.pct} />
                          <ConfidenceBadge flags={b.confidence} />
                        </div>
                      </td>
                      <td style={{ padding: '5px 8px', color: b.finishPos === 1 ? '#059669' : '#374151', fontWeight: b.finishPos === 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{b.finishPos != null ? ordinal(b.finishPos) : '—'}</td>
                      <td style={{ padding: '5px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{b.margin || '—'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', whiteSpace: 'nowrap' }}>{b.sp != null ? `$${Number(b.sp).toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── blackbook modal ──────────────────────────────────────────────────────────

const BB_TAGS = ['Watch', 'Wet track', 'Value', 'Big run', 'Avoid'];
const BB_TAG_STYLES = {
  'Watch':     { bg: '#dcfce7', color: '#166534' },
  'Wet track': { bg: '#fef3c7', color: '#92400e' },
  'Value':     { bg: '#eff6ff', color: '#1e40af' },
  'Big run':   { bg: '#fce7f3', color: '#9d174d' },
  'Avoid':     { bg: '#fef2f2', color: '#dc2626' },
};

const BB_STAR_COLORS = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#22c55e', 5:'#f59e0b' };

function BlackbookModal({ target, onClose, userId, canAccess }) {
  const horseName   = typeof target === 'string' ? target : (target?.name || '');
  const venue       = typeof target === 'object' ? (target?.venue || '') : '';
  const raceNumber  = typeof target === 'object' ? (target?.raceNumber || '') : '';
  const distance    = typeof target === 'object' ? (target?.distance || '') : '';
  const cls         = typeof target === 'object' ? (target?.cls || '') : '';

  const isMobile = useIsMobile();
  const [open,     setOpen]     = useState(false);
  const [note,     setNote]     = useState('');
  const [tags,     setTags]     = useState([]);
  const [priority, setPriority] = useState(0);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => { setOpen(true); }, []);

  const toggleTag = t => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const starColor = BB_STAR_COLORS[priority] || '#d1d5db';

  const handleSave = async () => {
    if (!SURL || !SKEY || !userId || !canAccess) return;
    setSaving(true);
    const payload = {
      clerk_id: userId,
      horse_name: horseName,
      venue: venue || null,
      race_number: raceNumber || null,
      distance: distance || null,
      class: cls || null,
      note, tags, priority,
      added_at: new Date().toISOString(),
    };
    console.log('[BB Save] attempting save:', { clerk_id: userId, horse_name: horseName, venue, raceNumber });
    try {
      const res = await fetch(`${SURL}/rest/v1/blackbook`, {
        method: 'POST',
        headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(payload),
      });
      console.log('[BB Save] response status:', res.status);
      const responseText = await res.clone().text();
      console.log('[BB Save] response body:', responseText);
      if (res.ok) {
        awardPoints(userId, 'blackbook_save', horseName).catch(ptErr => {
          console.error('[BB Save] points error:', ptErr);
        });
      }
    } catch (err) {
      console.error('[BB Save] fetch error:', err);
    }
    setSaving(false);
    setSaved(true);
    window.dispatchEvent(new Event('ww:profile:refresh'));
    setTimeout(onClose, 1500);
  };

  // Shared form body
  const bbBody = (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'#111827', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:6, padding:'6px 10px' }}>
        {horseName}
        {(venue || raceNumber || distance || cls) && (
          <div style={{ fontSize:10, fontWeight:400, color:'#6b7280', marginTop:2 }}>
            {[venue, raceNumber && `R${raceNumber}`, distance && `${distance}m`, cls].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div>
        <label style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:4 }}>Note</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Add a note…"
          style={{ width:'100%', border:'1px solid #e5e7eb', borderRadius:6, padding:'5px 8px', fontSize:11, resize:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:6 }}>Tags</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {BB_TAGS.map(t => {
            const s = BB_TAG_STYLES[t]; const sel = tags.includes(t);
            return (
              <span key={t} onClick={() => toggleTag(t)}
                style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:10, background:sel?s.bg:'#f3f4f6', color:sel?s.color:'#6b7280', border:`1px solid ${sel?s.color+'40':'#e5e7eb'}`, cursor:'pointer', userSelect:'none' }}>
                {t}
              </span>
            );
          })}
        </div>
      </div>
      <div>
        <label style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:6 }}>Priority</label>
        <div style={{ display:'flex', gap:4 }}>
          {[1,2,3,4,5].map(n => (
            <span key={n} onClick={() => setPriority(n === priority ? 0 : n)}
              style={{ fontSize:20, color:n<=priority?starColor:'#d1d5db', cursor:'pointer' }}>★</span>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', gap:8, justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
        {!isMobile && (
          <button onClick={onClose} style={{ padding:'6px 12px', border:'1px solid #e5e7eb', borderRadius:6, background:'#fff', cursor:'pointer', fontSize:11, fontWeight:600, color:'#374151' }}>Cancel</button>
        )}
        <button onClick={handleSave} disabled={saving||saved}
          style={{ flex: isMobile ? 1 : undefined, padding:'11px 16px', border:'none', borderRadius:6, background:saved?'#059669':'#00471b', color:'#fff', cursor:saving||saved?'default':'pointer', fontSize:13, fontWeight:700 }}>
          {saved ? 'Added! +2pts' : saving ? 'Saving…' : 'Add to Blackbook'}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <BottomSheet isOpen={open} onClose={onClose} title="Add to Blackbook">
        {bbBody}
      </BottomSheet>,
      document.body
    );
  }

  return createPortal(
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9998 }} onClick={onClose} />
      <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16, pointerEvents:'none' }}>
        <div style={{ background:'#fff', borderRadius:10, width:380, maxWidth:'95vw', overflow:'hidden', pointerEvents:'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ background:'#00471b', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Add to Blackbook</span>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
          </div>
          {bbBody}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function RacesPage() {
  return <Suspense><RacesPageInner /></Suspense>;
}

function RacesPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { user }     = useUser();
  const isPro        = useIsPro();
  const plan         = usePlan();
  const canMovers    = hasFeature(plan, 'movers');
  const canValueBets = hasFeature(plan, 'value_bets');
  const canLiveOdds  = hasFeature(plan, 'live_odds');
  const canPaceMap   = hasFeature(plan, 'pace_map');
  const isMobile     = useIsMobile();
  const isNarrow     = useIsNarrowWidth();
  const { settings: userSettings, loading: settingsLoading } = useUserSettings();
  const preferredViewRef = useRef('field');
  console.log('[Tier] isPro:', isPro, 'plan:', user?.publicMetadata?.plan);

  // Live odds (PuntersEdge) was opened to everyone 2026-10-01 when
  // PuntersEdge moved to a Plus plan, removing the licensing reason for the
  // earlier admin-only gate (905d605) -- but the isAdmin props threaded into
  // FieldView/PaceMapView were left hardcoded `true` rather than actually
  // removed, so every signed-in user (any plan) ended up seeing live
  // prices/Move data regardless of isAdmin's real value. Re-gated to lite+
  // below (canAccessLivePrices) now that Lite exists as a real tier to sell
  // it on. isSiteAdminUser is still used for the things that stay
  // admin-only forever (calibration curve bypass, Trust $ preview).
  const isSiteAdminUser = isSiteAdmin(user?.id);
  // Real admin bypass, same convention as canMovers/canValueBets's isAdmin
  // param -- gates both the /api/race-live-prices fetch below and every
  // render site that used to receive a hardcoded isAdmin={true}.
  const canAccessLivePrices = canLiveOdds || isSiteAdminUser;
  const [oddsBookmaker, setOddsBookmakerState] = useState(() => {
    try { return localStorage.getItem('ww_odds_bookmaker') || PUNTERSEDGE_BOOKMAKER_COLUMNS[0]?.slug || ''; } catch { return PUNTERSEDGE_BOOKMAKER_COLUMNS[0]?.slug || ''; }
  });
  const setOddsBookmaker = (slug) => {
    setOddsBookmakerState(slug);
    try { localStorage.setItem('ww_odds_bookmaker', slug); } catch {}
  };
  const [livePrices, setLivePrices] = useState({});
  const [marketMoves, setMarketMoves] = useState({});

  // Sort/view persisted the same way as oddsBookmaker above (localStorage,
  // wrapped in try/catch). compactView defaults to Compact under 768px
  // (isNarrow) the first time it's read, same breakpoint useIsNarrowWidth
  // already uses for the rail layout -- only read once since isNarrow isn't
  // known on the very first render pass either way.
  const [sortMode, setSortModeState] = useState(() => {
    try { return localStorage.getItem('ww_sort_mode') || 'score'; } catch { return 'score'; }
  });
  const setSortMode = (m) => { setSortModeState(m); try { localStorage.setItem('ww_sort_mode', m); } catch {} };
  const [compactView, setCompactViewState] = useState(() => {
    try {
      const saved = localStorage.getItem('ww_compact_view');
      if (saved !== null) return saved === '1';
      return typeof window !== 'undefined' && window.innerWidth <= 768;
    } catch { return false; }
  });
  const setCompactView = (v) => { setCompactViewState(v); try { localStorage.setItem('ww_compact_view', v ? '1' : '0'); } catch {} };
  const [highlightName, setHighlightName] = useState(null);
  const [upNextOpen, setUpNextOpen] = useState(false);

  // Phase 2 calibration is now the real WW $ for every Pro user (shipped
  // -- was admin-only preview until now). Fetched once on Pro load, not
  // per-race, since the active curve changes at most weekly (Part C's
  // recalibration cadence), not per page view. isSiteAdminUser kept as a
  // bypass so admin can still see it without a Pro flag, same convention
  // as this page's other Pro-gated fetches.
  const [calibrationCurve, setCalibrationCurve] = useState(null);
  useEffect(() => {
    if (!isPro && !isSiteAdminUser) { setCalibrationCurve(null); return; }
    let cancelled = false;
    fetch('/api/calibration-curve')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setCalibrationCurve(data?.curve || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isPro, isSiteAdminUser]);

  // Phase 3 Trust Engine preview (admin-only, preview-only -- no new
  // blend is live for regular users). Same once-on-admin-load fetch
  // pattern as the calibration curve above.
  const [trustBuckets, setTrustBuckets] = useState(null);
  useEffect(() => {
    if (!isSiteAdminUser) { setTrustBuckets(null); return; }
    let cancelled = false;
    fetch('/api/trust-blend-ratios')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setTrustBuckets(data?.buckets || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isSiteAdminUser]);

  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  // Only tomorrow's card is actually populated by the pipeline right now — cap
  // the picker there rather than leaving it unbounded. Bump this once further-
  // ahead data exists instead of hardcoding a wider window blind.
  const maxSelectableDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [histLoading,  setHistLoading]  = useState(false);
  // isHistoricalMode = "not today" (either direction) — used for framing that's
  // genuinely shared both ways (date label, "back to today", today-only API gates).
  // isPast/isFuture split out specifically for betting-enablement and copy that
  // must NOT apply to tomorrow the same way it applies to a real past date.
  const isHistoricalMode = selectedDate !== todayISO;
  const isToday  = selectedDate === todayISO;
  const isFuture = selectedDate > todayISO;
  const isPast   = !isToday && !isFuture;
  const wasHistoricalRef = useRef(false);
  const dateInputRef     = useRef(null);
  // Set once per mount from race_cards (already-resolved source of truth) --
  // lets buildRaces() disambiguate a bare, ambiguous CSV Meeting name (e.g.
  // "RANDWICK" when it's actually today's Randwick Ins meeting) the same way
  // puntersedge-refs does. A ref, not state: loadCSV reads it synchronously
  // and runs before the fetch that populates it would have committed a
  // re-render, so a state value could still be stale on that first call.
  const venuesWithDataRef = useRef(null);

  const [csvLoading,  setCsvLoading]  = useState(true);
  const [allRaces,    setAllRaces]    = useState({});
  const [allVenues,   setAllVenues]   = useState({});
  const [raceKeys,    setRaceKeys]    = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [trackConds,  setTrackConds]  = useState({});
  const [weights,     setWeights]     = useState(getDefaultWeights);
  const [fileName,    setFileName]    = useState('');
  const [view,        setView]        = useState('field');
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [betTarget,     setBetTarget]     = useState(null);
  const [generalBetOpen, setGeneralBetOpen] = useState(false);
  const [raceResults,   setRaceResults]   = useState({});
  const [resultPopup,   setResultPopup]   = useState(null);
  const [bbTarget,      setBbTarget]      = useState(null);
  const [meetingsSynced, setMeetingsSynced] = useState(false);
  const [todayBets,     setTodayBets]     = useState({});
  const [venueTrackConds, setVenueTrackConds] = useState({});
  const [venueAbandoned,  setVenueAbandoned]  = useState(new Set());
  const [venueCalendarMismatch, setVenueCalendarMismatch] = useState(new Set());
  const [scratchedRows,   setScratchedRows]   = useState([]);
  const [now,             setNow]             = useState(() => Date.now());
  const popupRef     = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isPro || !user?.id || !SURL || !SKEY) return;
    const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    fetch(`${SURL}/rest/v1/bet_log?clerk_id=eq.${user.id}&date=eq.${d}&select=venue,race_number,horse_name`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const m = {};
        (Array.isArray(rows) ? rows : []).forEach(r => {
          const k = `${normaliseVenue(r.venue||'')}||${String(r.race_number)}`;
          if (!m[k]) m[k] = [];
          m[k].push(r.horse_name || '');
        });
        setTodayBets(m);
      })
      .catch(() => {});
  }, [isPro, user?.id]);

  const groupWeightApplied = useRef(false);
  useEffect(() => {
    if (settingsLoading) return;
    const map = { 'Field': 'field', 'Form': 'form', 'Pace Map': 'pacemap' };
    const mapped = map[userSettings.racesTab] || 'field';
    preferredViewRef.current = mapped;
    if (!Object.keys(allRaces).length) setView(mapped);
    if (!groupWeightApplied.current) {
      groupWeightApplied.current = true;
      if (userSettings.racesGroup && userSettings.racesGroup !== 'All') {
        setWeights(weightsByGroup(userSettings.racesGroup));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading]);

  const colVis = isPro ? {
    form: userSettings.colForm !== false,
    speed: userSettings.colSpeed !== false,
    cond: userSettings.colConditions !== false,
    conn: userSettings.colConnections !== false,
    score: userSettings.colScore !== false,
    edge: userSettings.colEdge !== false,
    value: userSettings.colValue !== false,
  } : { form: true, speed: true, cond: true, conn: true, score: true, edge: true, value: true };

  const currentRace = selectedKey ? allRaces[selectedKey] : null;

  // livePrices (single selected bookmaker) + marketMoves (best price across
  // all bookmakers, open vs current -- also backs the race-header top-
  // firmer/top-drifter pills, no separate fetch for those) -- both now come
  // from one server route, /api/race-live-prices, which actually enforces
  // lite+ (or real site-admin) server-side. This used to be two direct
  // client-side Supabase REST calls with the anon key and no auth check at
  // all, displayed behind an `isAdmin` prop that was hardcoded true
  // everywhere it reached a render site -- i.e. every signed-in user, any
  // plan, already saw all of this. canAccessLivePrices (declared below,
  // near the other hasFeature() flags) gates this fetch so a free user's
  // browser doesn't even make the call.
  useEffect(() => {
    if (!canAccessLivePrices || !currentRace?.venue || !currentRace?.num) {
      setLivePrices({});
      setMarketMoves({});
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const venue = normaliseVenue(currentRace.venue);
        const raceNum = String(currentRace.num);
        const params = new URLSearchParams({ venue, raceNum, date: selectedDate });
        if (oddsBookmaker) params.set('bookmaker', oddsBookmaker);
        const res = await fetch(`/api/race-live-prices?${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setLivePrices(data.livePrices || {});
          setMarketMoves(data.marketMoves || {});
        }
      } catch {}
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canAccessLivePrices, oddsBookmaker, currentRace?.venue, currentRace?.num, selectedDate]);

  // Live best-price data for the first-starter score blend below --
  // separate from the admin-only marketMoves fetch above (that one also
  // feeds the admin Firming/Drifting display, which stays admin-gated).
  // This one affects the actual WW$/rank every Pro user sees for a
  // starts=0 runner, so it can't be limited to admins the way that
  // display-only fetch is -- gated on isPro instead, matching the
  // scoring block below it (myOdds is never computed for non-Pro users
  // at all). Same fetchMarketMoveFlags() helper Movers/OddsTable/Value
  // Bets already use, not a new fetch path.
  const [firstStarterLiveFlags, setFirstStarterLiveFlags] = useState({});
  useEffect(() => {
    if (!isPro || !currentRace?.venue || !currentRace?.num) {
      setFirstStarterLiveFlags({});
      return;
    }
    let cancelled = false;
    async function loadFlags() {
      const venue = normaliseVenue(currentRace.venue);
      const raceNum = String(currentRace.num);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
      const flags = await fetchMarketMoveFlags({ venue, raceNum, date });
      if (!cancelled) setFirstStarterLiveFlags(flags);
    }
    loadFlags();
    const interval = setInterval(loadFlags, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isPro, currentRace?.venue, currentRace?.num]);

  const trackCond = (currentRace && trackConds[currentRace.venue]) || 'good';
  // Distinct from trackCond itself: whether that value is real (DB-confirmed via
  // today_meetings, or the user manually picked one) vs just the unset 'good'
  // fallback — a future date never gets the DB auto-apply (today_meetings is
  // today-only), so without this it would silently look identical to a real
  // confirmed "Good" reading.
  const trackCondConfirmed = !!(currentRace && trackConds[currentRace.venue]);
  const setTrackCond = useCallback(tc => {
    if (!currentRace) return;
    setTrackConds(prev => ({ ...prev, [currentRace.venue]: tc }));
    if (!isToday) return; // this endpoint always writes today's date — never valid for a past OR future selection
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    fetch('/api/set-track-condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue: normaliseVenue(currentRace.venue), date: todayISO, condition: tc }),
    }).catch(e => console.error('[TC override]', e));
  }, [currentRace, isToday]);

  const handleLogBet = useCallback((runner, rank) => {
    if (!isPro) { setUpgradeOpen(true); return; }
    const rc = allRaces[selectedKey];
    setBetTarget({ ...runner, _rank: rank, _venue: rc?.venue, _raceNum: rc?.num, _raceName: rc?.name || null, _meetingDate: rc?.date || null, _trackCond: trackCond, _myOdds: runner.rawOdds, _raceTime: rc?.time || null, _fieldSize: (rc?.horses ? rc.horses.filter(h => !h.scratched).length : 0) || null });
  }, [allRaces, selectedKey, trackCond, isPro]);

  const handleOpenGeneralBet = useCallback(() => {
    if (!isPro) { setUpgradeOpen(true); return; }
    setGeneralBetOpen(true);
  }, [isPro]);

  const handleGeneralBetPick = useCallback((horse) => {
    setGeneralBetOpen(false);
    setBetTarget(horse);
  }, []);

  const hideTimerRef = useRef(null);

  useEffect(() => {
    window.__addToBlackbook = (data) => {
      if (!isPro) { setUpgradeOpen(true); return; }
      const popup = document.getElementById('horse-popup');
      if (popup) popup.style.display = 'none';
      setBbTarget(typeof data === 'string' ? { name: data } : data);
    };
    window.__logBet = (data) => {
      if (isPast) return; // popup log-bet blocked only for genuinely past dates — tomorrow stays bettable
      if (!isPro) { setUpgradeOpen(true); return; }
      const rc = allRaces[selectedKey];
      const popup = document.getElementById('horse-popup');
      if (popup) popup.style.display = 'none';
      setBetTarget({
        ...data,
        _venue: data._venue || rc?.venue,
        _raceNum: data._raceNum || rc?.num,
        _raceName: rc?.name || null,
        _meetingDate: rc?.date || null,
        _trackCond: trackCond,
        _myOdds: data.rawOdds,
        _fieldSize: (rc?.horses ? rc.horses.filter(h => !h.scratched).length : 0) || null,
      });
    };
    return () => { delete window.__addToBlackbook; delete window.__logBet; };
  }, [allRaces, selectedKey, trackCond, isPro, isPast]);

  const loadCSV = useCallback((text, name, selectKey) => {
    try {
      const { allRaces: ar, allVenues: av, raceKeys: rk } = buildRaces(parseCSV(text), venuesWithDataRef.current);
      if (rk.length === 0) { alert('No races found — check Race Number column'); return; }
      setAllRaces(ar); setAllVenues(av); setRaceKeys(rk);
      const defaultKey = (() => {
        const nowMs = Date.now();
        let bestKey = null, bestTime = Infinity;
        for (const k of rk) {
          const rc = ar[k];
          const t = parseRaceTime(rc?.time, rc?.date)?.getTime();
          if (t && t > nowMs && t < bestTime) { bestTime = t; bestKey = k; }
        }
        return bestKey || rk[0];
      })();
      setSelectedKey(selectKey && rk.includes(selectKey) ? selectKey : defaultKey);
      setFileName(name); setView(preferredViewRef.current);
    } catch (err) { alert('Error parsing CSV: ' + err.message); }
  }, []);

  const handleFile = useCallback(async (text, name) => {
    localStorage.setItem('ww_csv', text);
    localStorage.setItem('ww_csv_name', name);
    loadCSV(text, name, null);

    try {
      const res = await fetch('/api/upload-race-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const { meetingsSynced: synced } = await res.json();
        if (synced) setMeetingsSynced(true);
      } else {
        console.error('[Races] upload-race-csv failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[Races] upload-race-csv error:', err);
    }
  }, [loadCSV]);

  // On mount: fetch race_cards' distinct venues first (already-resolved
  // source of truth, same one puntersedge-refs checks against) so loadCSV
  // can disambiguate an ambiguous bare CSV Meeting name on its very first
  // call -- then load today's CSV from Storage, falling back to localStorage.
  useEffect(() => {
    const selectParam = searchParams.get('select');
    const loadToday = () => {
      fetch('/api/today-csv')
        .then(r => r.ok ? r.text() : Promise.reject(r.status))
        .then(text => {
          localStorage.setItem('ww_csv', text);
          localStorage.setItem('ww_csv_name', 'today.csv');
          loadCSV(text, 'today.csv', selectParam);
          setCsvLoading(false);
        })
        .catch(() => {
          const saved = localStorage.getItem('ww_csv');
          const savedName = localStorage.getItem('ww_csv_name') || 'saved.csv';
          if (saved) loadCSV(saved, savedName, selectParam);
          setCsvLoading(false);
        });
    };
    if (!SURL || !SKEY) { loadToday(); return; }
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    // fetchAllRows, not a plain fetch -- race_cards routinely exceeds
    // PostgREST's 1000-row default page size on a big day (confirmed: 1172
    // rows for a single day during the puntersedge-refs flickering
    // investigation), and a truncated page could plausibly miss a real
    // venue's rows entirely if it sits past the cutoff alphabetically.
    fetchAllRows(
      `${SURL}/rest/v1/race_cards?date=eq.${todayISO}&select=venue`,
      { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    )
      .then(result => { venuesWithDataRef.current = new Set((result.ok ? result.rows : []).map(r => r.venue)); })
      .catch(() => { venuesWithDataRef.current = null; })
      .finally(loadToday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Historical date fetch — fires when selectedDate changes
  useEffect(() => {
    if (!isHistoricalMode) {
      if (!wasHistoricalRef.current) return; // initial mount, handled above
      wasHistoricalRef.current = false;
      setAllRaces({}); setAllVenues({}); setRaceKeys([]); setSelectedKey(null);
      setScratchedRows([]); setRaceResults({}); setTrackConds({});
      const saved = localStorage.getItem('ww_csv');
      const savedName = localStorage.getItem('ww_csv_name') || 'today.csv';
      if (saved) { loadCSV(saved, savedName, null); return; }
      // No local CSV — fall back to server data for today
      setHistLoading(true);
      fetch(`/api/race-cards?date=${todayISO}`)
        .then(r => (r.ok ? r.json() : null))
        .then(rows => {
          setHistLoading(false);
          if (!rows?.length) return;
          const ar = {}, av = {};
          rows.forEach(row => {
            const key = `${row.venue}_R${row.race_num}`;
            if (!ar[key]) ar[key] = { venue: row.venue, num: row.race_num, date: row.date, horses: [] };
            if (row.form_data) ar[key].horses.push(row.form_data);
            if (!av[row.venue]) av[row.venue] = [];
            if (!av[row.venue].includes(key)) av[row.venue].push(key);
          });
          const rk = Object.values(av).flat();
          setAllRaces(ar); setAllVenues(av); setRaceKeys(rk); setSelectedKey(rk[0] || null);
          fetchRaceResultsForDate(todayISO).then(setRaceResults);
        })
        .catch(() => setHistLoading(false));
      return;
    }
    wasHistoricalRef.current = true;
    setHistLoading(true);
    setAllRaces({});
    setAllVenues({});
    setRaceKeys([]);
    setSelectedKey(null);
    setScratchedRows([]);
    setRaceResults({});
    setTrackConds({});
    fetch(`/api/race-cards?date=${selectedDate}`)
      .then(r => {
        if (r.status === 403) { setUpgradeOpen(true); setSelectedDate(todayISO); return null; }
        return r.ok ? r.json() : null;
      })
      .then(rows => {
        setHistLoading(false);
        if (!rows?.length) return;
        const ar = {}, av = {};
        rows.forEach(row => {
          const key = `${row.venue}_R${row.race_num}`;
          if (!ar[key]) ar[key] = { venue: row.venue, num: row.race_num, date: row.date, horses: [] };
          if (row.form_data) ar[key].horses.push(row.form_data);
          if (!av[row.venue]) av[row.venue] = [];
          if (!av[row.venue].includes(key)) av[row.venue].push(key);
        });
        const rk = Object.values(av).flat();
        setAllRaces(ar);
        setAllVenues(av);
        setRaceKeys(rk);
        setSelectedKey(rk[0] || null);
        fetchRaceResultsForDate(selectedDate).then(setRaceResults);
      })
      .catch(() => setHistLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Fetch race results and scratchings when allRaces loads
  useEffect(() => {
    const keys = Object.keys(allRaces);
    if (keys.length === 0) return;
    const firstRace = allRaces[keys[0]];
    const dateISO = toISO(firstRace?.date);
    if (!dateISO) return;
    fetchRaceResultsForDate(dateISO).then(setRaceResults);
    if (SURL && SKEY) {
      const scrUrl = `${SURL}/rest/v1/scratchings?date=eq.${dateISO}&select=venue,race_num,horse_name`;
      console.log('[Scratchings] querying date:', dateISO);
      fetch(scrUrl, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } })
        .then(r => { console.log('[Scratchings] status:', r.status); return r.ok ? r.json() : []; })
        .then(rows => {
          const data = Array.isArray(rows) ? rows : [];
          console.log('[Scratchings] storing', data.length, 'raw rows');
          setScratchedRows(data);
        })
        .catch(e => console.log('[Scratchings] error:', e));
    }
  }, [allRaces]);

  // Fetch today_meetings for track conditions and abandoned status
  useEffect(() => {
    if (!SURL || !SKEY) return;
    if (isHistoricalMode) return;
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    fetch(
      `${SURL}/rest/v1/today_meetings?date=eq.${todayISO}&select=venue,track_condition,condition_override,is_abandoned,calendar_mismatch`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    )
      .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(`HTTP ${r.status}: ${t}`)))
      .then(rows => {
        const tc = {}, aband = new Set(), mismatch = new Set();
        rows.forEach(r => {
          const norm = normaliseVenue(r.venue);
          const effectiveCond = r.condition_override || r.track_condition;
          if (effectiveCond) tc[norm] = effectiveCond;
          if (r.is_abandoned) aband.add(norm);
          // Never show "Not on Calendar" for a known NZ venue (e.g. one
          // that leaked into today_meetings via the CSV import -- see the
          // TRENTHAM cross-contamination finding) -- the backend's own
          // calendar_mismatch is computed against RA's live AU calendar,
          // which by definition never lists an NZ venue, so an NZ row
          // would always get flagged there even though it's not a real
          // "missing from the AU calendar" case worth badging. isNzVenue
          // (blocklist), not isKnownAuVenue (allowlist) -- an unlisted
          // genuine AU venue must still get the badge as before; only a
          // positively-identified NZ name is suppressed.
          if (r.calendar_mismatch && !isNzVenue(r.venue)) mismatch.add(norm);
        });
        console.log('[today_meetings] track conds:', Object.keys(tc).length, 'abandoned:', [...aband], 'not on calendar:', [...mismatch]);
        setVenueTrackConds(tc);
        setVenueAbandoned(aband);
        setVenueCalendarMismatch(mismatch);
      })
      .catch(e => console.error('[today_meetings] fetch failed:', e));
  }, [allRaces, isHistoricalMode]);

  // Auto-apply DB track conditions to scoring when venueTrackConds loads
  useEffect(() => {
    if (isHistoricalMode) return;
    if (!Object.keys(venueTrackConds).length || !Object.keys(allRaces).length) return;
    setTrackConds(prev => {
      const next = { ...prev };
      Object.values(allRaces).forEach(rc => {
        if (!rc?.venue || next[rc.venue]) return; // skip if user already set
        const rawUpper = (rc.venue || '').toUpperCase();
        const raw = venueTrackConds[normaliseVenue(rawUpper)] || '';
        if (!raw) return;
        const tcl = raw.toLowerCase();
        next[rc.venue] = tcl.includes('heavy') ? 'heavy'
                       : tcl.includes('soft') || tcl.includes('slow') ? 'soft'
                       : tcl.includes('synth') ? 'synthetic'
                       : 'good';
      });
      return next;
    });
  }, [venueTrackConds, allRaces, isHistoricalMode]);

  const hasData = raceKeys.length > 0;

  const currentRaceResult = (() => {
    if (!currentRace) return null;
    const key = `${normaliseVenue(currentRace.venue)}||${String(currentRace.num)}`;
    return raceResults[key] || null;
  })();

  // Meeting-wide Pace Bias points (same scoring as Results page's
  // TrackBiasPanel) -- every resulted race at this venue today, top-3
  // finishers' pre-race predicted role earns pointsForPlace(). Recomputes
  // live as more races at this venue result through the day. trackCond is
  // the single venue-wide value (same one scoring/PaceMapView use
  // everywhere else on this page) rather than a per-race value, since this
  // page already treats track condition as one value per venue, not per race.
  const paceBiasPoints = useMemo(() => {
    if (!currentRace) return null;
    const roles = { Leader: 0, Presser: 0, Midfield: 0, Closer: 0, Backmarker: 0 };
    const venueRaceKeys = allVenues[currentRace.venue] || [];
    venueRaceKeys.forEach(key => {
      const rc = allRaces[key];
      if (!rc) return;
      const rr = raceResults[`${normaliseVenue(rc.venue)}||${String(rc.num)}`];
      if (!rr || !rr.runners?.length) return;
      rr.runners.filter(r => r.place >= 1 && r.place <= 3).forEach(runner => {
        const horse = (rc.horses || []).find(h => stripCountry(h.name).toUpperCase() === stripCountry(runner.name).toUpperCase());
        if (!horse) return;
        const { role } = calcPaceMap(horse, rc.venue, +rc.dist, trackCond);
        if (!(role in roles)) return;
        roles[role] += pointsForPlace(runner.place);
      });
    });
    return roles;
  }, [currentRace, allVenues, allRaces, raceResults, trackCond]);

  // No race-status restriction — logging is allowed before jump, after jump,
  // and after resulting (matches /api/log-bet, which has no gate at all).
  // isPast alone still blocks: that's the date-picker showing a different,
  // genuinely historical day, not a race-status condition on the currently
  // selected race.
  const betBlocked = isPast;

  // Compute scored results once per race/trackCond/weights change
  const { results, scratched, scratchingsSet, allHorsesForDisplay } = useMemo(() => {
    if (!currentRace) return { results: [], scratched: [], scratchingsSet: new Set(), allHorsesForDisplay: [] };

    // Build scratchings Set synchronously from raw rows — avoids async-overwrite race condition
    const s = new Set();
    scratchedRows.forEach(row => {
      s.add(`${normaliseVenue(row.venue)}||${String(row.race_num)}||${(row.horse_name || '').toUpperCase()}`);
    });
    console.log('[Scratchings] set size:', s.size, 'sample:', [...s].slice(0, 3));

    // Normalize race venue once for DB scratching lookup
    const rcNormV = normaliseVenue(currentRace.venue);
    const isDbScr = h => s.has(`${rcNormV}||${String(currentRace.num)}||${stripCountry(h.name).toUpperCase()}`);

    // Exclude CSV-scratched AND DB-scratched from the scored field
    const active = currentRace.horses.filter(h => !h.scratched && !isDbScr(h));
    const scr    = currentRace.horses.filter(h =>  h.scratched || isDbScr(h));

    // Renumber barriers 1,2,3... in original BP order across the live field
    const byOrigBP = [...active].sort((a, b) => (+a['BP'] || 99) - (+b['BP'] || 99));
    const barrierMap = new Map(byOrigBP.map((h, i) => [h.name, i + 1]));

    let res = active.map(h => {
      const liveBarrier = barrierMap.get(h.name) ?? +h['BP'] ?? 99;
      const hScored = { ...h, 'BP': liveBarrier };
      if (!isPro) return { ...hScored, grpScores: {}, totalFromGroups: 0, myOdds: null };
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(hScored, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...hScored, grpScores, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    if (isPro) {
      // Calibration (Phase 2) is now the real WW $ for everyone -- the
      // SAME shared function (lib/livePricing.js) lib/valueBets.js's
      // server-side pricing uses, fed by the same active-curve source,
      // so Field tab/Pace Map and Value Bets can never disagree. Blends
      // any starts=0 runner's score with its live market price when one
      // exists (falls back to the score above unchanged otherwise) --
      // must happen before the final pricing step so rank stays
      // consistent with price for every runner, including whichever
      // runners a promoted/demoted first starter displaces -- and the
      // blend itself now weighs the live price against the CALIBRATED
      // model price (curvePoints passed through), not the pre-
      // calibration one.
      // 'jtrat' (Joc/Trn Combo) is shipped live as of 2026-09-18 -- it's
      // just another Connections-group factor scoreGroup already includes
      // in totalFromGroups above, same as jocrat/trnrat. No separate preview
      // pass needed any more (was admin-only via a parallel computation,
      // 2809622, until validated for shipping) -- same retirement pattern
      // as Phase 2's Cal $ preview once calibration itself went live.
      const curvePoints = CALIBRATION_ENABLED ? calibrationCurve?.curve_points : null;
      res = blendFirstStarterLivePrices(res, firstStarterLiveFlags, marketMoveNameKey, curvePoints);
      const oddsArr = calculateLiveOdds(res, curvePoints);
      res.forEach((r, i) => { r.myOdds = oddsArr[i]; });
    }

    // Best/worst per group for cell highlighting
    if (isPro) GRP_KEYS.forEach(gk => {
      const vals = res.map(r => r.grpScores[gk].total);
      const best = Math.max(...vals), worst = Math.min(...vals);
      res.forEach(r => {
        r._grpIsBest  = r._grpIsBest  || {};
        r._grpIsWorst = r._grpIsWorst || {};
        r._grpIsBest[gk]  = Math.abs(r.grpScores[gk].total - best)  < 0.001 && best !== worst;
        r._grpIsWorst[gk] = Math.abs(r.grpScores[gk].total - worst) < 0.001 && best !== worst;
      });
    });

    // systemRank -- the model's own score rank, fixed once here regardless
    // of whatever order the Sort control later displays rows in (the RANK
    // badge should always mean "model rank", not "position in this sort").
    res.forEach((r, i) => { r.systemRank = i + 1; });

    // DB-scratched horses (not CSV-scratched) appended for display; FieldView/FormView filter them via scratchingsSet
    const dbScratchedOnly = currentRace.horses.filter(h => !h.scratched && isDbScr(h));
    const allHorsesForDisplay = [...res, ...dbScratchedOnly];

    return { results: res, scratched: scr, scratchingsSet: s, allHorsesForDisplay };
  }, [currentRace, trackCond, weights, scratchedRows, isPro, firstStarterLiveFlags, calibrationCurve, isSiteAdminUser]);

  // Sort control reorders the active field for display only -- systemRank
  // (set above) stays the model rank no matter which sort is active.
  const sortedResults = useMemo(() => {
    const arr = [...results];
    if (sortMode === 'number') {
      arr.sort((a, b) => (+a.tab || 99) - (+b.tab || 99));
    } else if (sortMode === 'price') {
      const priceOf = r => {
        const live = canAccessLivePrices ? livePrices[stripCountry(r.name).toUpperCase()] : undefined;
        return live ?? r.rawOdds ?? Infinity;
      };
      arr.sort((a, b) => priceOf(a) - priceOf(b));
    } else {
      arr.sort((a, b) => (a.systemRank || 999) - (b.systemRank || 999));
    }
    return arr;
  }, [results, sortMode, canAccessLivePrices, livePrices]);

  // Verdict row (TOP RATED / BEST VALUE / PACE) shown under RaceHeader --
  // reuses the exact same scored `results` (TOP RATED) and the same
  // computeValueEdge formula RunnerRow/Value Bets use (BEST VALUE), plus
  // the Pace Map's own classifyPaceShape output (PACE), so none of this
  // introduces a second source of truth for score, price or pace.
  const headerVerdict = useMemo(() => {
    if (!isPro || !currentRace || !results.length) return null;
    const topRated = results[0];
    let bestValue = null, bestValuePct = -Infinity;
    results.forEach(r => {
      const live = canAccessLivePrices ? livePrices[stripCountry(r.name).toUpperCase()] : undefined;
      const displayPrice = live ?? r.rawOdds;
      const edge = displayPrice && r.myOdds ? computeValueEdge(displayPrice, r.myOdds) : null;
      if (edge && edge.pct > bestValuePct) { bestValuePct = edge.pct; bestValue = { runner: r, edge }; }
    });
    const byBarrier = results.map(r => ({ ...r, pm: calcPaceMap(r, currentRace.venue, +currentRace.dist, trackCond) }));
    const shape = classifyPaceShape(byBarrier).shape;
    const paceLabel = {
      lone: 'Uncontested pace · lone leader favoured',
      duel: 'Hot pace · speed duel up front',
      uneven: 'Genuine pace · leaders favoured',
      none: 'Even tempo · no standout leader',
    }[shape] || null;
    return {
      topRated: topRated ? { name: topRated.name, score: topRated.totalFromGroups } : null,
      bestValue: (bestValue && bestValuePct > 0) ? { name: bestValue.runner.name, pct: bestValuePct } : null,
      paceLabel,
    };
  }, [isPro, currentRace, results, trackCond, canAccessLivePrices, livePrices]);

  // Clicking a Firmer/Drifter chip in the verdict row scrolls the Field
  // table/card to that runner and briefly highlights it -- id is the same
  // stripCountry(name).toUpperCase() key RunnerRow/MobileRunnerCard already
  // use to look up livePrices/marketMoves, so no new naming scheme.
  const jumpToRunner = useCallback((name) => {
    const key = stripCountry(name).toUpperCase();
    setHighlightName(key);
    setView('field');
    requestAnimationFrame(() => {
      document.getElementById(`runner-row-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setTimeout(() => setHighlightName(cur => cur === key ? null : cur), 2500);
  }, []);

  const handleSelectRace = useCallback(key => {
    setSelectedKey(key);
    setView('field');
    if (popupRef.current) popupRef.current.style.display = 'none';
  }, []);

  const showHorsePopup = useCallback((horse, x, y) => {
    if (!popupRef.current) return;
    clearTimeout(hideTimerRef.current);
    const el = popupRef.current;
    el.innerHTML = buildPopupHTML(horse);
    const cardW = 480;
    let left = x + 14, top = Math.max(8, y - 260);
    if (typeof window !== 'undefined') {
      if (left + cardW > window.innerWidth - 8) left = x - cardW - 14;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      if (top + 500 > window.innerHeight) top = Math.max(8, window.innerHeight - 510);
    }
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
    el.style.display = 'block';
    el.onmouseenter = () => clearTimeout(hideTimerRef.current);
    el.onmouseleave = () => { hideTimerRef.current = setTimeout(() => { if (popupRef.current) popupRef.current.style.display = 'none'; }, 200); };
  }, []);

  const hideHorsePopup = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      if (popupRef.current) popupRef.current.style.display = 'none';
    }, 200);
  }, []);

  const tablePad = userSettings.density === 'Compact' ? '1px 2px' : '3px 4px';
  const tableFs  = userSettings.fontSize === 'Small' ? 10 : userSettings.fontSize === 'Large' ? 13 : 11;

  // Landscape (!isNarrow) 3-column layout: CSS Grid instead of nested flex-grow chains.
  // iOS Safari has a well-documented bug (flexbugs #106/#217) where nested flex + overflow:auto
  // silently collapses height unless min-height:0 is set on every single ancestor level — repeated
  // flex patches here kept fixing one column while another regressed. Grid tracks have a definite
  // size from the template itself, not inherited flex math, so this failure mode doesn't apply.
  // Meeting strip + ticker replace the old LeftRail/RightRail columns -- same
  // width-based (not touch-based) gating those used, so a wide landscape
  // phone still gets them, and the Races page now uses the full width
  // instead of reserving two side columns for them.
  const showMeetingStrip = hasData && !isNarrow;
  const showTicker       = hasData && !isPast && !isNarrow;
  const isCustomCsv = !!fileName && fileName !== 'today.csv';
  const csvTitle = isRacesAdmin(user?.id) && isToday ? `${fileName || 'today.csv'} · ${raceKeys.length} race${raceKeys.length !== 1 ? 's' : ''}${meetingsSynced ? ' · Meetings synced' : ''}` : undefined;

  // Date toggle -- moved off its own row (A, 2026-10-12) onto the end of the
  // meeting strip's row, exactly the same control (showPicker-on-click
  // button + invisible native <input type=date>, Today/Tomorrow shortcuts),
  // just relocated. Rendered as a prop rather than inlined inside
  // MeetingStrip itself since it needs isPro/selectedDate/dateInputRef etc.
  // that only RacesPageInner has.
  const dateToggleNode = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={csvTitle}>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => { if (isPro !== true) { setUpgradeOpen(true); return; } dateInputRef.current?.showPicker?.(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isPast ? '#d97706' : isFuture ? '#2563eb' : '#374151', fontWeight: isHistoricalMode ? 700 : 400, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <i className="ti ti-calendar" style={{ fontSize: 9 }} />
          {isHistoricalMode ? selectedDate : 'Today'}
          {isPro !== true && <i className="ti ti-lock" style={{ fontSize: 7, color: '#9ca3af', marginLeft: 2 }} />}
        </button>
        {isPro === true && (
          // Desktop: pointer-events none, button is the sole click target and opens the
          // picker via showPicker(). Mobile: showPicker() support is unreliable across
          // mobile browsers and the button has no fallback once the input can't be tapped,
          // so let the (still invisible) input receive the tap directly — native mobile
          // date inputs open their own picker sheet on tap/focus with no JS needed.
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            max={maxSelectableDate}
            onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'default', pointerEvents: isMobile ? 'auto' : 'none' }}
          />
        )}
      </div>
      {isHistoricalMode && (
        <button onClick={() => setSelectedDate(todayISO)} style={{ fontSize: 9, color: '#059669', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap' }}>
          ← Today
        </button>
      )}
      {selectedDate !== maxSelectableDate && (
        <button onClick={() => setSelectedDate(maxSelectableDate)} style={{ fontSize: 9, color: '#059669', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap' }}>
          Tomorrow →
        </button>
      )}
      {histLoading && <span style={{ fontSize: 9, color: '#9ca3af' }}>Loading…</span>}
      {isCustomCsv && isRacesAdmin(user?.id) && isToday && (
        <button
          onClick={() => { setAllRaces({}); setAllVenues({}); setRaceKeys([]); setSelectedKey(null); setFileName(''); setMeetingsSynced(false); }}
          style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap' }}
        >
          <i className="ti ti-x" style={{ fontSize: 9 }} /> Clear
        </button>
      )}
    </div>
  );

  return (
    <>
    <style>{`
      .ww-race-table td { padding: ${tablePad} !important; font-size: ${tableFs}px !important; }
      .ww-race-table { border-collapse: collapse; }
      .ww-race-table th, .ww-race-table td { border: 1px solid #d1d5db; }
    `}</style>
    <div
      id="races-grid-outer"
      className="flex flex-1 overflow-hidden"
      style={{ flexDirection: 'column' }}
    >
      {showMeetingStrip && (
        <MeetingStrip allVenues={allVenues} allRaces={allRaces} selectedRaceKey={selectedKey} onSelect={handleSelectRace} trackConds={trackConds} raceResults={raceResults} abandonedVenues={venueAbandoned} calendarMismatchVenues={venueCalendarMismatch} minRunners={userSettings.racesMinRunners} dateToggle={dateToggleNode} />
      )}
      {showTicker && (
        <Ticker allRaces={allRaces} allVenues={allVenues} selectedRaceKey={selectedKey} onSelect={handleSelectRace} onOpenUpNext={() => setUpNextOpen(true)} />
      )}
      {/* Narrow viewports, and any date with no data loaded yet, lose the
          meeting strip entirely (MobileRacePicker takes over on narrow, the
          empty-state screens take over on no-data) -- the date toggle still
          needs a home either way, so it renders as its own slim row
          whenever the strip itself isn't there. */}
      {!showMeetingStrip && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', padding: '4px 10px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          {dateToggleNode}
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!hasData ? (
          (csvLoading || histLoading) ? (
            <div className="flex-1 flex items-center justify-center">
              <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                <i className="ti ti-loader-2 text-3xl block mb-2" style={{ animation: 'spin 1s linear infinite' }} />
                <div className="text-sm">{histLoading ? 'Loading historical races…' : 'Loading today\'s races…'}</div>
              </div>
            </div>
          ) : isFuture ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div style={{ textAlign: 'center', color: '#6b7280', maxWidth: 320 }}>
                <i className="ti ti-calendar-off text-3xl block mb-3" style={{ color: '#d1d5db' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  No race cards available yet for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Not published yet — check back shortly.</div>
                <button onClick={() => setSelectedDate(todayISO)} style={{ fontSize: 12, fontWeight: 600, padding: '7px 18px', borderRadius: 6, background: '#00471b', color: '#fff', border: 'none', cursor: 'pointer' }}>← Back to today</button>
              </div>
            </div>
          ) : isPast ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div style={{ textAlign: 'center', color: '#6b7280', maxWidth: 320 }}>
                <i className="ti ti-calendar-off text-3xl block mb-3" style={{ color: '#d1d5db' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  No race cards available for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>No race card data stored for this date. Try a more recent date.</div>
                <button onClick={() => setSelectedDate(todayISO)} style={{ fontSize: 12, fontWeight: 600, padding: '7px 18px', borderRadius: 6, background: '#00471b', color: '#fff', border: 'none', cursor: 'pointer' }}>← Back to today</button>
              </div>
            </div>
          ) : isRacesAdmin(user?.id) ? (
            <UploadZone onFile={handleFile} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div style={{ textAlign: 'center', color: '#6b7280', maxWidth: 320 }}>
                <i className="ti ti-calendar-off text-3xl block mb-3" style={{ color: '#d1d5db' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  No race cards available
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Please check back shortly.</div>
              </div>
            </div>
          )
        ) : (
          <>
            {/* Mobile race picker */}
            {isNarrow && <MobileRacePicker allVenues={allVenues} allRaces={allRaces} selectedRaceKey={selectedKey} onSelect={handleSelectRace} />}

            {/* CSV toolbar row removed (A, 2026-10-12) -- its info
                ("today.csv · N races · Meetings synced") now shows as a
                tooltip on the date toggle (see csvTitle/dateToggleNode
                above), and its Clear button moved inline next to the date
                toggle, shown only when a custom (non-today.csv) file is
                loaded. */}

            {currentRace ? (() => {
              const headerBlock = (
                <>
                  {isPast && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: 10, color: '#92400e' }}>
                      <i className="ti ti-history" style={{ fontSize: 11 }} />
                      <span style={{ fontWeight: 700 }}>Historical mode</span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span style={{ opacity: 0.5 }}>· Live betting disabled</span>
                      <button onClick={() => setSelectedDate(todayISO)} style={{ marginLeft: 'auto', fontSize: 9, color: '#059669', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Back to today</button>
                    </div>
                  )}
                  {isFuture && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: '#dbeafe', borderBottom: '1px solid #bfdbfe', fontSize: 10, color: '#1e40af' }}>
                      <i className="ti ti-calendar-event" style={{ fontSize: 11 }} />
                      <span style={{ fontWeight: 700 }}>Upcoming</span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <button onClick={() => setSelectedDate(todayISO)} style={{ marginLeft: 'auto', fontSize: 9, color: '#059669', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Back to today</button>
                    </div>
                  )}
                  <RaceHeader rc={currentRace} trackCond={trackCond} trackCondConfirmed={trackCondConfirmed} setTrackCond={setTrackCond}
                    weights={weights} setWeights={setWeights} runnerCount={results.length}
                    onUpgrade={() => setUpgradeOpen(true)} isPro={isPro} isMobile={isNarrow}
                    onOpenGeneralBet={handleOpenGeneralBet} />
                  {/* Verdict row -- TOP RATED/BEST VALUE/PACE on the left (each
                      hidden individually when there's no data for it), the
                      Firmer/Drifter chips on the right (merged from the old
                      standalone row below the race-number tabs; same
                      marketMoves-derived data, now clickable to jump to that
                      runner in the Field table). */}
                  {(headerVerdict || (view === 'field' || view === 'pacemap' || view === 'odds')) && (() => {
                    const topFirmer = Object.entries(marketMoves).filter(([, v]) => v.move?.direction === 'firming').sort((a, b) => b[1].move.pct - a[1].move.pct)[0];
                    const topDrifter = Object.entries(marketMoves).filter(([, v]) => v.move?.direction === 'drifting').sort((a, b) => b[1].move.pct - a[1].move.pct)[0];
                    const showMoveChips = view === 'field' || view === 'pacemap' || view === 'odds';
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', flexWrap: 'wrap' }}>
                        {/* headerVerdict first so Top Rated/Best Value/Pace
                            sit at the left edge -- PaceBiasBar carries its
                            own marginLeft:auto (it's also used standalone
                            elsewhere), so placing it AFTER headerVerdict
                            (rather than before) is what keeps the verdict
                            text pinned left instead of being shoved right
                            by that auto margin. PaceBiasBar itself returns
                            null when there's no pace bias data yet, so
                            nothing reserves space for it in that case. */}
                        {headerVerdict && (
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
                            {headerVerdict.topRated && (
                              <span><b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70' }}>TOP RATED</b>{' '}<b>{headerVerdict.topRated.name}</b> {headerVerdict.topRated.score.toFixed(1)}</span>
                            )}
                            {headerVerdict.bestValue && (
                              <span><b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70' }}>BEST VALUE</b>{' '}<b>{headerVerdict.bestValue.name}</b> <span style={{ color: '#12834a', fontWeight: 600 }}>+{headerVerdict.bestValue.pct.toFixed(0)}%</span></span>
                            )}
                            {headerVerdict.paceLabel && (
                              <span><b style={{ fontSize: 9, letterSpacing: '0.6px', color: '#6b7a70' }}>PACE</b>{' '}{headerVerdict.paceLabel}</span>
                            )}
                          </div>
                        )}
                        <PaceBiasBar roles={paceBiasPoints} />
                        {showMoveChips && (
                          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                            {!canAccessLivePrices ? (
                              <span onClick={() => setUpgradeOpen(true)} title="Best price across bookmakers" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: '#f3f4f6', cursor: 'pointer' }}>
                                <i className="ti ti-lock" style={{ fontSize: 12, color: '#9ca3af' }} />
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>Firmers &amp; drifters -- Lite</span>
                              </span>
                            ) : (
                              <>
                              {topFirmer && (
                                <span onClick={() => jumpToRunner(topFirmer[0])} title="Click to jump to this runner" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: '#d1fae5', cursor: 'pointer' }}>
                                  <i className="ti ti-trending-up" style={{ fontSize: 13, color: '#059669' }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46' }} className="tabular-nums">{topFirmer[0]} ▲{topFirmer[1].move.pct}%</span>
                                </span>
                              )}
                              {topDrifter && (
                                <span onClick={() => jumpToRunner(topDrifter[0])} title="Click to jump to this runner" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: '#fee2e2', cursor: 'pointer' }}>
                                  <i className="ti ti-trending-down" style={{ fontSize: 13, color: '#dc2626' }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#991b1b' }} className="tabular-nums">{topDrifter[0]} ▼{topDrifter[1].move.pct}%</span>
                                </span>
                              )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const venueRaces = (allVenues[currentRace.venue] || [])
                      .slice()
                      .sort((a, b) => (allRaces[a]?.num || 0) - (allRaces[b]?.num || 0));
                    if (venueRaces.length < 2) return null;
                    return (
                      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 10px', borderBottom:'1px solid #e5e7eb', overflowX:'auto', flexShrink:0, background:'#fafafa' }}>
                        {venueRaces.map(key => {
                          const rn = allRaces[key]?.num;
                          const active = key === selectedKey;
                          const tabBetKey = `${normaliseVenue(currentRace.venue)}||${String(rn)}`;
                            const tabHasBet = isPro && (todayBets[tabBetKey]?.length > 0);
                            return (
                            <button
                              key={key}
                              onClick={() => setSelectedKey(key)}
                              style={{
                                minWidth:26, height:30, fontSize:11, fontWeight: active ? 700 : 500,
                                borderRadius:5, border: active ? '1.5px solid #1D9E75' : '1px solid #d1d5db',
                                background: active ? '#1D9E75' : '#fff', color: active ? '#fff' : '#374151',
                                cursor:'pointer', flexShrink:0, padding:'0 5px', display:'flex', flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3,
                              }}
                            >
                              <span>R{rn}</span>
                              {tabHasBet && <span style={{ width:5, height:5, borderRadius:'50%', background: active ? '#fff' : '#00471b', flexShrink:0 }} />}
                            </button>
                          );
                        })}
                        <div style={{ flexGrow: 1 }} />
                        {/* Sort / View / bookmaker -- moved here (onto the
                            race-number row) from their own separate rows so
                            all three display controls for the Field table
                            live in one place, per the top-strip redesign. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#55645a', flexShrink: 0 }}>
                          <span>Sort</span>
                          <span style={{ display: 'flex', border: '1px solid #d3d9d0', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
                            {[['score','Score'],['number','No.'],['price','Price']].map(([k,l]) => (
                              <button key={k} onClick={() => setSortMode(k)}
                                style={{ padding: '4px 8px', fontSize: 11, fontWeight: sortMode === k ? 700 : 400, background: sortMode === k ? '#17211b' : 'transparent', color: sortMode === k ? '#fff' : '#55645a', border: 'none', cursor: 'pointer' }}>
                                {l}
                              </button>
                            ))}
                          </span>
                          <span>View</span>
                          <span style={{ display: 'flex', border: '1px solid #d3d9d0', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
                            {[[false,'Compact'],[true,'Detailed']].map(([v,l]) => (
                              <button key={l} onClick={() => setCompactView(l === 'Compact')}
                                style={{ padding: '4px 8px', fontSize: 11, fontWeight: compactView === (l === 'Compact') ? 700 : 400, background: compactView === (l === 'Compact') ? '#17211b' : 'transparent', color: compactView === (l === 'Compact') ? '#fff' : '#55645a', border: 'none', cursor: 'pointer' }}>
                                {l}
                              </button>
                            ))}
                          </span>
                          <select
                            value={oddsBookmaker}
                            onChange={e => setOddsBookmaker(e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d3d9d0', fontSize: 11, background: '#fff', fontWeight: 600 }}
                          >
                            {PUNTERSEDGE_BOOKMAKER_COLUMNS.map(c => (
                              <option key={c.slug} value={c.slug}>{bookmakerNameForSlug(c.slug)}</option>
                            ))}
                          </select>
                          <PuntersEdgeCredit />
                        </div>
                      </div>
                    );
                  })()}
                  {!isNarrow && <ViewTabBar view={view} setView={setView} runnerCount={results.length} isPast={isPast} tabs={[VIEW_TABS[0], ODDS_TAB, ...VIEW_TABS.slice(1)]} />}
                  {currentRaceResult && (
                    <div style={{ background:'#f0fdf4', borderBottom:'1px solid #86efac', padding:'5px 12px', display:'flex', alignItems:'center', gap:8 }}>
                      <i className="ti ti-flag-check" style={{ color:'#16a34a', fontSize:13 }} />
                      <span style={{ fontSize:11, fontWeight:600, color:'#065f46' }}>Race resulted</span>
                      <button onClick={() => setResultPopup(currentRaceResult)}
                        style={{ marginLeft:8, padding:'3px 10px', background:'#059669', color:'#fff', border:'none', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        View Results
                      </button>
                    </div>
                  )}
                </>
              );
              const contentBlock = (
                <div id="races-middle-scroll" className={isNarrow ? 'flex-1 overflow-hidden flex flex-col' : 'mob-page'} style={isNarrow ? undefined : { overflowY: 'auto', height: '100%', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                  {view === 'field' && (
                    <FieldView results={[...sortedResults, ...allHorsesForDisplay.filter(h => !results.includes(h))]} scratched={scratched} rc={currentRace}
                      trackCond={trackCond} onLogBet={handleLogBet}
                      onShowPopup={showHorsePopup} onHidePopup={hideHorsePopup}
                      isResulted={!!currentRaceResult} betBlocked={betBlocked}
                      isPro={isPro} onUpgrade={() => setUpgradeOpen(true)}
                      scratchingsSet={scratchingsSet} colVis={colVis} todayBets={todayBets} isMobile={isNarrow}
                      canLivePrices={canAccessLivePrices} livePrices={livePrices} marketMoves={marketMoves} calibrationCurve={calibrationCurve} trustBuckets={trustBuckets}
                      compact={compactView} highlightName={highlightName} oddsBookmaker={oddsBookmaker} />
                  )}
                  {view === 'form' && (
                    <FormView results={allHorsesForDisplay} scratched={scratched} onLogBet={handleLogBet} isResulted={!!currentRaceResult} betBlocked={betBlocked} rc={currentRace} isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} scratchingsSet={scratchingsSet} />
                  )}
                  {view === 'pacemap' && (
                    <PaceMapView results={allHorsesForDisplay} scratched={scratched} rc={currentRace} trackCond={trackCond} canAccess={canPaceMap} onUpgrade={() => setUpgradeOpen(true)} scratchingsSet={scratchingsSet} canLivePrices={canPaceMap || isSiteAdminUser} livePrices={livePrices} marketMoves={marketMoves} paceBiasPoints={paceBiasPoints} />
                  )}
                  {view === 'movers' && (
                    <MoversView canAccess={canMovers} onUpgrade={() => setUpgradeOpen(true)} isAdmin={isSiteAdminUser} />
                  )}
                  {view === 'value' && (
                    <ValueBetsView canAccess={canValueBets} onUpgrade={() => setUpgradeOpen(true)} isAdmin={isSiteAdminUser} />
                  )}
                  {view === 'odds' && (
                    <div style={{ padding: 12, position: 'relative' }}>
                      {!canLiveOdds && !isSiteAdminUser && (
                        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)' }}>
                          <div style={{ textAlign: 'center', padding: 24 }}>
                            <i className="ti ti-lock" style={{ fontSize: 36, color: '#9ca3af', display: 'block', marginBottom: 12 }} />
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Live Odds is a Lite feature</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>Upgrade to compare every bookmaker&apos;s live price</div>
                            <button onClick={() => setUpgradeOpen(true)} style={{ padding: '9px 22px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              Unlock with Lite
                            </button>
                          </div>
                        </div>
                      )}
                      <div style={{ filter: (canLiveOdds || isSiteAdminUser) ? 'none' : 'blur(4px)', pointerEvents: (canLiveOdds || isSiteAdminUser) ? 'auto' : 'none' }}>
                        <OddsTable venue={normaliseVenue(currentRace.venue)} raceNum={String(currentRace.num)} selectedBookmaker={oddsBookmaker} />
                      </div>
                    </div>
                  )}
                </div>
              );
              return isNarrow ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {headerBlock}
                  {contentBlock}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div>{headerBlock}</div>
                  {contentBlock}
                </div>
              );
            })() : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a race above</div>
            )}
          </>
        )}
      </main>

      {/* "All upcoming" drawer — opened from the Ticker, reuses RightRail's
          existing Up Next table verbatim rather than a second
          implementation of the same countdown-sorted race list. */}
      {upNextOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={() => setUpNextOpen(false)} />
          <div style={{ position: 'relative', width: 280, maxWidth: '85vw', height: '100%', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#00471b', padding: '8px 12px' }}>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>All Upcoming</span>
              <button onClick={() => setUpNextOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <RightRail allRaces={allRaces} allVenues={allVenues} selectedRaceKey={selectedKey}
                onSelect={(k) => { handleSelectRace(k); setUpNextOpen(false); }}
                isPro={isPro} userId={user?.id} todayBets={todayBets} />
            </div>
          </div>
        </div>
      )}

      {/* Horse hover popup — innerHTML injected imperatively */}
      <div id="horse-popup" ref={popupRef} style={{ display:'none', position:'fixed', zIndex:99999, width:480, maxHeight:'85vh', overflow:'auto', borderRadius:8, boxShadow:'0 8px 30px rgba(0,0,0,0.2)', border:'1px solid #e5e7eb', background:'white', fontFamily:'system-ui,-apple-system,sans-serif' }} />

      {/* Upgrade modal */}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}

      {/* Log Bet modal */}
      {betTarget && <BetModal horse={betTarget} onClose={() => setBetTarget(null)} isAdmin={true} oddsBookmaker={oddsBookmaker} />}
      {/* General Log Bet modal — meeting/race/horse picker, hands off to BetModal */}
      {generalBetOpen && (
        <GeneralLogBetModal
          allVenues={allVenues}
          allRaces={allRaces}
          trackConds={trackConds}
          onPick={handleGeneralBetPick}
          onClose={() => setGeneralBetOpen(false)}
        />
      )}
      {/* Race result modal */}
      {resultPopup && <RaceResultModal result={resultPopup} results={results} onClose={() => setResultPopup(null)} />}
      {/* Blackbook modal */}
      {bbTarget && <BlackbookModal target={bbTarget} onClose={() => { setBbTarget(null); const popup = document.getElementById('horse-popup'); if (popup) popup.style.display = ''; }} userId={user?.id} canAccess={hasFeature(plan, 'blackbook')} />}
    </div>
    </>
  );
}
