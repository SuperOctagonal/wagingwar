'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreGroup, getDefaultWeights, GRP_KEYS, calcPaceMap } from '@/lib/scoring';
import { normaliseVenue } from '@/lib/venues';
import ProfileRail from '@/components/ProfileRail';
import UpgradeModal from '@/components/UpgradeModal';
import useIsMobile from '@/hooks/useIsMobile';
import useIsPro from '@/hooks/useIsPro';

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

function normName(n) { return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }

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

function getBarrierFromCSV(allRaces, allVenues, venue, raceNum, horseName) {
  const normV = normaliseVenue(venue);
  for (const keys of Object.values(allVenues)) {
    for (const k of keys) {
      const rc = allRaces[k];
      if (!rc) continue;
      if (normaliseVenue(rc.venue) !== normV) continue;
      if (String(rc.num) !== String(raceNum)) continue;
      const h = (rc.horses || []).find(h => normName(h.name) === normName(horseName));
      if (h) return h.BP ?? h.barrier ?? h.bar ?? null;
    }
  }
  return null;
}

function getSysHorses(allRaces, allVenues, venue, raceNum, dbScratchings = []) {
  const normVenue = normaliseVenue(venue);
  const dbScrNames = new Set(
    dbScratchings
      .filter(r => normaliseVenue(r.venue) === normVenue && String(r.race_num) === String(raceNum))
      .map(r => normName(r.horse_name || ''))
  );
  for (const keys of Object.values(allVenues)) {
    for (const k of keys) {
      const rc = allRaces[k];
      if (!rc) continue;
      if (normaliseVenue(rc.venue) !== normVenue) continue;
      if (String(rc.num) !== String(raceNum)) continue;
      return (rc.horses || []).filter(h => !h.scratched && !dbScrNames.has(normName(h.name || '')));
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

function SidePanel({ icon, label, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 210px)' }}>
      <div style={{ background: '#1e2936', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 11, color: '#fff' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</span>
      </div>
      <div style={{ padding: '0 10px 10px', flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

function NoCsvMsg() {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#6b7280', fontSize: 10 }}>
      <i className="ti ti-upload" style={{ fontSize: 20, display: 'block', marginBottom: 6 }} />
      Load a CSV to enable this analysis
    </div>
  );
}

function placeIcon(place) {
  if (place === 1) return <span style={{ color: '#065f46', fontWeight: 700 }}>1st</span>;
  if (place === 2) return <span style={{ color: '#374151', fontWeight: 700 }}>2nd</span>;
  if (place === 3) return <span style={{ color: '#92400e', fontWeight: 700 }}>3rd</span>;
  return <span style={{ color: '#9ca3af' }}>{place ? `${place}th` : '—'}</span>;
}

function TopPicksPanel({ data }) {
  if (!data) return <NoCsvMsg />;
  const { wins, places, total, roi, strikeRate, placeRate, avgPlace, details } = data;
  const roiPct = total ? (roi / total) * 100 : 0;
  const roiColor = roiPct >= 0 ? '#065f46' : '#991b1b';
  const roiBg = roiPct >= 0 ? '#d1fae5' : '#fee2e2';
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: '#f1f5f9', fontSize: 10 }}>
          <span style={{ color: '#374151' }}>Win </span>
          <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>
            {wins}/{total} ({total ? Math.round(strikeRate * 100) : 0}%)
          </span>
        </div>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: '#f1f5f9', fontSize: 10 }}>
          <span style={{ color: '#374151' }}>Place </span>
          <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>
            {places}/{total} ({total ? Math.round(placeRate * 100) : 0}%)
          </span>
        </div>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: roiBg, fontSize: 10 }}>
          <span style={{ color: '#374151' }}>ROI </span>
          <span style={{ fontWeight: 700, color: roiColor, fontFamily: 'JetBrains Mono, monospace' }}>
            {roiPct >= 0 ? '+' : ''}{roiPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: '#f1f5f9', fontSize: 10 }}>
          <span style={{ color: '#374151' }}>Avg Finish </span>
          <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>
            {avgPlace.toFixed(1)}
          </span>
        </div>
      </div>
      {details.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 10 }}>No model data yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '2px 4px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}>R#</th>
              <th style={{ padding: '2px 4px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}>Top Pick</th>
              <th style={{ padding: '2px 4px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>Finish</th>
              <th style={{ padding: '2px 4px', textAlign: 'right',  fontWeight: 700, color: '#111827' }}>SP</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <tr key={d.raceNum} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                <td style={{ padding: '2px 4px', fontWeight: 700, color: '#111827' }}>{d.raceNum}</td>
                <td style={{ padding: '2px 4px', color: '#111827', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.horse}</td>
                <td style={{ padding: '2px 4px', textAlign: 'center', fontSize: 9 }}>{placeIcon(d.place)}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${Number(d.sp || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 6, fontSize: 8, color: '#9ca3af' }}>Model&apos;s #1 ranked runner each race — actual finish shown</div>
    </div>
  );
}

function ModelPerfPanel({ data }) {
  if (!data) return <NoCsvMsg />;
  const { hits, total, roi, strikeRate, details } = data;
  const roiPct   = total ? (roi / total) * 100 : 0;
  const roiColor = roiPct >= 0 ? '#065f46' : '#991b1b';
  const roiBg    = roiPct >= 0 ? '#d1fae5' : '#fee2e2';
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: '#f1f5f9', fontSize: 10 }}>
          <span style={{ color: '#374151' }}>SR </span>
          <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>
            {hits}/{total} ({total ? Math.round(strikeRate * 100) : 0}%)
          </span>
        </div>
        <div style={{ padding: '3px 6px', borderRadius: 5, background: roiBg, fontSize: 10 }}>
          <span style={{ color: '#374151' }}>ROI </span>
          <span style={{ fontWeight: 700, color: roiColor, fontFamily: 'JetBrains Mono, monospace' }}>
            {roiPct >= 0 ? '+' : ''}{roiPct.toFixed(1)}%
          </span>
        </div>
      </div>
      {details.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 10 }}>No model data yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '2px 4px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}>R#</th>
              <th style={{ padding: '2px 4px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}>Winner</th>
              <th style={{ padding: '2px 4px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>Rank</th>
              <th style={{ padding: '2px 4px', textAlign: 'right',  fontWeight: 700, color: '#111827' }}>SP</th>
              <th style={{ padding: '2px 4px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => {
              const rs = d.rank ? rankStyle(d.rank) : null;
              return (
                <tr key={d.raceNum} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                  <td style={{ padding: '2px 4px', fontWeight: 700, color: '#111827' }}>{d.raceNum}</td>
                  <td style={{ padding: '2px 4px', color: '#111827', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.horse}</td>
                  <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                    {rs
                      ? <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: rs.bg, color: rs.color }}>#{d.rank}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '2px 4px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${Number(d.sp || 0).toFixed(2)}</td>
                  <td style={{ padding: '2px 4px', textAlign: 'center', color: d.hit ? '#065f46' : '#9ca3af' }}>{d.hit ? '✓' : '✗'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 6, fontSize: 8, color: '#9ca3af' }}>$1 on rank 1 each race at SP</div>
    </div>
  );
}

function BarrierPanel({ data, hasCsv }) {
  if (!hasCsv) return <NoCsvMsg />;
  if (!data || data.every(g => g.total === 0)) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#6b7280', fontSize: 10 }}>
        No barrier data — ensure CSV includes a barrier field.
      </div>
    );
  }
  const maxPct = Math.max(...data.map(g => g.total ? g.wins / g.total : 0), 0.001);
  return (
    <div style={{ paddingTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '3px 5px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}>Gate</th>
            <th style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>W</th>
            <th style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>R</th>
            <th style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>%</th>
            <th style={{ padding: '3px 5px', textAlign: 'left',   fontWeight: 700, color: '#111827' }}></th>
          </tr>
        </thead>
        <tbody>
          {data.map(g => {
            const pct  = g.total ? g.wins / g.total : 0;
            const barW = maxPct > 0 ? Math.round((pct / maxPct) * 72) : 0;
            return (
              <tr key={g.label} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                <td style={{ padding: '3px 5px', fontWeight: 700, color: '#111827' }}>{g.label}</td>
                <td style={{ padding: '3px 5px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', color: '#111827' }}>{g.wins}</td>
                <td style={{ padding: '3px 5px', textAlign: 'center', color: '#111827' }}>{g.total}</td>
                <td style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#111827' }}>
                  {g.total ? Math.round(pct * 100) : 0}%
                </td>
                <td style={{ padding: '3px 5px' }}>
                  <div style={{ height: 8, width: barW, background: '#1e2936', borderRadius: 2, minWidth: pct > 0 ? 2 : 0 }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UpsetsPanel({ data, hasCsv }) {
  if (!hasCsv) return <NoCsvMsg />;
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#6b7280', fontSize: 10 }}>
        No model data yet.
      </div>
    );
  }
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 9, color: '#6b7280', paddingBottom: 4, lineHeight: 1.4 }}>Winners our model ranked lower than 1st — a bigger rank gap = a bigger upset.</div>
      {data.map((u, i) => (
        <div key={`${u.raceNum}-${u.horse}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#f8fafc', borderRadius: 5, border: '0.5px solid #e5e7eb' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{medals[i]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.horse}</div>
            <div style={{ fontSize: 9, color: '#111827', marginTop: 1 }}>R{u.raceNum} · rank #{u.rank} · ${Number(u.sp || 0).toFixed(2)}</div>
          </div>
          <div style={{ padding: '1px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
            #{u.rank}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffPanel({ data }) {
  const { trainers, jockeys } = data;
  if (!trainers.length && !jockeys.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#6b7280', fontSize: 10 }}>
        No winner data yet.
      </div>
    );
  }
  return (
    <div style={{ paddingTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {trainers.length > 0 && (
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Trainers</div>
          {trainers.map(([name, wins, runs]) => {
            const pct = runs > 0 ? Math.round(wins / runs * 100) : 0;
            return (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '0.5px solid #f3f4f6', fontSize: 10 }}>
                <span style={{ color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>{name}</span>
                <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{wins}W / {runs}R ({pct}%)</span>
              </div>
            );
          })}
        </div>
      )}
      {jockeys.length > 0 && (
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Jockeys</div>
          {jockeys.map(([name, wins, runs]) => {
            const pct = runs > 0 ? Math.round(wins / runs * 100) : 0;
            return (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '0.5px solid #f3f4f6', fontSize: 10 }}>
                <span style={{ color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>{name}</span>
                <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{wins}W / {runs}R ({pct}%)</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeightClassPanel({ data }) {
  if (!data) return <NoCsvMsg />;
  const fmt = v => v != null ? (+v).toFixed(1) : '—';
  return (
    <div style={{ overflowY:'auto', flex:1, padding:'8px 10px' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
            <th style={{ padding:'3px 4px', textAlign:'left', color:'#6b7280', fontWeight:600, fontSize:9 }}>R</th>
            <th style={{ padding:'3px 4px', textAlign:'left', color:'#6b7280', fontWeight:600, fontSize:9 }}>Winner</th>
            <th style={{ padding:'3px 4px', textAlign:'right', color:'#6b7280', fontWeight:600, fontSize:9 }}>Wt</th>
            <th style={{ padding:'3px 4px', textAlign:'right', color:'#6b7280', fontWeight:600, fontSize:9 }}>Avg</th>
            <th style={{ padding:'3px 4px', textAlign:'right', color:'#6b7280', fontWeight:600, fontSize:9 }}>Rtg</th>
            <th style={{ padding:'3px 4px', textAlign:'right', color:'#6b7280', fontWeight:600, fontSize:9 }}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => {
            const dWt  = row.winnerWeight != null && row.fieldAvgWeight != null ? +row.winnerWeight - row.fieldAvgWeight : null;
            const dRtg = row.winnerWrat  != null && row.fieldAvgWrat  != null ? +row.winnerWrat  - row.fieldAvgWrat  : null;
            return (
              <tr key={row.raceNum} style={{ borderBottom:'0.5px solid #f3f4f6' }}>
                <td style={{ padding:'4px 4px', color:'#111827', fontWeight:700 }}>R{row.raceNum}</td>
                <td style={{ padding:'4px 4px', color:'#111827', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.winner}</td>
                <td style={{ padding:'4px 4px', textAlign:'right', color:'#111827' }}>
                  {fmt(row.winnerWeight)}
                  {dWt != null && <span style={{ fontSize:8, marginLeft:2, color: dWt <= 0 ? '#16a34a' : '#dc2626' }}>{dWt > 0 ? '+' : ''}{dWt.toFixed(1)}</span>}
                </td>
                <td style={{ padding:'4px 4px', textAlign:'right', color:'#6b7280' }}>{fmt(row.fieldAvgWeight)}</td>
                <td style={{ padding:'4px 4px', textAlign:'right', color:'#111827' }}>
                  {fmt(row.winnerWrat)}
                  {dRtg != null && <span style={{ fontSize:8, marginLeft:2, color: dRtg >= 0 ? '#16a34a' : '#dc2626' }}>{dRtg > 0 ? '+' : ''}{dRtg.toFixed(1)}</span>}
                </td>
                <td style={{ padding:'4px 4px', textAlign:'right', color:'#6b7280' }}>{fmt(row.fieldAvgWrat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize:9, color:'#9ca3af', paddingTop:6, lineHeight:1.4 }}>Wt = carried weight (kg). Rtg = speed rating. Δ shown vs field average.</div>
    </div>
  );
}

const PACE_COLORS = { Leader:'#00b050', Presser:'#7ec820', Midfield:'#ffc000', Closer:'#ff8000', Backmarker:'#dc3545' };

function TrackBiasPanel({ data }) {
  if (!data) return <NoCsvMsg />;
  const rows = Object.entries(data);
  const maxTotal = Math.max(...rows.map(([, v]) => v.total), 1);
  const hasData = rows.some(([, v]) => v.total > 0);
  if (!hasData) return (
    <div style={{ padding:'24px 10px', textAlign:'center', color:'#6b7280', fontSize:10 }}>No pace data for this meeting yet.</div>
  );
  return (
    <div style={{ overflowY:'auto', flex:1, padding:'8px 10px' }}>
      {rows.map(([role, { wins, total }]) => {
        const pct = total > 0 ? Math.round(wins / total * 100) : 0;
        const barW = total > 0 ? Math.round(total / maxTotal * 100) : 0;
        const color = PACE_COLORS[role] || '#374151';
        return (
          <div key={role} style={{ marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }} />
                <span style={{ fontSize:10, color:'#111827', fontWeight:600 }}>{role}</span>
              </div>
              <div style={{ display:'flex', gap:10, fontSize:10, color:'#111827' }}>
                <span style={{ minWidth:18, textAlign:'right', fontWeight:700 }}>{wins}W</span>
                <span style={{ minWidth:22, textAlign:'right' }}>{total}R</span>
                <span style={{ minWidth:28, textAlign:'right', fontWeight:700 }}>{pct}%</span>
              </div>
            </div>
            <div style={{ background:'#f3f4f6', borderRadius:3, height:6, overflow:'hidden' }}>
              <div style={{ width:`${barW}%`, height:'100%', background:color, borderRadius:3, transition:'width .3s' }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize:9, color:'#9ca3af', paddingTop:4, lineHeight:1.4 }}>Pace role from early speed data. Today&apos;s meeting only.</div>
    </div>
  );
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
                <td style={{ padding:pad, whiteSpace:'nowrap', fontSize:11, color:'#111827' }}>{r.trainer || '—'}</td>
                <td style={{ padding:pad, whiteSpace:'nowrap', fontSize:11, color:'#111827' }}>{r.jockey || '—'}</td>
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
  const { user } = useUser();
  const isPro = useIsPro();
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
  const [sidePanel, setSidePanel] = useState('model');
  const [cardRows, setCardRows] = useState([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const todayAEST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const isToday = selectedDate === todayAEST;
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
    setSidePanel('model');
    setVenueAbandoned(new Set());
    setCardRows([]);
    setUpgradeOpen(false);
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
    const todayCheck = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
    const cardFetch = user?.id && selectedDate !== todayCheck
      ? fetch(`/api/race-cards?date=${selectedDate}`).then(r => {
          if (r.status === 403) { setUpgradeOpen(true); return []; }
          return r.ok ? r.json() : [];
        })
      : Promise.resolve([]);
    Promise.all([fetchResultsForDate(selectedDate), scrFetch, abandonedFetch, cardFetch]).then(([rows, scrRows, abandoned, cards]) => {
      setDbRows(rows || []);
      setDbScratchings(scrRows || []);
      setVenueAbandoned(abandoned);
      setCardRows(cards || []);
      setLoading(false);
    });
  }, [selectedDate, user?.id]);

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
        barrier: row.barrier ?? null,
      });
    });
    (dbScratchings || []).forEach(row => {
      const key = `${normaliseVenue(row.venue)}||${row.race_num}`;
      if (g[key] && row.horse_name) g[key].scratched.push(row.horse_name);
    });
    Object.values(g).forEach(x => x.runners.sort((a, b) => a.place - b.place));
    return g;
  }, [dbRows, dbScratchings]);

  const cardRaceData = useMemo(() => {
    if (!cardRows.length) return { allRaces: {}, allVenues: {} };
    const ar = {}, av = {};
    cardRows.forEach(row => {
      const key = `${row.venue}_R${row.race_num}`;
      if (!ar[key]) ar[key] = { venue: row.venue, num: row.race_num, horses: [] };
      if (row.form_data) ar[key].horses.push(row.form_data);
      if (!av[row.venue]) av[row.venue] = [];
      if (!av[row.venue].includes(key)) av[row.venue].push(key);
    });
    return { allRaces: ar, allVenues: av };
  }, [cardRows]);

  const effectiveRaces  = useMemo(() => isToday ? allRaces  : cardRaceData.allRaces,  [isToday, allRaces,  cardRaceData]);
  const effectiveVenues = useMemo(() => isToday ? allVenues : cardRaceData.allVenues, [isToday, allVenues, cardRaceData]);

  const meetings = useMemo(() => {
    const m = {};
    Object.values(grouped).forEach(res => {
      const v = res.venue;
      if (!m[v]) m[v] = [];
      if (!m[v].find(r => r.raceNum === res.raceNum)) {
        m[v].push({ raceNum: res.raceNum, results: res });
      }
    });
    // Only merge CSV-derived unresulted races when viewing today's card
    if (isToday) {
      Object.values(allVenues).flat().forEach(k => {
        const rc = allRaces[k];
        if (!rc) return;
        const v = normaliseVenue(rc.venue);
        if (!m[v]) m[v] = [];
        if (!m[v].find(r => String(r.raceNum) === String(rc.num))) {
          m[v].push({ raceNum: rc.num, results: null });
        }
      });
    }
    Object.values(m).forEach(arr => arr.sort((a, b) => a.raceNum - b.raceNum));
    return m;
  }, [grouped, allRaces, allVenues, isToday]);

  const venueNames = Object.keys(meetings);
  const meetingRaces = selectedMeeting ? (meetings[selectedMeeting] || []) : [];

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

  const hasCsv = Object.keys(effectiveRaces).length > 0;

  const meetingResulted = useMemo(() => {
    if (!selectedMeeting) return [];
    return (meetings[selectedMeeting] || []).filter(r => r.results && r.results.runners && r.results.runners.length > 0);
  }, [meetings, selectedMeeting]);

  const modelPerf = useMemo(() => {
    if (!hasCsv || !meetingResulted.length) return null;
    let hits = 0, total = 0, roi = 0;
    const details = [];
    meetingResulted.forEach(({ raceNum, results }) => {
      const rankMap = getSysRanks(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, weights, dbScratchings) || {};
      if (!Object.keys(rankMap).length) return;
      const winner = (results.runners || []).find(r => r.place === 1);
      if (!winner) return;
      const rank = rankMap[normName(winner.name)] ?? null;
      const hit  = rank === 1;
      roi += hit ? (Number(winner.sp) - 1) : -1;
      if (hit) hits++;
      total++;
      details.push({ raceNum, horse: winner.name, rank, sp: winner.sp, hit });
    });
    if (total === 0) return null;
    return { hits, total, roi, strikeRate: hits / total, details };
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, weights, dbScratchings, hasCsv]);

  const topPicksPerf = useMemo(() => {
    if (!hasCsv || !meetingResulted.length) return null;
    let wins = 0, places = 0, total = 0, roi = 0;
    const details = [];
    meetingResulted.forEach(({ raceNum, results }) => {
      const rankMap = getSysRanks(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, weights, dbScratchings) || {};
      if (!Object.keys(rankMap).length) return;
      const pickName = Object.keys(rankMap).find(n => rankMap[n] === 1);
      if (!pickName) return;
      const runner = (results.runners || []).find(r => normName(r.name) === pickName);
      if (!runner) return;
      const place = runner.place ?? null;
      const sp = Number(runner.sp) || 0;
      const win = place === 1;
      const placed = place != null && place <= 3;
      roi += win ? (sp - 1) : -1;
      if (win) wins++;
      if (placed) places++;
      total++;
      details.push({ raceNum, horse: runner.name, place, sp, win, placed });
    });
    if (total === 0) return null;
    const avgPlace = details.reduce((a, d) => a + (d.place || 0), 0) / total;
    return { wins, places, total, roi, strikeRate: wins / total, placeRate: places / total, avgPlace, details };
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, weights, dbScratchings, hasCsv]);

  const barrierBias = useMemo(() => {
    const groups = [
      { label: '1–2', min: 1, max: 2,        wins: 0, total: 0 },
      { label: '3–4', min: 3, max: 4,        wins: 0, total: 0 },
      { label: '5–6', min: 5, max: 6,        wins: 0, total: 0 },
      { label: '7–8', min: 7, max: 8,        wins: 0, total: 0 },
      { label: '9+',  min: 9, max: Infinity, wins: 0, total: 0 },
    ];
    meetingResulted.forEach(({ raceNum, results }) => {
      (results.runners || []).forEach(runner => {
        let bar = runner.barrier;
        if (bar == null && hasCsv) {
          bar = getBarrierFromCSV(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, runner.name);
        }
        if (bar == null || bar <= 0) return;
        const g = groups.find(c => bar >= c.min && bar <= c.max);
        if (!g) return;
        g.total++;
        if (runner.place === 1) g.wins++;
      });
    });
    return groups;
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, hasCsv]);

  const biggestUpsets = useMemo(() => {
    if (!hasCsv) return [];
    const upsets = [];
    meetingResulted.forEach(({ raceNum, results }) => {
      const rankMap = getSysRanks(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, weights, dbScratchings) || {};
      if (!Object.keys(rankMap).length) return;
      const winner = (results.runners || []).find(r => r.place === 1);
      if (!winner) return;
      const rank = rankMap[normName(winner.name)];
      if (!rank) return;
      upsets.push({ raceNum, horse: winner.name, rank, sp: winner.sp });
    });
    upsets.sort((a, b) => (b.rank || 0) - (a.rank || 0));
    return upsets.slice(0, 3);
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, weights, dbScratchings, hasCsv]);

  const staffForm = useMemo(() => {
    const tWins = {}, jWins = {}, tRuns = {}, jRuns = {};
    meetingResulted.forEach(({ results }) => {
      (results.runners || []).forEach(runner => {
        if (runner.trainer) {
          tRuns[runner.trainer] = (tRuns[runner.trainer] || 0) + 1;
          if (runner.place === 1) tWins[runner.trainer] = (tWins[runner.trainer] || 0) + 1;
        }
        if (runner.jockey) {
          jRuns[runner.jockey] = (jRuns[runner.jockey] || 0) + 1;
          if (runner.place === 1) jWins[runner.jockey] = (jWins[runner.jockey] || 0) + 1;
        }
      });
    });
    return {
      trainers: Object.entries(tWins).sort((a, b) => b[1] - a[1]).map(([n, w]) => [n, w, tRuns[n] || 0]),
      jockeys:  Object.entries(jWins).sort((a, b) => b[1] - a[1]).map(([n, w]) => [n, w, jRuns[n] || 0]),
    };
  }, [meetingResulted]);

  const weightClass = useMemo(() => {
    if (!hasCsv) return null;
    const rows = [];
    meetingResulted.forEach(({ raceNum, results }) => {
      const horses = getSysHorses(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, dbScratchings);
      if (!horses || !horses.length) return;
      const winner = (results.runners || []).find(r => r.place === 1);
      if (!winner) return;
      const wh = horses.find(h => normName(h.name) === normName(winner.name));
      const allW = horses.map(h => h['Weight']).filter(v => v != null && !isNaN(+v));
      const allR = horses.map(h => h['Wrat']).filter(v => v != null && !isNaN(+v));
      rows.push({
        raceNum,
        winner: winner.name,
        winnerWeight:   wh?.['Weight'] ?? null,
        fieldAvgWeight: allW.length ? allW.reduce((a, b) => a + (+b), 0) / allW.length : null,
        winnerWrat:     wh?.['Wrat'] ?? null,
        fieldAvgWrat:   allR.length ? allR.reduce((a, b) => a + (+b), 0) / allR.length : null,
      });
    });
    return rows.length ? rows : null;
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, dbScratchings, hasCsv]);

  const trackBias = useMemo(() => {
    if (!hasCsv) return null;
    const roles = { Leader: { wins:0, total:0 }, Presser: { wins:0, total:0 }, Midfield: { wins:0, total:0 }, Closer: { wins:0, total:0 }, Backmarker: { wins:0, total:0 } };
    meetingResulted.forEach(({ raceNum, results }) => {
      const horses = getSysHorses(effectiveRaces, effectiveVenues, selectedMeeting, raceNum, dbScratchings);
      if (!horses || !horses.length) return;
      const dist = parseInt(results.dist, 10) || 0;
      const tc   = results.trackCond || 'good';
      (results.runners || []).forEach(runner => {
        const fh = horses.find(h => normName(h.name) === normName(runner.name));
        if (!fh) return;
        const { role } = calcPaceMap(fh, selectedMeeting, dist, tc);
        if (!roles[role]) return;
        roles[role].total++;
        if (runner.place === 1) roles[role].wins++;
      });
    });
    return roles;
  }, [meetingResulted, effectiveRaces, effectiveVenues, selectedMeeting, dbScratchings, hasCsv]);

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
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 }}>
              {meetingRaces.map(r => {
                const resulted = !!r.results;
                const isActive = selectedRace != null && Number(r.raceNum) === Number(selectedRace);
                const bg     = isActive ? '#1e2936' : resulted ? '#d1fae5' : '#f1f5f9';
                const color  = isActive ? '#fff'    : resulted ? '#065f46' : '#374151';
                const border = isActive ? '#1e2936' : resulted ? '#86efac' : '#e5e7eb';
                return (
                  <button
                    key={r.raceNum}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedRace(Number(r.raceNum)); }}
                    style={{ padding:'8px 12px', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', background:bg, color, border:`0.5px solid ${border}`, fontFamily:'inherit' }}
                  >
                    R{r.raceNum}{resulted ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>

            {/* Two-column body: results left, analysis right */}
            <div style={{ display:'flex', gap:10, alignItems:'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>

              {/* Left — race results */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ overflowX:'auto' }}>
                  <ResultsDetail
                    meeting={activeRaceData}
                    venue={selectedMeeting}
                    allRaces={effectiveRaces}
                    allVenues={effectiveVenues}
                    weights={weights}
                    dbScratchings={dbScratchings}
                  />
                </div>
              </div>

              {/* Right — analysis panels (pill-switched) */}
              <div style={{ width:300, flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {[
                    { key:'model',   label:'Model',    icon:'ti-chart-bar'      },
                    { key:'barrier', label:'Barriers',  icon:'ti-layout-columns' },
                    { key:'upsets',  label:'Upsets',    icon:'ti-bolt'           },
                    { key:'staff',   label:'T/J',       icon:'ti-users'          },
                    { key:'weight',  label:'Wt/Cls',    icon:'ti-scale'          },
                    { key:'bias',    label:'Pace Bias', icon:'ti-trending-up'    },
                    { key:'picks',   label:'Top Picks', icon:'ti-target'          },
                  ].map(p => {
                    const active = sidePanel === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSidePanel(p.key)}
                        style={{ display:'flex', alignItems:'center', gap:3, padding:'8px 12px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:'0.5px solid', background: active ? '#1e2936' : '#fff', color: active ? '#fff' : '#374151', borderColor: active ? '#1e2936' : '#e5e7eb' }}
                      >
                        <i className={`ti ${p.icon}`} style={{ fontSize:10 }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {sidePanel === 'model'   && <SidePanel icon="ti-chart-bar"      label="Model"><ModelPerfPanel data={modelPerf} /></SidePanel>}
                {sidePanel === 'barrier' && <SidePanel icon="ti-layout-columns" label="Barriers"><BarrierPanel data={barrierBias} hasCsv={hasCsv} /></SidePanel>}
                {sidePanel === 'upsets'  && <SidePanel icon="ti-bolt"           label="Upsets"><UpsetsPanel data={biggestUpsets} hasCsv={hasCsv} /></SidePanel>}
                {sidePanel === 'staff'   && <SidePanel icon="ti-users"          label="Trainer / Jockey"><StaffPanel data={staffForm} /></SidePanel>}
                {sidePanel === 'weight'  && <SidePanel icon="ti-scale"          label="Weight & Class"><WeightClassPanel data={weightClass} /></SidePanel>}
                {sidePanel === 'bias'    && <SidePanel icon="ti-trending-up"    label="Pace Bias"><TrackBiasPanel data={trackBias} /></SidePanel>}
                {sidePanel === 'picks'  && <SidePanel icon="ti-target"          label="Top Picks"><TopPicksPanel data={topPicksPerf} /></SidePanel>}
              </div>

            </div>
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
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}
