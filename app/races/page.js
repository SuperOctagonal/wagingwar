'use client';

import { useState, useCallback, useRef, useMemo, useEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import BottomSheet from '@/components/BottomSheet';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
import { parseCSV, buildRaces } from '@/lib/csvParser';
import {
  scoreHorse, scoreGroup, calculateMatrixOdds, calcPaceMap,
  formatRacingOdds, getDefaultWeights, FACTORS, FACTOR_GROUPS_DEF, GRP_KEYS, GRP_LABELS,
} from '@/lib/scoring';

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

// Parses HH:MM or HH.MM (24hr) or H:MM/H.MM AM/PM (12hr) + DD/MM/YYYY date into a Date
function parseRaceTime(timeStr, dateStr) {
  if (!timeStr) return null;
  // Normalise: "01.58 pm" → "01:58 pm", "13.30" → "13:30"
  const t = timeStr.trim().replace(/\./g, ':');
  let h, m;
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (ampm) {
    h = parseInt(ampm[1], 10);
    m = parseInt(ampm[2], 10);
    if (/pm/i.test(ampm[3]) && h !== 12) h += 12;
    if (/am/i.test(ampm[3]) && h === 12) h = 0;
  } else {
    const plain = t.match(/^(\d{1,2}):(\d{2})/);
    if (!plain) return null;
    h = parseInt(plain[1], 10);
    m = parseInt(plain[2], 10);
  }
  const dateISO = toISO(dateStr) || new Date().toISOString().slice(0, 10);
  const raceAt = new Date(`${dateISO}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  return isNaN(raceAt.getTime()) ? null : raceAt;
}

const VENUE_NORMALISE = {
  'SANDOWN-HILLSIDE':              'SANDOWN',
  'SANDOWN HILLSIDE':              'SANDOWN',
  'ROSEHILL GARDENS':              'ROSEHILL GARDENS',
  'ROSEHILL GARDENS RACECOURSE':   'ROSEHILL GARDENS',
  'AQUIS PARK GOLD COAST':         'GOLD COAST',
  'AQUIS PARK GOLD COAST POLY':    'GOLD COAST POLY',
  'THOMAS FARMS RC MURRAY BRIDGE': 'MURRAY BRIDGE',
  'THOMAS FARMS MURRAY BRIDGE':    'MURRAY BRIDGE',
  'RC MURRAY BRIDGE':              'MURRAY BRIDGE',
  'SPORTSBET SANDOWN HILLSIDE':    'SANDOWN',
  'BELMONT PARK':                  'BELMONT',
};

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
      const rawV = (row.venue||'').toUpperCase();
      const normV = VENUE_NORMALISE[rawV] || rawV;
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

const PACE_ROLES = [
  { label: 'Leader',     color: '#00b050' },
  { label: 'Presser',    color: '#7ec820' },
  { label: 'Midfield',   color: '#ffc000' },
  { label: 'Closer',     color: '#ff8000' },
  { label: 'Backmarker', color: '#dc3545' },
];

const VENUE_STATE_MAP = {
  // NSW
  ROSEHILL:'NSW', 'ROSEHILL GARDENS':'NSW', NEWCASTLE:'NSW', RANDWICK:'NSW',
  'WARWICK FARM':'NSW', 'KEMBLA GRANGE':'NSW', GOSFORD:'NSW', HAWKESBURY:'NSW',
  NARRANDERA:'NSW', MUDGEE:'NSW', GOULBURN:'NSW', BATHURST:'NSW', ORANGE:'NSW',
  TAMWORTH:'NSW', GRAFTON:'NSW', LISMORE:'NSW', ARMIDALE:'NSW', TAREE:'NSW',
  'COFFS HARBOUR':'NSW', 'PORT MACQUARIE':'NSW', DUBBO:'NSW', 'WAGGA WAGGA':'NSW',
  // VIC
  FLEMINGTON:'VIC', CAULFIELD:'VIC', 'MOONEE VALLEY':'VIC', SANDOWN:'VIC',
  'SANDOWN-HILLSIDE':'VIC', 'SANDOWN HILLSIDE':'VIC', 'SANDOWN LAKESIDE':'VIC',
  BENDIGO:'VIC', BALLARAT:'VIC', GEELONG:'VIC', PAKENHAM:'VIC', CRANBOURNE:'VIC',
  MORNINGTON:'VIC', SEYMOUR:'VIC', ECHUCA:'VIC', HAMILTON:'VIC', HORSHAM:'VIC',
  'SWAN HILL':'VIC', WODONGA:'VIC', WANGARATTA:'VIC',
  // QLD
  'EAGLE FARM':'QLD', DOOMBEN:'QLD', 'GOLD COAST':'QLD', 'GOLD COAST POLY':'QLD',
  TOOWOOMBA:'QLD', WARWICK:'QLD', IPSWICH:'QLD', 'SUNSHINE COAST':'QLD',
  ROCKHAMPTON:'QLD', TOWNSVILLE:'QLD', CAIRNS:'QLD', MACKAY:'QLD',
  // SA
  MORPHETTVILLE:'SA', 'MORPHETTVILLE PARKS':'SA', 'MURRAY BRIDGE':'SA', GAWLER:'SA',
  'PORT AUGUSTA':'SA', NARACOORTE:'SA', BALAKLAVA:'SA', 'MOUNT GAMBIER':'SA',
  // WA
  'BELMONT PARK':'WA', BELMONT:'WA', ASCOT:'WA', PINJARRA:'WA',
  BUNBURY:'WA', GERALDTON:'WA', KALGOORLIE:'WA', ALBANY:'WA',
  // NT
  DARWIN:'NT', 'ALICE SPRINGS':'NT',
  // TAS
  HOBART:'TAS', LAUNCESTON:'TAS', SPREYTON:'TAS', DEVONPORT:'TAS',
};

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
          <p className="text-sm font-semibold text-gray-700">Drop EveryRace CSV here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        </div>
      </div>
    </div>
  );
}

// ─── left rail ────────────────────────────────────────────────────────────────

const TC_PILL = {
  good:      { bg: '#16a34a', label: 'Good'  },
  soft:      { bg: '#d97706', label: 'Soft'  },
  heavy:     { bg: '#dc2626', label: 'Heavy' },
  synthetic: { bg: '#2563eb', label: 'Syn'   },
};

function LeftRail({ allVenues, allRaces, selectedRaceKey, onSelect, trackConds, venueTrackConds = {} }) {
  const [openVenue, setOpenVenue] = useState(null);

  const toggle = useCallback(venue => {
    setOpenVenue(prev => prev === venue ? null : venue);
  }, []);

  useEffect(() => { setOpenVenue(null); }, [allVenues]);

  return (
    <aside className="w-[172px] flex-shrink-0 bg-[#1a2634] h-full overflow-y-auto flex flex-col">
      {/* Meetings header */}
      <div style={{ background: '#1a2634', color: '#fff', fontSize: 10, fontWeight: 700, padding: '6px 10px', letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        Meetings
      </div>
      {Object.keys(allVenues).map(venue => {
        const isOpen = openVenue === venue;
        const raceCount = allVenues[venue].length;
        return (
          <div key={venue}>
            <button
              onClick={() => toggle(venue)}
              className="w-full flex items-center gap-1.5 px-2.5 py-2 transition-colors"
              style={{ background: isOpen ? 'rgba(255,255,255,0.1)' : 'transparent', borderLeft: `2px solid ${isOpen ? '#00471b' : 'transparent'}` }}
            >
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>{raceCount} race{raceCount !== 1 ? 's' : ''}{venueTrackConds[venue] ? ` · ${venueTrackConds[venue]}` : ''}</div>
              </div>
              {(() => { const p = TC_PILL[trackConds[venue] || 'good']; return p ? <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 3, background: p.bg, color: '#fff', flexShrink: 0 }}>{p.label}</span> : null; })()}
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>›</span>
            </button>
            {isOpen && allVenues[venue].map(rk => {
              const rc = allRaces[rk];
              const active = rk === selectedRaceKey;
              return (
                <button
                  key={rk}
                  onClick={() => onSelect(rk)}
                  className="w-full text-left flex items-center justify-between transition-colors"
                  style={{
                    padding: '3px 6px 3px 14px',
                    background: active ? '#00471b' : 'transparent',
                    color: active ? 'white' : 'rgba(255,255,255,0.9)',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700 }}>R{rc.num}</span>
                  {rc.time && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)' }}>{rc.time}</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

// ─── right rail ───────────────────────────────────────────────────────────────

function RightRail({ allRaces, allVenues, selectedRaceKey, onSelect }) {
  const keys = Object.values(allVenues).flat().filter(k => k !== selectedRaceKey).sort((a, b) => {
    const ta = allRaces[a]?.time || '99:99';
    const tb = allRaces[b]?.time || '99:99';
    const na = Number(ta.replace('.', '').replace(' am','').replace(' pm','').replace(':',''));
    const nb = Number(tb.replace('.', '').replace(' am','').replace(' pm','').replace(':',''));
    return na - nb;
  }).slice(0, 12);
  return (
    <aside className="w-[190px] flex-shrink-0 bg-white border-l border-gray-100 overflow-y-auto">
      <div className="px-3 pt-3 pb-1 text-[9px] font-bold text-gray-600 uppercase tracking-[0.8px]">Up Next</div>
      {keys.map(rk => {
        const rc = allRaces[rk];
        return (
          <button key={rk} onClick={() => onSelect(rk)}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-gray-50">
            <div className="flex items-baseline gap-1">
              <span className="text-[8px] font-bold text-blue-800 bg-blue-50 px-1 rounded leading-tight">R{rc.num}</span>
              <span className="text-[9px] font-bold text-gray-900" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'130px' }}>{rc.venue}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[9px] text-gray-600">
              <span>{rc.dist}m</span>
              {rc.time && <><span>·</span><span>{rc.time}</span></>}
            </div>
          </button>
        );
      })}
    </aside>
  );
}

// ─── view tab bar ─────────────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'field',       label: 'Field',         icon: 'ti-layout-list' },
  { id: 'form',        label: 'Form',           icon: 'ti-horse-toy' },
  { id: 'pacemap',     label: 'Pace Map',       icon: 'ti-map', premium: true },
  { id: 'sectionals',  label: 'Sectionals',     icon: 'ti-chart-line', locked: true },
  { id: 'compareodds', label: 'Compare Odds',   icon: 'ti-currency-dollar', locked: true },
];

function ViewTabBar({ view, setView, runnerCount }) {
  return (
    <div className="flex items-center border-b border-gray-200 bg-white px-2 flex-shrink-0 h-10">
      {VIEW_TABS.map(t => (
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
      <span className="ml-auto pr-3 text-[10px] text-gray-700">{runnerCount} runners</span>
    </div>
  );
}

// ─── race countdown ───────────────────────────────────────────────────────────

function RaceCountdown({ rc }) {
  const [secsLeft, setSecsLeft] = useState(null);

  useEffect(() => {
    function compute() {
      const raceAt = parseRaceTime(rc.time, rc.date);
      console.log('[RaceCountdown]', rc.venue, 'R' + rc.num, '| time:', rc.time, '| date:', rc.date, '| raceAt:', raceAt?.toLocaleTimeString(), '| secsLeft:', raceAt ? Math.floor((raceAt.getTime() - Date.now()) / 1000) : null);
      if (!raceAt) { setSecsLeft(null); return; }
      setSecsLeft(Math.floor((raceAt.getTime() - Date.now()) / 1000));
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [rc.time, rc.date, rc.venue, rc.num]);

  if (secsLeft === null) return null;

  if (secsLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
        <i className="ti ti-clock" style={{ fontSize: 9 }} />
        Passed
      </span>
    );
  }

  const h = Math.floor(secsLeft / 3600);
  const mins = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;
  const isUrgent = secsLeft < 300;
  const label = h > 0 ? `${h}h ${mins}m` : isUrgent ? `${mins}m ${s}s` : `${mins}m`;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded${isUrgent ? ' bg-red-50 text-red-600 animate-pulse' : ' bg-sky-50 text-sky-700'}`}>
      <i className="ti ti-clock" style={{ fontSize: 9 }} />
      {label}
    </span>
  );
}

