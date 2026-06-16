'use client';

import { useState, useEffect, useMemo } from 'react';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import ProfileRail from '@/components/ProfileRail';
import useIsMobile from '@/hooks/useIsMobile';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchResultsForDate(dateStr) {
  if (!SURL || !SKEY) return [];
  try {
    const res = await fetch(
      `${SURL}/rest/v1/race_results?select=*&date=eq.${dateStr}&order=venue,race_num,finish_pos`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

function normName(n) { return (n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function getSysRanks(allRaces, allVenues, venue, raceNum, weights) {
  for (const keys of Object.values(allVenues)) {
    for (const k of keys) {
      const rc = allRaces[k];
      if (!rc) continue;
      if ((rc.venue || '').toUpperCase() !== (venue || '').toUpperCase()) continue;
      if (String(rc.num) !== String(raceNum)) continue;
      const active = (rc.horses || []).filter(h => !h.scratched);
      const scored = active.map(h => {
        const grpScores = {};
        GRP_KEYS.forEach(gk => { grpScores[gk] = scoreGroup(h, gk, weights, 'good'); });
        const total = GRP_KEYS.reduce((a, gk) => a + grpScores[gk].total, 0);
        return { name: h.name, total };
      }).sort((a, b) => b.total - a.total);
      const map = {};
      scored.forEach((h, i) => { map[normName(h.name)] = i + 1; });
      return map;
    }
  }
  return null;
}

function placeStyle(p) {
  if (p === 1) return { bg: '#fbbf24', color: '#78350f' };
  if (p === 2) return { bg: '#e5e7eb', color: '#374151' };
  if (p === 3) return { bg: '#fed7aa', color: '#92400e' };
  return { bg: '#f1f5f9', color: '#374151' };
}

function rankStyle(r) {
  if (r === 1) return { bg: '#fbbf24', color: '#78350f' };
  if (r === 2) return { bg: '#e5e7eb', color: '#374151' };
  if (r === 3) return { bg: '#fed7aa', color: '#92400e' };
  return { bg: '#f3f4f6', color: '#9ca3af' };
}

function ResultsDetail({ meeting, venue, allRaces, allVenues, weights }) {
  if (!meeting || !meeting.runners || !meeting.runners.length) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:160, gap:10, color:'#9ca3af' }}>
        <i className="ti ti-flag-check" style={{ fontSize:32 }} />
        <p style={{ fontSize:12 }}>No results yet for this race</p>
      </div>
    );
  }

  const sysRankMap = getSysRanks(allRaces, allVenues, venue, meeting.raceNum, weights) || {};
  const hasSysRank = Object.keys(sysRankMap).length > 0;

  return (
    <div style={{ display:'inline-block', minWidth:320, width:'100%' }}>
      <div style={{ background:'#1e2936', padding:'7px 12px', borderRadius:'8px 8px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>
          {venue} R{meeting.raceNum} — Results
          <span style={{ background:'#22c55e', fontSize:7, padding:'1px 5px', borderRadius:3, marginLeft:6, verticalAlign:'middle' }}>OFFICIAL</span>
        </span>
        <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', display:'flex', gap:8 }}>
          {meeting.raceTime && <span>{meeting.raceTime}</span>}
          {meeting.trackCond && <span>{meeting.trackCond}</span>}
          {meeting.dist && <span>{meeting.dist}</span>}
        </div>
      </div>

      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
        <thead>
          <tr style={{ background:'#f1f5f9', borderBottom:'1px solid #e5e7eb' }}>
            <th style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#374151', textAlign:'center', width:28 }}>POS</th>
            <th style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#374151', textAlign:'left' }}>HORSE</th>
            {hasSysRank && <th style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#374151', textAlign:'center', width:44 }}>RANK</th>}
            <th style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#374151', textAlign:'right', width:56 }}>SP</th>
            <th style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#374151', textAlign:'right', width:56 }}>MARGIN</th>
          </tr>
        </thead>
        <tbody>
          {meeting.runners.map(r => {
            const p = r.place;
            const isTop3 = p <= 3;
            const ps = placeStyle(p);
            const rowBg = p===1?'#fffbeb':p===2?'#f8fafc':p===3?'#fdf4ff':'#fff';
            const sysRank = sysRankMap[normName(r.name)] || null;
            const rs = sysRank ? rankStyle(sysRank) : null;
            const pad = '4px 8px';
            return (
              <tr key={`${p}-${r.name}`} style={{ background:rowBg, borderBottom:'0.5px solid #f3f4f6' }}>
                <td style={{ padding:pad, textAlign:'center' }}>
                  <span style={{ width:18, height:18, borderRadius:4, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, background:ps.bg, color:ps.color }}>{p}</span>
                </td>
                <td style={{ padding:pad, whiteSpace:'nowrap' }}>
                  <span style={{ fontSize:12, fontWeight:isTop3?600:400, color:'#111827' }}>{r.name}</span>
                </td>
                {hasSysRank && (
                  <td style={{ padding:pad, textAlign:'center' }}>
                    {rs
                      ? <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, background:rs.bg, color:rs.color }}>{sysRank}</span>
                      : <span style={{ fontSize:9, color:'#d1d5db' }}>—</span>
                    }
                  </td>
                )}
                <td style={{ padding:pad, textAlign:'right', fontFamily:'JetBrains Mono, monospace', fontSize:12, fontWeight:700, color:'#111827' }}>
                  ${Number(r.sp || 0).toFixed(2)}
                </td>
                <td style={{ padding:pad, textAlign:'right', fontSize:12, color:'#374151' }}>{r.margin || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(meeting.l600 || meeting.trackCond || (meeting.scratched && meeting.scratched.length > 0)) && (
        <div style={{ padding:'5px 8px', background:'#f8fafc', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', display:'flex', gap:12, flexWrap:'wrap', marginTop:-1 }}>
          {meeting.l600 && <span style={{ fontSize:10, color:'#6b7280' }}>L600m: <b style={{ color:'#111827', fontFamily:'JetBrains Mono, monospace' }}>{meeting.l600}</b></span>}
          {meeting.trackCond && <span style={{ fontSize:10, color:'#6b7280' }}>Track: <b style={{ color:'#111827' }}>{meeting.trackCond}</b></span>}
          {meeting.scratched && meeting.scratched.length > 0 && <span style={{ fontSize:10, color:'#9ca3af' }}>Scratched: {meeting.scratched.join(' · ')}</span>}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const isMobile = useIsMobile();
  const [allRaces, setAllRaces] = useState({});
  const [allVenues, setAllVenues] = useState({});
  const [dbRows, setDbRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const weights = useMemo(() => getDefaultWeights(), []);

  useEffect(() => {
    const csv = localStorage.getItem('ww_csv');
    if (csv) {
      try {
        const { allRaces: ar, allVenues: av } = buildRaces(parseCSV(csv));
        setAllRaces(ar); setAllVenues(av);
      } catch {}
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedMeeting(null);
    setSelectedRace(null);
    fetchResultsForDate(selectedDate).then(rows => {
      setDbRows(rows || []);
      setLoading(false);
    });
  }, [selectedDate]);

  useEffect(() => {
    console.log('selectedRace changed to:', selectedRace);
  }, [selectedRace]);

  // Group raw rows into { 'VENUE||raceNum': { venue, raceNum, runners, ... } }
  const grouped = useMemo(() => {
    const g = {};
    (dbRows || []).forEach(row => {
      const key = `${(row.venue||'').toUpperCase()}||${row.race_num}`;
      if (!g[key]) g[key] = {
        venue: (row.venue||'').toUpperCase(),
        raceNum: row.race_num,
        raceTime: row.race_time || '',
        trackCond: row.track_cond || '',
        dist: row.dist || '',
        l600: row.l600 || '',
        scratched: [],
        runners: []
      };
      if (row.finish_pos) g[key].runners.push({
        place: row.finish_pos,
        name: row.horse_name,
        sp: row.sp || 0,
        margin: row.margin || ''
      });
    });
    Object.values(g).forEach(x => x.runners.sort((a, b) => a.place - b.place));
    return g;
  }, [dbRows]);

  // Build { VENUE: [{ raceNum, results }] }
  const meetings = useMemo(() => {
    const m = {};
    Object.values(grouped).forEach(res => {
      const v = res.venue;
      if (!m[v]) m[v] = [];
      if (!m[v].find(r => r.raceNum === res.raceNum)) {
        m[v].push({ raceNum: res.raceNum, results: res });
      }
    });
    Object.values(m).forEach(arr => arr.sort((a, b) => a.raceNum - b.raceNum));
    return m;
  }, [grouped]);

  const venueNames = Object.keys(meetings);
  const meetingRaces = selectedMeeting ? (meetings[selectedMeeting] || []) : [];

  // Active race data — only show results for an explicitly selected tab.
  // No auto-default: opening a meeting shows nothing until a tab is clicked.
  const activeRaceData = (() => {
    if (!selectedMeeting) return null;
    const races = meetings[selectedMeeting] || [];
    console.log('activeRaceData: selectedRace=', selectedRace, 'races=', races.map(r => r.raceNum));
    if (selectedRace != null) {
      const match = races.find(r => Number(r.raceNum) === Number(selectedRace));
      console.log('activeRaceData: match=', match?.raceNum);
      if (!match) return null;
      return match.results ? { ...match.results, raceNum: match.raceNum } : null;
    }
    return null;
  })();

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ padding:'16px 20px', maxWidth:1100, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems: isMobile ? 'flex-start' : 'baseline', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 12, marginBottom:14 }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#111827' }}>Results</div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ border:'0.5px solid #d1d5db', borderRadius:6, padding:'4px 8px', fontSize:11, fontFamily:'Space Grotesk, sans-serif', color:'#374151', background:'#fff', outline:'none', width: isMobile ? '100%' : undefined }}
          />
          <button
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              const rows = await fetchResultsForDate(selectedDate);
              setDbRows(rows || []);
              setRefreshing(false);
            }}
            style={{ fontSize:11, padding:'3px 10px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:4, cursor:'pointer', fontWeight:600, color:'#374151', opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? 'Checking…' : '🔄 Refresh'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, gap:8, color:'#9ca3af', fontSize:12 }}>
            <i className="ti ti-loader-2 animate-spin" style={{ fontSize:18 }} />
            Loading results…
          </div>
        )}

        {!loading && (selectedMeeting ? (
          <>
            {/* Individual meeting view */}
            {/* Back + title */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <button
                onClick={() => { setSelectedMeeting(null); setSelectedRace(null); }}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:6, border:'0.5px solid #e5e7eb', background:'#fff', color:'#374151', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
              >
                <i className="ti ti-arrow-left" style={{ fontSize:12 }} /> All meetings
              </button>
              <span style={{ fontSize:14, fontWeight:700, color:'#111827' }}>{selectedMeeting}</span>
            </div>

            {/* Race tab pills */}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12, position:'relative', zIndex:10 }}>
              {meetingRaces.map(r => {
                const resulted = !!r.results;
                const isActive = selectedRace != null && Number(r.raceNum) === Number(selectedRace);
                const bg     = isActive ? '#1e2936' : resulted ? '#d1fae5' : '#f1f5f9';
                const color  = isActive ? '#fff'     : resulted ? '#065f46' : '#9ca3af';
                const border = isActive ? '#1e2936'  : resulted ? '#86efac' : '#e5e7eb';
                return (
                  <button
                    key={r.raceNum}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedRace(Number(r.raceNum)); console.log('TAB CLICKED', r.raceNum); }}
                    style={{ padding:'4px 10px', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', background:bg, color, border:`0.5px solid ${border}`, fontFamily:'inherit' }}
                  >
                    R{r.raceNum}{resulted ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>

            {/* Results detail */}
            <ResultsDetail
              meeting={activeRaceData}
              venue={selectedMeeting}
              allRaces={allRaces}
              allVenues={allVenues}
              weights={weights}
            />
          </>
        ) : (
          <>
            {/* Meetings grid */}
            {venueNames.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:10, color:'#9ca3af' }}>
                <i className="ti ti-flag-check" style={{ fontSize:36 }} />
                <p style={{ fontSize:12 }}>Load a CSV or results will appear here automatically</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                  {venueNames.length} meetings
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap:8, marginBottom:16, maxWidth:1000 }}>
                  {venueNames.map(venue => {
                    const races = meetings[venue];
                    const resultedCount = races.filter(r => r.results).length;
                    const allResulted = resultedCount === races.length;
                    const badgeBg    = allResulted ? '#d1fae5' : '#f1f5f9';
                    const badgeColor = allResulted ? '#065f46' : '#9ca3af';
                    return (
                      <div
                        key={venue}
                        onClick={() => {
                          const firstResulted = (meetings[venue] || []).find(r => r.results)?.raceNum ?? null;
                          setSelectedMeeting(venue);
                          setSelectedRace(firstResulted);
                        }}
                        style={{ background:'#fff', border:'0.5px solid #e5e7eb', borderRadius:8, overflow:'hidden', cursor:'pointer', transition:'box-shadow .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; }}
                      >
                        <div style={{ background:'#1e2936', padding:'7px 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'.4px' }}>{venue}</span>
                          <span style={{ background:badgeBg, color:badgeColor, fontSize:9, fontWeight:600, padding:'1px 7px', borderRadius:5 }}>
                            {resultedCount}/{races.length} resulted
                          </span>
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', padding:'4px 6px 2px' }}>
                          {races.map(r => {
                            const cls = r.results
                              ? { bg:'#d1fae5', color:'#065f46' }
                              : { bg:'#f1f5f9', color:'#9ca3af' };
                            return (
                              <div key={r.raceNum} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 7px', borderRadius:5, margin:2, fontSize:10, fontWeight:600, background:cls.bg, color:cls.color }}>
                                R{r.raceNum}{r.results ? ' ✓' : ''}
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
          </>
        ))}
      </div>
      </main>
    </div>
  );
}
