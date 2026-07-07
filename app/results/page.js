'use client';

import { useState, useEffect, useMemo } from 'react';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, getDefaultWeights, GRP_KEYS } from '@/lib/scoring';
import { normaliseVenue } from '@/lib/venues';
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

function getSysRanks(allRaces, allVenues, venue, raceNum, weights, dbScratchings = []) {
  const normVenue = normaliseVenue(venue);
  const dbScrNames = new Set(
    dbScratchings.filter(r => normaliseVenue(r.venue) === normVenue && String(r.race_num) === String(raceNum))
      .map(r => normName(r.horse_name || ''))
  );
  for (const keys of Object.values(allVenues)) {
    for (const k of keys) {
      const rc = allRaces[k];
      if (!rc) continue;
      if (normaliseVenue(rc.venue) !== normVenue) continue;
      if (String(rc.num) !== String(raceNum)) continue;
      const active = (rc.horses || []).filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
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
  return { bg: '#f3f4f6', color: '#374151' };
}

function ResultsDetail({ meeting, venue, allRaces, allVenues, weights, dbScratchings }) {
  if (!meeting || !meeting.runners || !meeting.runners.length) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:160, gap:10, color:'#374151' }}>
        <i className="ti ti-flag-check" style={{ fontSize:32 }} />
        <p style={{ fontSize:11 }}>No results yet for this race</p>
      </div>
    );
  }

  const sysRankMap = getSysRanks(allRaces, allVenues, venue, meeting.raceNum, weights, dbScratchings) || {};
  const hasSysRank = Object.keys(sysRankMap).length > 0;

  return (
    <div style={{ display:'inline-block', minWidth:420, width:'fit-content' }}>
      <div style={{ background:'#1e2936', padding:'6px 10px', borderRadius:'8px 8px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>
          {venue} R{meeting.raceNum} — Results
          <span style={{ background:'#22c55e', fontSize:9, padding:'1px 5px', borderRadius:3, marginLeft:6, verticalAlign:'middle' }}>OFFICIAL</span>
        </span>
        <div style={{ fontSize:9, color:'#fff', display:'flex', gap:8 }}>
          {meeting.raceTime && <span>{meeting.raceTime}</span>}
          {meeting.trackCond && <span>{meeting.trackCond}</span>}
          {meeting.dist && <span>{meeting.dist}</span>}
        </div>
      </div>

      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
        <thead>
          <tr style={{ background:'#f1f5f9', borderBottom:'1px solid #e5e7eb' }}>
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'center', width:28 }}>POS</th>
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'left', minWidth:160 }}>HORSE</th>
            {hasSysRank && <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'center', width:44 }}>RANK</th>}
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'right', width:56 }}>SP</th>
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'right', width:56 }}>MARGIN</th>
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'left', minWidth:100, whiteSpace:'nowrap' }}>TRAINER</th>
            <th style={{ padding:'4px 6px', fontSize:9, fontWeight:700, color:'#111827', textAlign:'left', minWidth:80, whiteSpace:'nowrap' }}>JOCKEY</th>
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
            const pad = '4px 6px';
            return (
              <tr key={`${p}-${r.name}`} style={{ background:rowBg, borderBottom:'0.5px solid #f3f4f6' }}>
                <td style={{ padding:pad, textAlign:'center' }}>
                  <span style={{ width:18, height:18, borderRadius:4, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, background:ps.bg, color:ps.color }}>{p}</span>
                </td>
                <td style={{ padding:pad, whiteSpace:'nowrap' }}>
                  <span style={{ fontSize:13, fontWeight:isTop3?600:400, color:'#111827' }}>{r.name}</span>
                </td>
                {hasSysRank && (
                  <td style={{ padding:pad, textAlign:'center' }}>
                    {rs
                      ? <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, background:rs.bg, color:rs.color }}>{sysRank}</span>
                      : <span style={{ fontSize:9, color:'#6b7280' }}>—</span>
                    }
                  </td>
                )}
                <td style={{ padding:pad, textAlign:'right', fontFamily:'JetBrains Mono, monospace', fontSize:11, fontWeight:500, color:'#111827' }}>
                  ${Number(r.sp || 0).toFixed(2)}
                </td>
                <td style={{ padding:pad, textAlign:'right', fontSize:11, color:'#111827', whiteSpace:'nowrap' }}>{r.margin || '—'}</td>
                <td style={{ padding:pad, whiteSpace:'nowrap', fontSize:11, color:'#111827' }}>
                  {r.trainer || '—'}
                </td>
                <td style={{ padding:pad, whiteSpace:'nowrap', fontSize:11, color:'#111827' }}>
                  {r.jockey || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(meeting.l600 || meeting.trackCond || (meeting.scratched && meeting.scratched.length > 0)) && (
        <div style={{ padding:'5px 8px', background:'#f8fafc', border:'0.5px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', display:'flex', gap:12, flexWrap:'wrap', marginTop:-1 }}>
          {meeting.l600 && <span style={{ fontSize:10, color:'#374151' }}>L600m: <b style={{ color:'#111827', fontFamily:'JetBrains Mono, monospace' }}>{meeting.l600}</b></span>}
          {meeting.trackCond && <span style={{ fontSize:10, color:'#374151' }}>Track: <b style={{ color:'#111827' }}>{meeting.trackCond}</b></span>}
          {meeting.scratched && meeting.scratched.length > 0 && <span style={{ fontSize:10, color:'#374151' }}>Scratched: {meeting.scratched.join(' · ')}</span>}
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
  const [dbScratchings, setDbScratchings] = useState([]);
  const [venueAbandoned, setVenueAbandoned] = useState(new Set());
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
    setVenueAbandoned(new Set());
    const hdrs = (SURL && SKEY) ? { apikey: SKEY, Authorization: `Bearer ${SKEY}` } : null;
    const scrFetch = hdrs
      ? fetch(`${SURL}/rest/v1/scratchings?date=eq.${selectedDate}&select=venue,race_num,horse_name`, { headers: hdrs }).then(r => r.ok ? r.json() : [])
      : Promise.resolve([]);
    const abandonedFetch = hdrs
      ? fetch(`${SURL}/rest/v1/today_meetings?date=eq.${selectedDate}&select=venue,is_abandoned`, { headers: hdrs })
          .then(r => r.ok ? r.json() : [])
          .then(rows => new Set((rows || []).filter(r => r.is_abandoned).map(r => normaliseVenue(r.venue))))
          .catch(() => new Set())
      : Promise.resolve(new Set());
    Promise.all([fetchResultsForDate(selectedDate), scrFetch, abandonedFetch]).then(([rows, scrRows, abandoned]) => {
      setDbRows(rows || []);
      setDbScratchings(scrRows || []);
      setVenueAbandoned(abandoned);
      setLoading(false);
    });
  }, [selectedDate]);

  // Group raw rows into { 'VENUE||raceNum': { venue, raceNum, runners, ... } }
  const grouped = useMemo(() => {
    const g = {};
    (dbRows || []).forEach(row => {
      const norm = normaliseVenue(row.venue);
      const key = `${norm}||${row.race_num}`;
      if (!g[key]) g[key] = {
        venue: norm,
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
        margin: row.margin || '',
        trainer: row.trainer || '',
        jockey: row.jockey || '',
      });
    });
    // Populate scratched list from DB scratchings table
    (dbScratchings || []).forEach(row => {
      const key = `${normaliseVenue(row.venue)}||${row.race_num}`;
      if (g[key] && row.horse_name) g[key].scratched.push(row.horse_name);
    });
    Object.values(g).forEach(x => x.runners.sort((a, b) => a.place - b.place));
    return g;
  }, [dbRows, dbScratchings]);

  // Build { VENUE: [{ raceNum, results }] } — only venues present in the loaded CSV
  const meetings = useMemo(() => {
    const csvNormVenues = new Set(Object.keys(allVenues).map(k => normaliseVenue(k)));
    const m = {};
    Object.values(grouped).forEach(res => {
      const v = res.venue; // already normalised in grouped
      if (!csvNormVenues.has(v)) return;
      if (!m[v]) m[v] = [];
      if (!m[v].find(r => r.raceNum === res.raceNum)) {
        m[v].push({ raceNum: res.raceNum, results: res });
      }
    });
    // Add all CSV races (resulted and unresulted) for every CSV venue
    Object.values(allVenues).flat().forEach(k => {
      const rc = allRaces[k];
      if (!rc) return;
      const v = normaliseVenue(rc.venue);
      if (!m[v]) m[v] = [];
      if (!m[v].find(r => String(r.raceNum) === String(rc.num))) {
        m[v].push({ raceNum: rc.num, results: null });
      }
    });
    Object.values(m).forEach(arr => arr.sort((a, b) => a.raceNum - b.raceNum));
    return m;
  }, [grouped, allRaces, allVenues]);

  const venueNames = Object.keys(meetings);
  const meetingRaces = selectedMeeting ? (meetings[selectedMeeting] || []) : [];

  // Active race data — only show results for an explicitly selected tab.
  // No auto-default: opening a meeting shows nothing until a tab is clicked.
  const activeRaceData = (() => {
    if (!selectedMeeting) return null;
    const races = meetings[selectedMeeting] || [];
    if (selectedRace != null) {
      const match = races.find(r => Number(r.raceNum) === Number(selectedRace));
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
            style={{ border:'0.5px solid #d1d5db', borderRadius:6, padding:'4px 8px', fontSize:11, fontFamily:'Space Grotesk, sans-serif', color:'#111827', background:'#fff', outline:'none', width: isMobile ? '100%' : undefined }}
          />
          <button
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              const rows = await fetchResultsForDate(selectedDate);
              setDbRows(rows || []);
              setRefreshing(false);
            }}
            style={{ fontSize:11, padding:'4px 8px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:4, cursor:'pointer', fontWeight:600, color:'#111827', opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? 'Checking…' : '🔄 Refresh'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, gap:8, color:'#374151', fontSize:11 }}>
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
                style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', borderRadius:6, border:'0.5px solid #e5e7eb', background:'#fff', color:'#111827', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
              >
                <i className="ti ti-arrow-left" style={{ fontSize:11 }} /> All meetings
              </button>
              <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{selectedMeeting}</span>
              {venueAbandoned.has(selectedMeeting) && (
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3, background:'#6b7280', color:'#fff' }}>ABANDONED</span>
              )}
            </div>

            {/* Race tab pills */}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12, position:'relative', zIndex:10 }}>
              {meetingRaces.map(r => {
                const resulted = !!r.results;
                const isActive = selectedRace != null && Number(r.raceNum) === Number(selectedRace);
                const bg     = isActive ? '#1e2936' : resulted ? '#d1fae5' : '#f1f5f9';
                const color  = isActive ? '#fff'     : resulted ? '#065f46' : '#374151';
                const border = isActive ? '#1e2936'  : resulted ? '#86efac' : '#e5e7eb';
                return (
                  <button
                    key={r.raceNum}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedRace(Number(r.raceNum)); }}
                    style={{ padding:'3px 6px', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', background:bg, color, border:`0.5px solid ${border}`, fontFamily:'inherit' }}
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
              dbScratchings={dbScratchings}
            />
          </>
        ) : (
          <>
            {/* Meetings grid */}
            {venueNames.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:10, color:'#374151' }}>
                <i className="ti ti-flag-check" style={{ fontSize:36 }} />
                <p style={{ fontSize:11 }}>Load a CSV or results will appear here automatically</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize:10, fontWeight:600, color:'#374151', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                  {venueNames.length} meetings
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap:6, marginBottom:16, maxWidth:1000 }}>
                  {venueNames.map(venue => {
                    const races = meetings[venue];
                    const resultedCount = races.filter(r => r.results).length;
                    const allResulted = resultedCount === races.length;
                    const isAbandoned = venueAbandoned.has(venue);
                    const badgeBg    = allResulted ? '#d1fae5' : '#f1f5f9';
                    const badgeColor = allResulted ? '#065f46' : '#374151';
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
                        <div style={{ background:'#1e2936', padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'.4px' }}>{venue}</span>
                          {isAbandoned ? (
                            <span style={{ background:'#6b7280', color:'#fff', fontSize:9, fontWeight:600, padding:'1px 7px', borderRadius:5 }}>Abandoned</span>
                          ) : (
                            <span style={{ background:badgeBg, color:badgeColor, fontSize:9, fontWeight:600, padding:'1px 7px', borderRadius:5 }}>
                              {resultedCount}/{races.length} resulted
                            </span>
                          )}
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', padding:'3px 4px' }}>
                          {races.map(r => {
                            const cls = r.results
                              ? { bg:'#d1fae5', color:'#065f46' }
                              : { bg:'#f1f5f9', color:'#374151' };
                            return (
                              <button
                                key={r.raceNum}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedMeeting(venue); setSelectedRace(Number(r.raceNum)); }}
                                style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 6px', borderRadius:5, margin:2, fontSize:10, fontWeight:600, background:cls.bg, color:cls.color, border:'none', cursor: r.results ? 'pointer' : 'default', fontFamily:'inherit' }}
                              >
                                R{r.raceNum}{r.results ? ' ✓' : ''}
                              </button>
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