// ─── race header ──────────────────────────────────────────────────────────────

function RaceHeader({ rc, trackCond, setTrackCond, weights, setWeights, runnerCount, onUpgrade }) {
  const [tcOpen, setTcOpen] = useState(false);
  return (
    <div className="px-2.5 md:px-4 py-1.5 md:py-2.5 bg-white border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="font-bebas text-[19px] md:text-[22px] tracking-widest text-gray-900 leading-none">
            {rc.venue} R{rc.num}
          </h2>
          {rc.name && <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{rc.name}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {rc.dist && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{rc.dist}m</span>}
          {rc.cls  && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{rc.cls}</span>}
          {rc.prize && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">${rc.prize}</span>}
          {rc.time  && <span style={{ fontSize: 10, color: '#111827' }}>{rc.time}</span>}
          {rc.date  && <span style={{ fontSize: 10, color: '#111827' }}>{rc.date}</span>}
          <RaceCountdown rc={rc} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap relative">
        {/* Track condition — desktop inline, mobile dropdown */}
        <div className="hidden md:flex items-center gap-0.5 bg-gray-50 rounded-lg p-0.5 border border-gray-100">
          {TC_OPTIONS.map(tc => (
            <button key={tc.key} onClick={() => setTrackCond(tc.key)}
              className={['text-[9px] font-bold px-2 py-1 rounded-md transition-colors',
                trackCond === tc.key ? `${tc.bg} ${tc.text}` : 'text-gray-400 hover:text-gray-600',
              ].join(' ')}>
              {tc.label}
            </button>
          ))}
        </div>
        <div className="md:hidden relative">
          <button
            onClick={() => setTcOpen(o => !o)}
            style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {TC_OPTIONS.find(t => t.key === trackCond)?.label || 'Good'} ▾
          </button>
          {tcOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {TC_OPTIONS.map(tc => (
                <button
                  key={tc.key}
                  onClick={() => { setTrackCond(tc.key); setTcOpen(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: trackCond === tc.key ? '#00471b' : '#6b7280', background: trackCond === tc.key ? '#f0fdf4' : '#fff', border: 'none', cursor: 'pointer', borderBottom: tc.key !== TC_OPTIONS[TC_OPTIONS.length-1].key ? '1px solid #f3f4f6' : 'none' }}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Weights */}
        <WeightsPanel weights={weights} setWeights={setWeights} onUpgrade={onUpgrade} />
      </div>
    </div>
  );
}

// ─── weights panel ────────────────────────────────────────────────────────────

function WeightsPanel({ weights, setWeights, onUpgrade }) {
  const [open, setOpen]       = useState(false);
  const [openGrp, setOpenGrp] = useState(null);
  const ref = useRef(null);
  const isPro = useIsPro();

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { if (!isPro) { onUpgrade(); } else { setOpen(v => !v); } }}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 border border-gray-200 bg-white rounded-md px-2.5 py-[5px] hover:bg-gray-50 transition-colors">
        <i className="ti ti-adjustments text-sm" />
        Weights
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-xl w-64 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-gray-700">Factor Weights</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><i className="ti ti-x text-xs" /></button>
          </div>
          {FACTOR_GROUPS_DEF.map(grp => (
            <div key={grp.key} className="mb-1.5">
              <button
                onClick={() => setOpenGrp(openGrp === grp.key ? null : grp.key)}
                className="w-full flex items-center justify-between text-[10px] font-semibold py-1 px-1.5 rounded hover:bg-gray-50 transition-colors"
                style={{ color: grp.color }}
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
                        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-brand"
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

// ─── group score cell (with tooltip) ─────────────────────────────────────────

function GrpCell({ grpKey, grpScore, isBest, isWorst }) {
  const [tip, setTip] = useState(false);
  const info = GRP_LABELS[grpKey];
  const numColor = isBest ? info.color : isWorst ? '#b91c1c' : '#1e293b';
  return (
    <td
      className={['px-[6px] py-[5px] text-right text-[11px] font-semibold tabular-nums relative cursor-default select-none min-w-[52px]',
        isBest ? 'bg-emerald-50' : '', isWorst ? 'bg-red-50' : ''].join(' ')}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      style={{ color: numColor }}
    >
      {grpScore.total.toFixed(1)}
      {tip && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 text-white rounded-lg shadow-xl p-2 min-w-[150px] text-left pointer-events-none">
          {grpScore.details.map(d => (
            <div key={d.label} className="flex justify-between gap-3 text-[10px] py-0.5">
              <span className="text-white/60">{d.label}</span>
              <span className="font-semibold">{d.score !== null ? d.score : '—'}</span>
            </div>
          ))}
          <div className="border-t border-white/20 mt-1 pt-1 flex justify-between text-[10px]">
            <span className="text-amber-400">Total</span>
            <span className="text-amber-400 font-bold">{grpScore.total.toFixed(1)}</span>
          </div>
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

  const stats = [
    { label:'Joc 12m',   w:h.jocLoc12mW||0,  p:h.jocLoc12mP||0,  s:h.jocLoc12mS||0  },
    { label:'Trn 12m',   w:h.trnLoc12mW||0,  p:h.trnLoc12mP||0,  s:h.trnLoc12mS||0  },
    { label:'J/T Combo', w:h.jocTrnWins||0,  p:h.jocTrnPlaces||0, s:h.jocTrnStarts||0 },
    { label:'Course',    w:h.courseWins||0,   p:h.coursePlaces||0, s:h.courseStarts||0 },
    { label:'Distance',  w:h.distWins||0,     p:h.distPlaces||0,   s:h.distStarts||0   },
    { label:'1st-up',    w:h.prepRuns1W||0,  p:h.prepRuns1P||0,  s:h.prepRuns1S||0   },
  ];

  const stColor = (w, s) => !s ? '#d1d5db' : w/s>=0.25 ? '#059669' : w/s>=0.12 ? '#d97706' : '#374151';
  const pct2    = (w, s) => s > 0 ? `${Math.round(w/s*100)}%` : '0%';

  const statsHTML = stats.map((st, i) =>
    `<div style="padding:8px 10px;${i%3!==0?'border-left:1px solid #f3f4f6;':''}${i>=3?'border-top:1px solid #f3f4f6;':''}">
      <div style="font-size:8px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${st.label}</div>
      <div style="font-size:11px;font-weight:600;color:${stColor(st.w,st.s)}">${st.s?`${st.s}S ${st.w}W ${st.p}P`:'—'}</div>
      <div style="font-size:9px;color:#374151;margin-top:1px">${pct2(st.w,st.s)} win · ${pct2(st.p,st.s)} plc</div>
    </div>`
  ).join('');

  const winColor = winPct>=25?'#059669':winPct>=12?'#d97706':'#4b5563';
  const plcColor = plcPct>=45?'#059669':plcPct>=25?'#d97706':'#4b5563';
  const jt = [jShort(h.jname), h.trainer].filter(Boolean).join(' · ');
  const bbPayload = encodeURIComponent(JSON.stringify({ name: h.name, venue: h._venue || '', raceNumber: h._raceNum || '', distance: h._dist || '', cls: h._cls || '' }));

  return `
  <div style="background:#00471b;padding:5px 10px;display:flex;align-items:center;justify-content:space-between">
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
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
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
  </table>
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
  const norm = n => (n||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
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

const BOOKIES = ['Sportsbet','TAB','Betfair','Bet365','BlueBet','Ladbrokes','Neds','Other'];

function BetModal({ horse, onClose }) {
  const { user } = useUser();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open,     setOpen]     = useState(false);
  const [stake,    setStake]    = useState('');
  const [odds,     setOdds]     = useState(horse.rawOdds ? horse.rawOdds.toFixed(2) : '');
  const [bookie,   setBookie]   = useState('Sportsbet');
  const [betType,  setBetType]  = useState('win');
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  useEffect(() => { setOpen(true); }, []);

  const handleSave = async () => {
    if (!stake || isNaN(+stake) || +stake <= 0) { alert('Enter a valid stake'); return; }
    if (!odds || isNaN(+odds) || +odds <= 1)   { alert('Enter valid odds'); return; }
    setSaving(true);
    const bet = {
      id: Date.now(),
      horse: horse.name,
      tab: horse.tab,
      bookie,
      betType,
      stake: +stake,
      odds: +odds,
      potential: +(+stake * +odds).toFixed(2),
      savedAt: new Date().toISOString(),
    };
    const existing = JSON.parse(localStorage.getItem('ww_bets') || '[]');
    localStorage.setItem('ww_bets', JSON.stringify([bet, ...existing]));

    let dbSuccess = !user?.id; // not logged in → localStorage-only, treat as success
    if (SURL && SKEY && user?.id) {
      try {
        const raceNumVal = horse._raceNum != null ? (isNaN(+horse._raceNum) ? String(horse._raceNum) : +horse._raceNum) : null;
        const insertBody = {
          clerk_id:        user.id,
          date:            new Date().toISOString().slice(0, 10),
          horse_name:      horse.name,
          track:           horse._venue        || null,
          venue:           horse._venue        || null,
          race_number:     raceNumVal,
          bet_type:        betType,
          stake:           +stake,
          odds:            +odds,
          status:          'pending',
          bookmaker:       bookie              || null,
          rank:            horse._rank         || null,
          my_odds:         horse._myOdds       ?? horse.rawOdds ?? null,
          track_condition: horse._trackCond    || null,
          race_name:       horse._raceName     || null,
          meeting_date:    horse._meetingDate  || null,
          return_amt:      null,
          position:        null,
        };
        console.log('[BetSave] Posting to bet_log:', JSON.stringify(insertBody));
        // Run in Supabase SQL: ALTER TABLE bet_log ENABLE ROW LEVEL SECURITY;
        // CREATE POLICY "Users can insert own bets" ON bet_log FOR INSERT WITH CHECK (true);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bet_log`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(insertBody)
          }
        );
        if (!res.ok) {
          const errText = await res.text();
          console.error('[BetSave] Supabase error — status:', res.status, '| body:', errText);
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
      setTimeout(() => { onClose(); router.push('/mybets'); }, 1500);
    } else {
      setTimeout(() => setToast(null), 3000);
    }
  };

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
            onClick={() => setBetType(t)}
            className={['flex-1 py-1.5 text-[11px] font-semibold capitalize transition-colors',
              betType === t ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50',
            ].join(' ')}>
            {t}
          </button>
        ))}
      </div>

      {/* Stake + Odds */}
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
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Odds ($)</label>
          <input
            type="number" min="1.01" step="0.01" placeholder="3.50"
            value={odds} onChange={e => setOdds(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* Potential return */}
      {stake && odds && +stake > 0 && +odds > 1 && (
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
              onClick={() => setBookie(b)}
              className={['text-[9px] font-semibold py-1.5 px-1 rounded-lg border transition-colors truncate',
                bookie === b ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
              ].join(' ')}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
        {saving ? 'Saving…' : 'Save Bet'}
      </button>
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
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-brand px-4 py-3 flex items-center justify-between">
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
    <div className="md:hidden" style={{ background: '#fff', flexShrink: 0, position: 'relative', borderBottom: '1px solid #e5e7eb' }}>
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

function MobileRunnerCard({ runner, rank, rc, trackCond, onLogBet, isResulted, isPro, onUpgrade, isDbScratched, layers }) {
  const mktO = runner.rawOdds;
  const myO  = runner.myOdds;
  const wt   = runner['Weight'] ? `${runner['Weight']}kg` : '';

  let valStr = '—', valColor = '#374151';
  if (mktO && myO) {
    const p = (mktO - myO) / myO * 100;
    const arrow = p >= 30 ? '▲' : p <= -30 ? '▼' : '';
    valStr  = `${arrow}${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
    valColor = p >= 20 ? '#27500A' : p <= -20 ? '#A32D2D' : '#374151';
  }

  const pm  = calcPaceMap(runner, rc.venue, +rc.dist, trackCond);
  const rfs = runner.rfs || 0;
  const prepCell1 = rfs >= 2
    ? { label:'2nd-up', w:runner.prepRuns2W||0, p:runner.prepRuns2P||0, s:runner.prepRuns2S||0 }
    : { label:'1st-up', w:runner.prepRuns1W||0, p:runner.prepRuns1P||0, s:runner.prepRuns1S||0 };
  const prepCell2 = rfs >= 2
    ? { label:'3rd-up', w:runner.prepRuns3W||0, p:runner.prepRuns3P||0, s:runner.prepRuns3S||0 }
    : { label:'2nd-up', w:runner.prepRuns2W||0, p:runner.prepRuns2P||0, s:runner.prepRuns2S||0 };
  const stColor = (w, s) => { if (!s) return '#d1d5db'; const rv = w/s; return rv>=0.25?'#059669':rv>=0.12?'#d97706':'#374151'; };
  const finArr = Array.isArray(runner.lastFin) ? runner.lastFin : [runner.lastFin,null,null,null];
  const spArr  = Array.isArray(runner.lastSP)  ? runner.lastSP  : [runner.lastSP,null,null,null];
  const last4  = finArr.slice(0,4).filter(v => v!==null && v!==undefined && v!=='').reverse().map(v => +v>9?'0':v).join(' ');
  const bbPayload = { name: runner.name, venue: rc?.venue||'', raceNumber: rc?.num||'', distance: rc?.dist||'', cls: rc?.cls||'' };

  return (
    <div style={{ background: isDbScratched ? '#fafafa' : (rank===1 ? '#FAEEDA' : '#fff'), borderBottom: '1px solid #f1f5f9', padding: '4px 10px 5px', opacity: isDbScratched ? 0.45 : 1, overflow: 'hidden' }}>

      {/* Line 1: RNK (16) | NO/badge (16) | name (flex:1) | Score (32) | Live $ (38) | Val (28) — gap:5 mirrors column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
        <div style={{ flexShrink: 0, width: 16, textAlign: 'center', fontSize: 9, fontWeight: 500, color: isDbScratched ? '#d1d5db' : '#6b7280', lineHeight: '16px' }}>
          {isDbScratched ? '—' : (rank || '—')}
        </div>
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, background: '#1e3a8a', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>{runner.tab}</span>
        <span style={{ flex: 1, fontWeight: 500, fontSize: 11, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDbScratched ? 'line-through' : 'none' }}>
          {runner.name}{isDbScratched && <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '0 3px', borderRadius: 2 }}>SCR</span>}
        </span>
        <div style={{ flexShrink: 0, width: 32, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#111827' }}>
          {!isPro ? <LockBtn onClick={onUpgrade} /> : runner.totalFromGroups.toFixed(1)}
        </div>
        <div style={{ flexShrink: 0, width: 38, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#111827' }}>{mktO ? `$${mktO.toFixed(2)}` : '—'}</div>
        <div style={{ flexShrink: 0, width: 28, textAlign: 'right', fontSize: 10, fontWeight: 500, color: valColor }}>{isPro ? valStr : '—'}</div>
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
          { label:'Jockey 12m',    w:runner.jocLoc12mW||0,  p:runner.jocLoc12mP||0,  s:runner.jocLoc12mS||0 },
          { label:'Trainer 12m',   w:runner.trnLoc12mW||0,  p:runner.trnLoc12mP||0,  s:runner.trnLoc12mS||0 },
          { label:'Joc/Trn Combo', w:runner.jocTrnWins||0,  p:runner.jocTrnPlaces||0, s:runner.jocTrnStarts||0 },
          prepCell1, prepCell2,
          { label:'Course/Dist',   w:runner.courseWins||0,  p:runner.coursePlaces||0, s:runner.courseStarts||0 },
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
              {statItems.map(st => (
                <div key={st.label}>
                  <div style={{ fontWeight: 700, color: '#9ca3af', marginBottom: 1, textTransform: 'uppercase', letterSpacing: '0.2px' }}>{st.label}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, color: stColor(st.w, st.s) }}>{st.s ? `${st.s}S ${st.w}W ${st.p}P` : '—'}</div>
                  <div style={{ color: '#6b7280' }}>{st.s>0?`${Math.round(st.w/st.s*100)}% win`:'0% win'}</div>
                </div>
              ))}
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
      {layers?.pace && pm && (
        <div style={{ paddingLeft: 42, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, height: 7, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pm.pct}%`, background: pm.color }} />
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, color: pm.color, whiteSpace: 'nowrap' }}>{pm.role}</span>
          {!pm.hasTPPC && <span style={{ fontSize: 7, color: '#d97706', fontWeight: 600, whiteSpace: 'nowrap' }}>Est</span>}
        </div>
      )}

      {/* Last-4 · trainer + buttons — same line, buttons right-aligned */}
      <div style={{ paddingLeft: 42, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <div style={{ flex: 1, fontSize: 9, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {last4 && <span>{last4}</span>}{runner.trainer && <span style={{ color: '#6b7280' }}>{last4 ? ' · ' : ''}{runner.trainer}</span>}
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={() => !isResulted && onLogBet(runner, rank)} disabled={isResulted}
            style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: isResulted ? '#9ca3af' : '#374151', cursor: isResulted ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            + Log bet
          </button>
          <button onClick={() => isPro ? window.__addToBlackbook?.(bbPayload) : onUpgrade()}
            style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🔖 Blackbook
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── field view ───────────────────────────────────────────────────────────────

function LockBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, whiteSpace: 'nowrap' }}>
      <i className="ti ti-lock" style={{ fontSize: 10 }} /> Pro
    </button>
  );
}

function RunnerRow({ runner, rank, rc, trackCond, onLogBet, onShowPopup, onHidePopup, isResulted, isPro, onUpgrade, isDbScratched }) {
  const myO  = runner.myOdds;
  const mktO = runner.rawOdds;
  const pm   = calcPaceMap(runner, rc.venue, +rc.dist, trackCond);
  const crsLabel = (() => { const c = runner.courseStarts||0; return c===0?'NEW':c===1?'1x':c<=4?`${c}x`:'VET'; })();

  let valStr = '—', valColor = '#374151';
  if (mktO && myO) {
    const p = (mktO - myO) / myO * 100;
    const arrow = p >= 30 ? '▲' : p <= -30 ? '▼' : '';
    valStr  = `${arrow}${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
    valColor = p >= 20 ? '#059669' : p <= -20 ? '#dc2626' : '#374151';
  }

  const pips = (runner.lastFin || []).slice(0, 4).filter(v => v !== null && v !== undefined && v !== '').reverse();
  const bp   = runner['BP'] || runner.BP || '';
  const wt   = runner['Weight'] ? `${runner['Weight']}kg` : '';
  const rankColor = rank===1?'#d97706':rank===2?'#6b7280':rank===3?'#b45309':'#9ca3af';

  const td = 'px-[6px] py-[2px]';
  return (
    <tr className="border-b border-gray-100 text-[11px]" style={{ background: isDbScratched ? '#fafafa' : (rank===1 ? '#fffbeb' : 'white'), opacity: isDbScratched ? 0.45 : 1 }}>
      <td className={`${td} text-center font-bold w-7`} style={{ color: rankColor }}>
        {isDbScratched ? '—' : (!isPro ? <LockBtn onClick={onUpgrade} /> : rank)}
      </td>
      <td className={`${td} min-w-[140px] max-w-[180px]`}>
        <div className="flex items-center flex-wrap gap-x-1 leading-snug">
          <span className="flex-shrink-0 bg-blue-800 text-white text-[8px] font-bold font-mono px-[4px] py-[1px] rounded-sm leading-tight mr-0.5">{runner.tab}</span>
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
      {/* Career record */}
      <td className={`${td} text-center text-[9px] font-mono whitespace-nowrap`} style={{ color: '#111827' }}>
        {runner.starts}-{runner.wins}-{runner.seconds||0}-{runner.thirds||0}
      </td>
      {/* Group scores */}
      {GRP_KEYS.map(gk => (
        !isPro
          ? <td key={gk} className="px-[6px] py-[5px] text-right min-w-[52px]"><LockBtn onClick={onUpgrade} /></td>
          : <GrpCell key={gk} grpKey={gk} grpScore={runner.grpScores[gk]} isBest={runner._grpIsBest?.[gk]} isWorst={runner._grpIsWorst?.[gk]} />
      ))}
      {/* Total */}
      <td className={`${td} text-right font-bold text-[12px] tabular-nums`} style={{ color: rankColor }}>
        {!isPro ? <LockBtn onClick={onUpgrade} /> : runner.totalFromGroups.toFixed(1)}
      </td>
      {/* Edge $ */}
      <td className={`${td} text-right text-[11px] font-semibold text-emerald-600 tabular-nums whitespace-nowrap`}>
        {!isPro ? <LockBtn onClick={onUpgrade} /> : (myO ? `$${formatRacingOdds(myO)}` : '—')}
      </td>
      {/* Live $ */}
      <td className={`${td} text-right text-[11px] tabular-nums whitespace-nowrap`} style={{ color: '#111827' }}>{mktO ? `$${mktO.toFixed(2)}` : '—'}</td>
      {/* Value */}
      <td className={`${td} text-right text-[10px] font-semibold tabular-nums whitespace-nowrap`} style={{ color: valColor }}>
        {!isPro ? <LockBtn onClick={onUpgrade} /> : valStr}
      </td>
      {/* Bet */}
      <td className={`${td} text-center`}>
        <button onClick={() => !isResulted && onLogBet(runner, rank)} disabled={isResulted}
          className="text-[9px] font-semibold px-2 py-[3px] rounded border whitespace-nowrap transition-colors"
          style={{ color:isResulted?'#9ca3af':'#374151', background:isResulted?'#f9fafb':'#fff', borderColor:isResulted?'#e5e7eb':'#e5e7eb', cursor:isResulted?'default':'pointer' }}>
          {isResulted ? 'Resulted' : '+ Bet'}
        </button>
      </td>
      {/* Pace */}
      <td className={td} style={{ minWidth: 100 }}>
        {pm && (
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold w-6 flex-shrink-0" style={{ color: pm.color }}>{pm.role.slice(0,3).toUpperCase()}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ width: 55 }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pm.pct}%`, background: pm.color }} />
            </div>
            <span className="text-[8px] font-semibold w-6 text-right" style={{ color: '#111827' }}>{crsLabel}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function FieldView({ results, scratched, rc, trackCond, onLogBet, onShowPopup, onHidePopup, isResulted, isPro, onUpgrade, scratchingsSet = new Set() }) {
  const tcLabel = { good:'Good', soft:'Soft', heavy:'Heavy', synthetic:'Synth' }[trackCond] || 'Good';
  const scrKey = h => `${(rc.venue||'').toUpperCase()}||${rc.num}||${h.name.toUpperCase()}`;
  const activeResults = results.filter(h => !scratchingsSet.has(scrKey(h)));
  const dbScratched   = results.filter(h =>  scratchingsSet.has(scrKey(h)));
  const [layers, setLayers] = useState({ form: false, pace: false, scores: false, picks: false });
  const th = { background: '#f8fafc', color: '#374151', letterSpacing: '0.5px', position: 'sticky', top: 0, zIndex: 1, padding: '4px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', lineHeight: '1.3', borderBottom: '1px solid #e5e7eb' };
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto flex-1">
        <table className="w-full border-collapse" style={{ minWidth: 800 }}>
          <thead>
            <tr className="border-b border-gray-200">
              <th style={{ ...th, textAlign:'center', width:28 }}>RANK</th>
              <th style={{ ...th, textAlign:'left', minWidth:140 }}>Horse / Jockey / Trainer</th>
              <th style={{ ...th, textAlign:'center', width:78 }}>Last 4 →</th>
              <th style={{ ...th, textAlign:'center', width:60 }}>Record</th>
              <th style={{ ...th, textAlign:'right', width:52, color: GRP_LABELS.form.color }}>Form</th>
              <th style={{ ...th, textAlign:'right', width:52, color: GRP_LABELS.speed.color }}>Speed</th>
              <th style={{ ...th, textAlign:'right', width:52, color: GRP_LABELS.cond.color }}>{tcLabel}</th>
              <th style={{ ...th, textAlign:'right', width:52, color: GRP_LABELS.conn.color }}>Conn</th>
              <th style={{ ...th, textAlign:'right', width:52 }}>Score</th>
              <th style={{ ...th, textAlign:'right', width:52 }}>Edge $</th>
              <th style={{ ...th, textAlign:'right', width:52 }}>Live $</th>
              <th style={{ ...th, textAlign:'right', width:52 }}>Value</th>
              <th style={{ ...th, width:52 }} />
              <th style={{ ...th, textAlign:'left', minWidth:120 }}>
                <span style={{marginRight:6}}>Pace</span>
                {PACE_ROLES.map(r => (
                  <span key={r.label} style={{display:'inline-flex',alignItems:'center',gap:2,fontSize:9,color:'#6b7280',marginRight:5}}>
                    <span style={{width:5,height:5,borderRadius:1,background:r.color,flexShrink:0,display:'inline-block'}} />
                    {r.label}
                  </span>
                ))}
              </th>
            </tr>
          </thead>
          <tbody>
            {activeResults.map((r, i) => (
              <RunnerRow key={r.tab || r.name} runner={r} rank={i+1} rc={rc} trackCond={trackCond} onLogBet={onLogBet} onShowPopup={onShowPopup} onHidePopup={onHidePopup} isResulted={isResulted} isPro={isPro} onUpgrade={onUpgrade} />
            ))}
            {dbScratched.map(r => (
              <RunnerRow key={r.tab || r.name} runner={r} rank={null} rc={rc} trackCond={trackCond} onLogBet={onLogBet} onShowPopup={onShowPopup} onHidePopup={onHidePopup} isResulted={true} isPro={isPro} onUpgrade={onUpgrade} isDbScratched />
            ))}
          </tbody>
          {scratched.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={14} className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50">
                  Scratched: {scratched.map(h => h.name).join(' · ')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile section */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {/* Toggle pills: Top picks | Form detail | Score breakdown | Pace map */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 10px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          {[['picks','Top picks'],['form','Form detail'],['scores','Score breakdown'],['pace','Pace map']].map(([key, label]) => (
            <button key={key} onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
              style={{ flexShrink: 0, borderRadius: 12, fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontWeight: 500,
                background: layers[key] ? '#00471b' : '#fff',
                color: layers[key] ? '#fff' : '#111827',
                border: '1px solid #00471b' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Top picks strip — above column header */}
        {layers.picks && (
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

        {/* Column headers — gap:5, pad:10px — mirrors card line 1 exactly */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 8, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          <div style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>RNK</div>
          <div style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>NO</div>
          <div style={{ flex: 1 }}>Horse</div>
          <div style={{ flexShrink: 0, width: 32, textAlign: 'right' }}>Score</div>
          <div style={{ flexShrink: 0, width: 38, textAlign: 'right' }}>Live $</div>
          <div style={{ flexShrink: 0, width: 28, textAlign: 'right' }}>Val</div>
        </div>

        {/* Scrollable runner cards */}
        <div className="mob-page" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {activeResults.map((r, i) => (
            <MobileRunnerCard key={r.tab || r.name} runner={r} rank={i+1} rc={rc} trackCond={trackCond}
              onLogBet={onLogBet} isResulted={isResulted} isPro={isPro} onUpgrade={onUpgrade} layers={layers} />
          ))}
          {dbScratched.map(r => (
            <MobileRunnerCard key={r.tab || r.name} runner={r} rank={null} rc={rc} trackCond={trackCond}
              onLogBet={onLogBet} isResulted={true} isPro={isPro} onUpgrade={onUpgrade} isDbScratched layers={layers} />
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

function FormCard({ runner: r, rank, onLogBet, isResulted, rc, isPro, onUpgrade, isDbScratched }) {
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

  const rankBg  = rank===1?'#fbbf24':rank===2?'#d1d5db':rank===3?'#cd7f32':'#4b5563';
  const rankTxt = rank<=3?'#78350f':'#fff';

  const prepCell1 = rfs >= 2
    ? { label:'2nd-up', w:r.prepRuns2W||0, p:r.prepRuns2P||0, s:r.prepRuns2S||0 }
    : { label:'1st-up', w:r.prepRuns1W||0, p:r.prepRuns1P||0, s:r.prepRuns1S||0 };
  const prepCell2 = rfs >= 2
    ? { label:'3rd-up', w:r.prepRuns3W||0, p:r.prepRuns3P||0, s:r.prepRuns3S||0 }
    : { label:'2nd-up', w:r.prepRuns2W||0, p:r.prepRuns2P||0, s:r.prepRuns2S||0 };

  const statItems = [
    { label:'Jockey 12m',    w:r.jocLoc12mW||0,  p:r.jocLoc12mP||0,  s:r.jocLoc12mS||0   },
    { label:'Trainer 12m',   w:r.trnLoc12mW||0,  p:r.trnLoc12mP||0,  s:r.trnLoc12mS||0   },
    { label:'Joc/Trn Combo', w:r.jocTrnWins||0,  p:r.jocTrnPlaces||0, s:r.jocTrnStarts||0 },
    prepCell1,
    prepCell2,
    { label:'Course/Dist',   w:r.courseWins||0,  p:r.coursePlaces||0, s:r.courseStarts||0  },
  ];

  const stColor = (w, s) => { if (!s) return '#d1d5db'; const rv = w/s; return rv>=0.25?'#059669':rv>=0.12?'#d97706':'#374151'; };

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
    <div style={{ borderRadius:6, border:'0.5px solid #e5e7eb', background:'#fff', overflow:'hidden' }}>
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
            <button type="button" onClick={() => !isResulted && onLogBet(r, rank)} disabled={isResulted}
              style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:3, border:'1px solid rgba(255,255,255,0.25)', color:isResulted?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.8)', background:'transparent', cursor:isResulted?'default':'pointer', flexShrink:0 }}>
              {isResulted ? 'Resulted' : '+ Bet'}
            </button>
            <button type="button" onClick={() => { if (!isPro) { onUpgrade(); } else { window.__addToBlackbook && window.__addToBlackbook({ name: r.name, venue: rc?.venue || '', raceNumber: rc?.num || '', distance: rc?.dist || '', cls: rc?.cls || '' }); } }}
              style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:3, border:'1px solid rgba(255,255,255,0.25)', color:'rgba(255,255,255,0.8)', background:'transparent', cursor:'pointer', flexShrink:0 }}>
              🔖 Blackbook
            </button>
          </div>
        </div>
        {/* Row 2: breeding */}
        {breedLine && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:3, paddingLeft:28 }}>{breedLine}</div>
        )}
      </div>

      {/* Run history table */}
      {runRows.length > 0 && (
        <table style={{ width:'100%', borderCollapse:'collapse', border:'0.5px solid #e5e7eb', borderTop:'none', background:'#fff', tableLayout:'fixed' }}>
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
            </tr>
          </thead>
          <tbody>{runRows}</tbody>
        </table>
      )}

      {/* Stats footer */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 6px 6px', overflow:'hidden', background:'#fff' }}>
        {statItems.map((st, i) => (
          <div key={st.label} style={{ padding:'5px 6px', borderRight: i < 5 ? '0.5px solid #e5e7eb' : 'none' }}>
            <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>{st.label}</div>
            <div style={{ fontSize:11, fontWeight:500, color:stColor(st.w, st.s) }}>
              {st.s ? `${st.s}S ${st.w}W ${st.p}P` : '—'}
            </div>
            <div style={{ fontSize:10, color:'#111827', marginTop:1 }}>{st.s>0?`${Math.round(st.w/st.s*100)}% win`:'0% win'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormView({ results, scratched, onLogBet, isResulted, rc, isPro, onUpgrade, scratchingsSet = new Set() }) {
  const scrKey = h => `${(rc.venue||'').toUpperCase()}||${rc.num}||${h.name.toUpperCase()}`;
  const sorted = [...results].sort((a, b) => (+a.tab || 99) - (+b.tab || 99));
  const activeSorted     = sorted.filter(r => !scratchingsSet.has(scrKey(r)));
  const dbScratchedSorted = sorted.filter(r =>  scratchingsSet.has(scrKey(r)));
  return (
    <div className="flex-1 overflow-y-auto" style={{ padding:'10px 14px' }}>
      {activeSorted.map((r, i) => (
        <div key={r.tab||r.name} style={{ marginBottom: i < activeSorted.length-1 ? 12 : 0 }}>
          <FormCard runner={r} rank={i+1} onLogBet={onLogBet} isResulted={isResulted} rc={rc} isPro={isPro} onUpgrade={onUpgrade} />
        </div>
      ))}
      {dbScratchedSorted.map(r => (
        <div key={r.tab||r.name} style={{ marginBottom: 12, opacity: 0.45 }}>
          <FormCard runner={r} rank={null} onLogBet={onLogBet} isResulted={true} rc={rc} isPro={isPro} onUpgrade={onUpgrade} isDbScratched />
        </div>
      ))}
      {scratched.length > 0 && (
        <div className="text-[10px] text-gray-400 py-1 px-2">Scratched: {scratched.map(h=>h.name).join(' · ')}</div>
      )}
    </div>
  );
}

// ─── pace map view ────────────────────────────────────────────────────────────

function PaceMapView({ results, scratched, rc, trackCond, isPro, onUpgrade }) {
  // Sort by barrier for display
  const ranked = results.map((r, i) => ({ ...r, systemRank: i + 1 }));
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
  const aiText = (leaderCount >= 3
    ? `Hot pace — ${leaderCount} leaders. Horses that can settle off the speed hold a significant advantage.`
    : leaderCount >= 1 ? 'Manageable pace. The leader should set a sustainable tempo.'
    : 'No clear leader identified — race may be run at a slow tempo.')
    + ` ${+rc.dist<=1200?' Sprint distance favours on-pace runners.':+rc.dist<=1600?' Mile trip — balanced chance for all runners.':" Staying trip — closers with stamina should thrive."}`;

  return (
    <div className="flex flex-1 overflow-hidden" style={{ position: 'relative' }}>
      {!isPro && (
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
      <div className="flex-1 overflow-y-auto p-3" style={{ filter: isPro ? 'none' : 'blur(4px)', pointerEvents: isPro ? 'auto' : 'none' }}>
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
        <div className="flex items-center py-1 border-b border-gray-200 mb-1 text-[8px] font-bold text-gray-400 uppercase tracking-[0.4px]">
          <div className="w-7" />
          <div className="w-8 text-center">Bar</div>
          <div className="w-36 pl-1.5">Horse</div>
          <div className="w-16">Role</div>
          <div className="flex-1">Pace score</div>
          <div className="w-7 text-right">%</div>
          <div className="w-20 text-right pr-1 border-l border-gray-100 ml-2">Edge$ / SP</div>
        </div>
        {byBarrier.map(h => {
          if (!h.pm) return null;
          const bp = h['BP'] || h.BP || h.tab || '—';
          const myO = h.myOdds ? `$${formatRacingOdds(h.myOdds)}` : '—';
          const spO = h.rawOdds ? `$${formatRacingOdds(h.rawOdds)}` : '—';
          const rkBg = h.systemRank===1?'#fbbf24':h.systemRank===2?'#d1d5db':h.systemRank===3?'#cd7f32':'#f3f4f6';
          const rkColor2 = h.systemRank<=3?'#374151':'#9ca3af';
          return (
            <div key={h.tab||h.name} className="flex items-center gap-2 border-b border-gray-50" style={{ padding:'3px 6px' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: rkBg, color: rkColor2 }}>{h.systemRank}</div>
              <div className="w-8 flex-shrink-0 text-center">
                <span className="bg-blue-800 text-white text-[9px] font-bold px-1.5 py-[2px] rounded">{bp}</span>
              </div>
              <div className="w-36 flex-shrink-0 overflow-hidden">
                <div className="truncate" style={{ fontSize:11, fontWeight:600, color:'#111827' }}>{h.name}</div>
                {h.pm.hasTPPC
                  ? <div className="text-[8px] text-gray-400">F:{Math.round(h.pm.tppcFront||0)}% P:{Math.round(h.pm.tppcOnpc||0)}% M:{Math.round(h.pm.tppcMid||0)}% B:{Math.round(h.pm.tppcBack||0)}% <span className="text-emerald-600 font-semibold">CSV</span></div>
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
                <div className="text-[9px] text-gray-400">SP {spO}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right summary panel */}
      <div className="w-48 flex-shrink-0 bg-gray-50 border-l border-gray-200 overflow-y-auto p-3 space-y-3" style={{ filter: isPro ? 'none' : 'blur(4px)', pointerEvents: isPro ? 'auto' : 'none' }}>
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

function BlackbookModal({ target, onClose, userId }) {
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
    if (!SURL || !SKEY || !userId) return;
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
  console.log('[Tier] isPro:', isPro, 'plan:', user?.publicMetadata?.plan);

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
  const [raceResults,   setRaceResults]   = useState({});
  const [resultPopup,   setResultPopup]   = useState(null);
  const [bbTarget,      setBbTarget]      = useState(null);
  const [meetingsSynced, setMeetingsSynced] = useState(false);
  const [venueTrackConds, setVenueTrackConds] = useState({});
  const [scratchingsSet,  setScratchingsSet]  = useState(new Set());
  const popupRef     = useRef(null);

  const currentRace = selectedKey ? allRaces[selectedKey] : null;
  const trackCond = (currentRace && trackConds[currentRace.venue]) || 'good';
  const setTrackCond = useCallback(tc => {
    if (currentRace) setTrackConds(prev => ({ ...prev, [currentRace.venue]: tc }));
  }, [currentRace]);

  const handleLogBet = useCallback((runner, rank) => {
    const rc = allRaces[selectedKey];
    setBetTarget({ ...runner, _rank: rank, _venue: rc?.venue, _raceNum: rc?.num, _raceName: rc?.name || null, _meetingDate: rc?.date || null, _trackCond: trackCond, _myOdds: runner.rawOdds });
  }, [allRaces, selectedKey, trackCond]);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    window.__addToBlackbook = (data) => {
      if (!isPro) { setUpgradeOpen(true); return; }
      const popup = document.getElementById('horse-popup');
      if (popup) popup.style.display = 'none';
      setBbTarget(typeof data === 'string' ? { name: data } : data);
    };
    window.__logBet = (data) => {
      if (!isPro) { setUpgradeOpen(true); return; }
      const popup = document.getElementById('horse-popup');
      if (popup) popup.style.display = 'none';
      const rc = allRaces[selectedKey];
      setBetTarget({
        ...data,
        _venue: data._venue || rc?.venue,
        _raceNum: data._raceNum || rc?.num,
        _raceName: rc?.name || null,
        _meetingDate: rc?.date || null,
        _trackCond: trackCond,
        _myOdds: data.rawOdds
      });
    };
    return () => { delete window.__addToBlackbook; delete window.__logBet; };
  }, [allRaces, selectedKey, trackCond, isPro]);

  const loadCSV = useCallback((text, name, selectKey) => {
    try {
      const { allRaces: ar, allVenues: av, raceKeys: rk } = buildRaces(parseCSV(text));
      if (rk.length === 0) { alert('No races found — check Race Number column'); return; }
      setAllRaces(ar); setAllVenues(av); setRaceKeys(rk);
      setSelectedKey(selectKey && rk.includes(selectKey) ? selectKey : rk[0]);
      setFileName(name); setView('field');
    } catch (err) { alert('Error parsing CSV: ' + err.message); }
  }, []);

  const handleFile = useCallback(async (text, name) => {
    localStorage.setItem('ww_csv', text);
    localStorage.setItem('ww_csv_name', name);
    loadCSV(text, name, null);

    if (SURL && SKEY) {
      try {
        const { allRaces: ar, allVenues: av } = buildRaces(parseCSV(text));
        const firstKey = Object.keys(ar)[0];
        const dateISO = firstKey ? toISO(ar[firstKey]?.date) : null;
        if (dateISO) {
          const venues = Object.keys(av);
          const rows = venues.map(v => ({
            venue: v.toUpperCase(),
            state: VENUE_STATE_MAP[v.toUpperCase()] || null,
            date:  dateISO,
          }));
          await fetch(`${SURL}/rest/v1/today_meetings?date=gte.1900-01-01`, {
            method: 'DELETE',
            headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'return=minimal' },
          });
          const res = await fetch(`${SURL}/rest/v1/today_meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'return=minimal' },
            body: JSON.stringify(rows),
          });
          if (res.ok) {
            console.log('[Races] today_meetings updated:', venues.length, 'venues');
            setMeetingsSynced(true);
          } else {
            console.error('[Races] today_meetings sync failed:', res.status, await res.text());
          }
        }
      } catch (err) {
        console.error('[Races] today_meetings sync error:', err);
      }
    }
  }, [loadCSV]);

  // On mount: restore CSV from localStorage and honour ?select param
  useEffect(() => {
    const saved = localStorage.getItem('ww_csv');
    const savedName = localStorage.getItem('ww_csv_name') || 'saved.csv';
    const selectParam = searchParams.get('select');
    if (saved) loadCSV(saved, savedName, selectParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch race results and scratchings when allRaces loads
  useEffect(() => {
    const keys = Object.keys(allRaces);
    if (keys.length === 0) return;
    const firstRace = allRaces[keys[0]];
    const dateISO = toISO(firstRace?.date);
    if (!dateISO) return;
    fetchRaceResultsForDate(dateISO).then(setRaceResults);
    if (SURL && SKEY) {
      fetch(`${SURL}/rest/v1/scratchings?date=eq.${dateISO}&select=venue,race_num,horse_name`, {
        headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
      })
        .then(r => r.ok ? r.json() : [])
        .then(rows => {
          const s = new Set();
          rows.forEach(row => {
            s.add(`${(row.venue||'').toUpperCase()}||${row.race_num}||${(row.horse_name||'').toUpperCase()}`);
          });
          setScratchingsSet(s);
        })
        .catch(() => {});
    }
  }, [allRaces]);

  // Fetch today_meetings for track conditions shown in left rail
  useEffect(() => {
    if (!SURL || !SKEY) return;
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    fetch(`${SURL}/rest/v1/today_meetings?date=eq.${todayISO}&select=venue,track_condition`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const m = {};
        rows.forEach(r => { if (r.track_condition) m[(r.venue||'').toUpperCase()] = r.track_condition; });
        setVenueTrackConds(m);
      })
      .catch(() => {});
  }, []);

  const hasData = raceKeys.length > 0;

  const currentRaceResult = (() => {
    if (!currentRace) return null;
    const rawVenue = (currentRace.venue || '').toUpperCase();
    const normVenue = VENUE_NORMALISE[rawVenue] || rawVenue;
    const key = `${normVenue}||${String(currentRace.num)}`;
    return raceResults[key] || null;
  })();

  // Compute scored results once per race/trackCond/weights change
  const { results, scratched } = useMemo(() => {
    if (!currentRace) return { results: [], scratched: [] };
    const active = currentRace.horses.filter(h => !h.scratched);
    const scr    = currentRace.horses.filter(h => h.scratched);

    const res = active.map(h => {
      const grpScores = {};
      GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, trackCond); });
      const totalFromGroups = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
      return { ...h, grpScores, totalFromGroups };
    }).sort((a, b) => b.totalFromGroups - a.totalFromGroups);

    const oddsArr = calculateMatrixOdds(res);
    res.forEach((r, i) => { r.myOdds = oddsArr[i]; });

    // Best/worst per group for cell highlighting
    GRP_KEYS.forEach(gk => {
      const vals = res.map(r => r.grpScores[gk].total);
      const best = Math.max(...vals), worst = Math.min(...vals);
      res.forEach(r => {
        r._grpIsBest  = r._grpIsBest  || {};
        r._grpIsWorst = r._grpIsWorst || {};
        r._grpIsBest[gk]  = Math.abs(r.grpScores[gk].total - best)  < 0.001 && best !== worst;
        r._grpIsWorst[gk] = Math.abs(r.grpScores[gk].total - worst) < 0.001 && best !== worst;
      });
    });

    return { results: res, scratched: scr };
  }, [currentRace, trackCond, weights]);

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

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left rail — desktop only */}
      {hasData && (
        <div className="hidden md:flex">
          <LeftRail allVenues={allVenues} allRaces={allRaces} selectedRaceKey={selectedKey} onSelect={handleSelectRace} trackConds={trackConds} venueTrackConds={venueTrackConds} />
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!hasData ? (
          <UploadZone onFile={handleFile} />
        ) : (
          <>
            {/* Mobile race picker */}
            <MobileRacePicker allVenues={allVenues} allRaces={allRaces} selectedRaceKey={selectedKey} onSelect={handleSelectRace} />

            {/* CSV toolbar */}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-white border-b border-gray-100 text-[10px] text-gray-500 flex-shrink-0">
              <i className="ti ti-file-type-csv text-sm text-gray-400" />
              <span className="font-medium text-gray-700">{fileName}</span>
              <span className="text-gray-300">·</span>
              <span>{raceKeys.length} races</span>
              {meetingsSynced && <span style={{ color: '#059669', fontWeight: 600 }}>✓ Meetings synced</span>}
              <button
                onClick={() => { setAllRaces({}); setAllVenues({}); setRaceKeys([]); setSelectedKey(null); setFileName(''); setMeetingsSynced(false); }}
                className="ml-auto text-[9px] font-semibold text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <i className="ti ti-x text-xs" /> Clear
              </button>
            </div>

            {currentRace ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <RaceHeader rc={currentRace} trackCond={trackCond} setTrackCond={setTrackCond}
                  weights={weights} setWeights={setWeights} runnerCount={results.length}
                  onUpgrade={() => setUpgradeOpen(true)} />
                <div className="hidden md:block"><ViewTabBar view={view} setView={setView} runnerCount={results.length} /></div>
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
                {/* View content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  {view === 'field' && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <FieldView results={results} scratched={scratched} rc={currentRace}
                        trackCond={trackCond} onLogBet={handleLogBet}
                        onShowPopup={showHorsePopup} onHidePopup={hideHorsePopup}
                        isResulted={!!currentRaceResult}
                        isPro={isPro} onUpgrade={() => setUpgradeOpen(true)}
                        scratchingsSet={scratchingsSet} />
                    </div>
                  )}
                  {view === 'form' && (
                    <FormView results={results} scratched={scratched} onLogBet={handleLogBet} isResulted={!!currentRaceResult} rc={currentRace} isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} scratchingsSet={scratchingsSet} />
                  )}
                  {view === 'pacemap' && (
                    <PaceMapView results={results} scratched={scratched} rc={currentRace} trackCond={trackCond} isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a race from the left</div>
            )}
          </>
        )}
      </main>

      {/* Right rail — desktop only */}
      {hasData && (
        <div className="hidden md:flex">
          <RightRail allRaces={allRaces} allVenues={allVenues} selectedRaceKey={selectedKey} onSelect={handleSelectRace} />
        </div>
      )}

      {/* Horse hover popup — innerHTML injected imperatively */}
      <div id="horse-popup" ref={popupRef} style={{ display:'none', position:'fixed', zIndex:99999, width:480, maxHeight:'85vh', overflow:'auto', borderRadius:8, boxShadow:'0 8px 30px rgba(0,0,0,0.2)', border:'1px solid #e5e7eb', background:'white', fontFamily:'system-ui,-apple-system,sans-serif' }} />

      {/* Upgrade modal */}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}

      {/* Log Bet modal */}
      {betTarget && <BetModal horse={betTarget} onClose={() => setBetTarget(null)} />}
      {/* Race result modal */}
      {resultPopup && <RaceResultModal result={resultPopup} results={results} onClose={() => setResultPopup(null)} />}
      {/* Blackbook modal */}
      {bbTarget && <BlackbookModal target={bbTarget} onClose={() => { setBbTarget(null); const popup = document.getElementById('horse-popup'); if (popup) popup.style.display = ''; }} userId={user?.id} />}
    </div>
  );
}
