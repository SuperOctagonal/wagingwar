'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, calculateMatrixOdds, formatRacingOdds, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import ProfileRail from '@/components/ProfileRail';
import useIsMobile from '@/hooks/useIsMobile';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchTodayResults(dateStr) {
  if (!SURL || !SKEY) return {};
  try {
    const res = await fetch(
      `${SURL}/rest/v1/race_results?select=*&date=eq.${dateStr}&order=venue,race_num,finish_pos`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const g = {};
    rows.forEach(row => {
      const key = `${(row.venue||'').toUpperCase()}||${row.race_num}`;
      if (!g[key]) g[key] = {
        venue: (row.venue||'').toUpperCase(), raceNum: row.race_num,
        raceTime: row.race_time || '', trackCond: row.track_cond || '',
        runners: []
      };
      if (row.finish_pos) g[key].runners.push({
        place: row.finish_pos, name: row.horse_name,
        sp: row.sp || 0, margin: row.margin || ''
      });
    });
    Object.values(g).forEach(x => x.runners.sort((a, b) => a.place - b.place));
    return g;
  } catch { return {}; }
}

const TC_COLORS = {
  good:      { bg: '#d1fae5', text: '#065f46' },
  soft:      { bg: '#fef9c3', text: '#713f12' },
  heavy:     { bg: '#dbeafe', text: '#1e3a8a' },
  synthetic: { bg: '#f3e8ff', text: '#4c1d95' },
};
const TC_LABELS = { good: 'Good', soft: 'Soft', heavy: 'Heavy', synthetic: 'Synth' };

function getTopPicks(allRaces, allVenues, weights) {
  const picks = [];
  Object.values(allVenues).forEach(keys => {
    keys.forEach(k => {
      const rc = allRaces[k];
      if (!rc || !rc.horses) return;
      const active = rc.horses.filter(h => !h.scratched);
      if (!active.length) return;
      const scored = active.map(h => {
        const grpScores = {};
        GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, 'good'); });
        const total = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
        return { ...h, grpScores, total };
      }).sort((a, b) => b.total - a.total);
      const best = scored[0];
      if (best && best.rawOdds >= 5 && best.rawOdds <= 15) {
        const allOdds = calculateMatrixOdds(scored);
        picks.push({ ...best, myOdds: allOdds[0], venue: rc.venue, num: rc.num });
      }
    });
  });
  picks.sort((a, b) => {
    const va = a.rawOdds && a.myOdds ? (a.rawOdds - a.myOdds) / a.myOdds : 0;
    const vb = b.rawOdds && b.myOdds ? (b.rawOdds - b.myOdds) / b.myOdds : 0;
    return vb - va;
  });
  return picks.slice(0, 3);
}

