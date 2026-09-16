'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { normaliseVenue } from '@/lib/venues';
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
      const key = `${normaliseVenue(row.venue||'')}||${row.race_num}`;
      if (!g[key]) g[key] = {
        venue: normaliseVenue(row.venue||''), raceNum: row.race_num,
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

function normName(n) { return (n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

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
    <span style={{ fontSize: 9, color: isUrgent ? '#dc2626' : '#111827', fontWeight: isUrgent ? 700 : 400, marginLeft: 2 }}>
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
  const [popup, setPopup] = useState(null);

  const today = new Date();
  const todayISO = today.toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const dateStr = today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const tc = 'good';
  const tcC = TC_COLORS[tc];
  const tcL = TC_LABELS[tc];

  useEffect(() => {
    // Parses `csv` and applies it to state if it has races matching today's
    // AEST date. Returns true if applied — callers use this to decide
    // whether a network fallback is still needed (missing, empty, wrong-date,
    // or unparseable cache all count as "not usable").
    function applyCsv(csv) {
      if (!csv) return false;
      try {
        const { allRaces: ar, allVenues: av, raceKeys: rk } = buildRaces(parseCSV(csv));
        if (rk.length === 0) return false;
        // Only show CSV races if they match today's AEST date
        const firstRace = ar[rk[0]];
        let csvDateISO = null;
        if (firstRace?.date) {
          const p = firstRace.date.split('/');
          if (p.length === 3) csvDateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
        }
        if (csvDateISO && csvDateISO !== todayISO) return false;
        setAllRaces(ar); setAllVenues(av); setRaceKeys(rk);
        return true;
      } catch {
        return false;
      }
    }

    if (!applyCsv(localStorage.getItem('ww_csv'))) {
      // No usable cache — fetch fresh from Storage directly, same call
      // app/races/page.js makes on mount, so /today doesn't silently depend
      // on the user having visited /races first in this browser to populate
      // localStorage.
      fetch('/api/today-csv')
        .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
        .then(text => {
          localStorage.setItem('ww_csv', text);
          localStorage.setItem('ww_csv_name', 'today.csv');
          applyCsv(text);
        })
        .catch(() => {});
    }

    fetchTodayResults(todayISO).then(setResults);
  }, [todayISO]);

  const venues = Object.keys(allVenues);
  const hasCSV = raceKeys.length > 0;

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
            <p style={{ fontSize:11 }}>Today&apos;s meetings will appear here shortly</p>
          </div>
        ) : (
          <>
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
                        const resKey = `${normaliseVenue(venue)}||${rc.num}`;
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
                            {rc.time && <span style={{ fontSize:10, color:resulted?'#065f46':'#111827' }}>{rc.time}</span>}
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