function ResultPopup({ result, onClose }) {
  const placeStyle = p => {
    if (p === 1) return { bg: '#fbbf24', color: '#78350f' };
    if (p === 2) return { bg: '#d1d5db', color: '#374151' };
    if (p === 3) return { bg: '#fed7aa', color: '#92400e' };
    return { bg: '#f3f4f6', color: '#9ca3af' };
  };
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}
    >
      <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', width:340, maxWidth:'95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ background:'#1e2936', padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>{result.venue} R{result.raceNum}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:12 }}>
          {result.raceTime && <div style={{ fontSize:10, color:'#9ca3af', marginBottom:8 }}>{result.raceTime}{result.trackCond ? ` · ${result.trackCond}` : ''}</div>}
          {result.runners.slice(0, 5).map(r => {
            const ps = placeStyle(r.place);
            const rowBg = r.place===1?'#fffbeb':r.place===2?'#f8fafc':r.place===3?'#fdf4ff':'#fff';
            return (
              <div key={r.place} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 8px', marginBottom:4, borderRadius:8, background:rowBg }}>
                <span style={{ width:22, height:22, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0, background:ps.bg, color:ps.color }}>{r.place}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</div>
                  {r.sp > 0 && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>SP ${Number(r.sp).toFixed(2)}{r.margin ? ` · ${r.margin}` : ''}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function parsePillDate(time, date) {
  if (!time) return null;
  // Normalise: "01.58 pm" → "01:58 pm", "13.30" → "13:30"
  const t = time.trim().replace(/\./g, ':');
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
  let dateISO = date;
  if (date) {
    const p = date.split('/');
    if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    dateISO = new Date().toISOString().slice(0, 10);
  }
  const raceAt = new Date(`${dateISO}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  return isNaN(raceAt.getTime()) ? null : raceAt;
}

function PillCountdown({ time, date }) {
  const [secsLeft, setSecsLeft] = useState(null);

  useEffect(() => {
    function compute() {
      const raceAt = parsePillDate(time, date);
      if (!raceAt) { setSecsLeft(null); return; }
      setSecsLeft(Math.floor((raceAt.getTime() - Date.now()) / 1000));
    }
    compute();
    const id = setInterval(compute, 30000);
    return () => clearInterval(id);
  }, [time, date]);

  if (secsLeft === null) return null;
  if (secsLeft < 0) return <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 2 }}>Done</span>;

  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;
  const isUrgent = secsLeft < 300;
  const label = h > 0 ? `${h}h ${m}m` : secsLeft >= 60 ? `${m}m` : `${s}s`;

  return (
    <span style={{ fontSize: 9, color: isUrgent ? '#dc2626' : '#9ca3af', fontWeight: isUrgent ? 700 : 400, marginLeft: 2 }}>
      {label}
    </span>
  );
}

export default function TodayPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [allRaces, setAllRaces] = useState({});
  const [allVenues, setAllVenues] = useState({});
  const [raceKeys, setRaceKeys] = useState([]);
  const [results, setResults] = useState({});
  const [picksOpen, setPicksOpen] = useState(false);
  const [popup, setPopup] = useState(null);

  const weights = useMemo(() => getDefaultWeights(), []);

  const today = new Date();
  const todayISO = today.toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const dateStr = today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const tc = 'good';
  const tcC = TC_COLORS[tc];
  const tcL = TC_LABELS[tc];

  useEffect(() => {
    const csv = localStorage.getItem('ww_csv');
    if (csv) {
      try {
        const { allRaces: ar, allVenues: av, raceKeys: rk } = buildRaces(parseCSV(csv));
        if (rk.length > 0) {
          // Only show CSV races if they match today's AEST date
          const firstRace = ar[rk[0]];
          let csvDateISO = null;
          if (firstRace?.date) {
            const p = firstRace.date.split('/');
            if (p.length === 3) csvDateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
          }
          if (!csvDateISO || csvDateISO === todayISO) {
            setAllRaces(ar); setAllVenues(av); setRaceKeys(rk);
          }
        }
      } catch {}
    }
    fetchTodayResults(todayISO).then(setResults);
  }, [todayISO]);

  const venues = Object.keys(allVenues);
  const hasCSV = raceKeys.length > 0;
  const picks = useMemo(() => hasCSV ? getTopPicks(allRaces, allVenues, weights) : [], [allRaces, allVenues, weights, hasCSV]);

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ padding:'16px 20px', maxWidth:1100, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#111827' }}>Today</div>
          <div style={{ fontSize:10, color:'#9ca3af' }}>{dateStr}</div>
        </div>

        {!hasCSV ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:10, color:'#9ca3af' }}>
            <i className="ti ti-calendar" style={{ fontSize:36 }} />
            <p style={{ fontSize:11 }}>Load a CSV to see today&apos;s meetings</p>
          </div>
        ) : (
          <>
            {/* Top Picks */}
            {picks.length > 0 && (
              <div style={{ display: isMobile ? 'flex' : 'inline-flex', flexDirection:'column', marginBottom:16, border:'0.5px solid #e5e7eb', borderRadius:10, overflow:'hidden', background:'#fff', minWidth:260, maxWidth:'100%', width: isMobile ? '100%' : undefined }}>
                <div
                  onClick={() => setPicksOpen(v => !v)}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', cursor:'pointer', userSelect:'none' }}
                >
                  <span style={{ fontSize:11 }}>🏆</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>Today&apos;s top picks</span>
                  <span style={{ background:'#fbbf24', color:'#78350f', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:8 }}>{picks.length}</span>
                  <i className={`ti ti-chevron-${picksOpen ? 'up' : 'down'}`} style={{ fontSize:13, color:'#9ca3af', transition:'transform .2s', marginLeft:4 }} />
                </div>
                {picksOpen && (
                  <div style={{ borderTop:'0.5px solid #f3f4f6', padding:'10px 14px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:8 }}>
                      {picks.map((p, i) => {
                        const rkBg  = i===0?'#fbbf24':i===1?'#e5e7eb':'#fed7aa';
                        const rkTxt = i===0?'#78350f':i===1?'#374151':'#92400e';
                        return (
                          <div key={p.name} style={{ background:'#fff', border:'0.5px solid #e5e7eb', borderRadius:8, padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:22, height:22, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0, background:rkBg, color:rkTxt }}>{i+1}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'#111827' }}>{p.name}</div>
                              <div style={{ fontSize:10, color:'#9ca3af' }}>{p.venue} R{p.num}</div>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div style={{ fontSize:11, fontWeight:600, color:'#059669', fontFamily:'JetBrains Mono, monospace' }}>{p.myOdds ? `$${formatRacingOdds(p.myOdds)}` : '—'}</div>
                              <div style={{ fontSize:10, color:'#111827', fontFamily:'JetBrains Mono, monospace' }}>{p.rawOdds ? `$${p.rawOdds.toFixed(2)}` : '—'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Meetings label */}
            <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
              {venues.length} meetings today
            </div>

            {/* Meetings grid */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap:6 }}>
              {venues.map(venue => {
                const keys = allVenues[venue] || [];
                return (
                  <div key={venue} style={{ background:'#fff', border:'0.5px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
                    <div style={{ background:'#1e2936', padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#fff', letterSpacing:'.4px', textTransform:'uppercase' }}>{venue}</span>
                      <span style={{ background:tcC.bg, color:tcC.text, fontSize:9, fontWeight:700, padding:'1px 7px', borderRadius:5 }}>{tcL}</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', padding:'3px 4px' }}>
                      {keys.map(k => {
                        const rc = allRaces[k];
                        if (!rc) return null;
                        const resKey = `${venue.toUpperCase()}||${rc.num}`;
                        const res = results[resKey];
                        const resulted = !!res;
                        return (
                          <div
                            key={k}
                            onClick={() => resulted ? setPopup(res) : router.push(`/races?select=${encodeURIComponent(k)}`)}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 6px', cursor:'pointer', borderRadius:5, transition:'background .1s', background:resulted ? '#d1fae5' : undefined, margin:2 }}
                            onMouseEnter={e => { if (!resulted) e.currentTarget.style.background = '#f0fdf4'; }}
                            onMouseLeave={e => { if (!resulted) e.currentTarget.style.background = ''; }}
                          >
                            <span style={{ fontSize:11, fontWeight:700, color:resulted?'#065f46':'#111827' }}>R{rc.num}{resulted?' ✓':''}</span>
                            {rc.time && <span style={{ fontSize:10, color:resulted?'#065f46':'#9ca3af' }}>{rc.time}</span>}
                            {!resulted && rc.time && <PillCountdown time={rc.time} date={rc.date} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {popup && <ResultPopup result={popup} onClose={() => setPopup(null)} />}
      </main>
    </div>
  );
}
