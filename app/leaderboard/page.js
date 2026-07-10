'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsMobile from '@/hooks/useIsMobile';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DK   = '#0d3b2e';
const MONO = 'JetBrains Mono, monospace';

async function fetchScores(start, end) {
  if (!SURL || !SKEY) return [];
  const params = ['select=comp_date,clerk_id,username,correct,total,score,streak'];
  if (start) params.push(`comp_date=gte.${start}`);
  if (end)   params.push(`comp_date=lte.${end}`);
  try {
    const res = await fetch(`${SURL}/rest/v1/comp_scores?${params.join('&')}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

function todayAEST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

function dateMinusDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv-SE');
}

function getDateRange(tab) {
  const today = todayAEST();
  const y = today.slice(0, 4);
  const m = today.slice(0, 7);
  switch (tab) {
    case 'yearly':  return { start: `${y}-01-01`, end: today };
    case 'monthly': return { start: `${m}-01`,    end: today };
    case 'weekly':  return { start: dateMinusDays(today, 6), end: today };
    default:        return { start: null, end: today };
  }
}

function aggregate(rows) {
  const byUser = {};
  for (const r of rows) {
    if (!byUser[r.clerk_id]) {
      byUser[r.clerk_id] = { username: r.username || 'User', score: 0, correct: 0, total: 0, streak: 0, latestDate: '' };
    }
    const u = byUser[r.clerk_id];
    u.score   += r.score;
    u.correct += r.correct;
    u.total   += r.total;
    if (r.comp_date > u.latestDate) {
      u.latestDate = r.comp_date;
      u.streak     = r.streak;
    }
  }
  return Object.entries(byUser)
    .map(([clerk_id, u]) => ({
      clerk_id,
      ...u,
      hitPct: u.total > 0 ? (u.correct / u.total * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score || b.hitPct - a.hitPct);
}

function applyRanks(sorted) {
  let r = 1;
  return sorted.map((u, i) => {
    if (i > 0) {
      const p = sorted[i - 1];
      if (u.score < p.score || (u.score === p.score && u.hitPct < p.hitPct)) r = i + 1;
    }
    return { ...u, rank: r };
  });
}

const TABS = [
  { id: 'alltime', label: 'All-time' },
  { id: 'yearly',  label: 'Yearly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly',  label: 'Weekly' },
];

const MEDAL_BG     = ['#fef9c3', '#f1f5f9', '#fdf4ff'];
const MEDAL_BORDER = ['#fbbf24', '#94a3b8', '#c084fc'];
const MEDAL_ICON   = ['🥇', '🥈', '🥉'];
const RANK_COLOR   = ['#d97706', '#6b7280', '#7c3aed'];

export default function LeaderboardPage() {
  const { user } = useUser();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('alltime');
  const [rows, setRows]           = useState([]);
  const [prevRows, setPrevRows]   = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { start, end } = getDateRange(activeTab);
    const prevEnd = dateMinusDays(end, 7);
    Promise.all([fetchScores(start, end), fetchScores(start, prevEnd)])
      .then(([cur, prev]) => {
        if (!cancelled) { setRows(cur); setPrevRows(prev); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  const ranked    = useMemo(() => applyRanks(aggregate(rows)),     [rows]);
  const prevRanked = useMemo(() => applyRanks(aggregate(prevRows)), [prevRows]);

  const prevRankMap = useMemo(() => {
    const m = {};
    prevRanked.forEach(u => { m[u.clerk_id] = u.rank; });
    return m;
  }, [prevRanked]);

  const myId = user?.id;
  const top3 = ranked.slice(0, 3);

  function mvmt(u) {
    const prev = prevRankMap[u.clerk_id];
    if (prev == null) return null;
    return prev - u.rank; // positive = climbed
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8fafc' }}>

      {/* ── Header band ────────────────────────────────────────────────────── */}
      <div style={{ background: DK, padding: isMobile ? '12px 16px 0' : '16px 28px 0', flexShrink: 0 }}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2 }}>
            Leaderboard
          </h1>
          <div style={{ fontSize: 11, color: '#86baa8', marginTop: 3 }}>
            Daily competition rankings · updated after each race day
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 18px', borderRadius: '7px 7px 0 0', border: 'none',
                cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0,
                background: activeTab === t.id ? '#fff' : '#164a3a',
                color:      activeTab === t.id ? DK     : '#86baa8',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 28px' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9ca3af', fontSize: 13 }}>
            Loading…
          </div>
        )}

        {!loading && ranked.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No competition data yet</div>
            <div style={{ fontSize: 12, color: '#9ca3af', maxWidth: 300 }}>
              Scores are computed after each race day. Check back tomorrow.
            </div>
          </div>
        )}

        {!loading && ranked.length > 0 && (
          <>
            {/* ── Podium ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              {top3.map((u, i) => {
                const isMe = u.clerk_id === myId;
                return (
                  <div key={u.clerk_id}
                    style={{
                      flex: 1, minWidth: isMobile ? 'calc(50% - 5px)' : 140,
                      background: MEDAL_BG[i], border: `1.5px solid ${MEDAL_BORDER[i]}`,
                      borderRadius: 12, padding: '14px 16px', position: 'relative',
                    }}>
                    <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 6 }}>{MEDAL_ICON[i]}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{u.username}</div>
                    {isMe && (
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#1d4ed8', letterSpacing: '0.5px', marginTop: 1 }}>YOU</div>
                    )}
                    <div style={{ fontSize: 30, fontWeight: 800, color: DK, fontFamily: MONO, lineHeight: 1, marginTop: 8 }}>
                      {u.score}
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 5, fontFamily: MONO }}>
                      {u.hitPct.toFixed(1)}% hit · {u.streak > 0 ? `${u.streak}🔥` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Full table ──────────────────────────────────────────────── */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['#', 'Tipster', 'Pts', 'Hit%', 'Streak', '7-day'].map((h, i) => (
                        <th key={h} style={{
                          padding: '8px 12px', fontSize: 9, fontWeight: 700, color: '#6b7280',
                          textAlign: i === 0 ? 'center' : 'left',
                          textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((u, i) => {
                      const isMe = u.clerk_id === myId;
                      const mv   = mvmt(u);
                      return (
                        <tr key={u.clerk_id}
                          style={{ background: isMe ? '#eff6ff' : '#fff', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '9px 12px', textAlign: 'center', width: 40 }}>
                            <span style={{
                              fontSize: 12, fontWeight: 700, fontFamily: MONO,
                              color: u.rank <= 3 ? RANK_COLOR[u.rank - 1] : '#9ca3af',
                            }}>
                              {u.rank}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 12, fontWeight: isMe ? 700 : 500, color: isMe ? '#1d4ed8' : '#111827' }}>
                              {u.username}
                            </span>
                            {isMe && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, color: '#1d4ed8', marginLeft: 6,
                                background: '#dbeafe', padding: '1px 5px', borderRadius: 3,
                              }}>YOU</span>
                            )}
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 13, color: '#111827' }}>
                            {u.score}
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>
                            {u.hitPct.toFixed(1)}%
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: MONO, fontSize: 12, color: '#111827' }}>
                            {u.streak > 0 ? `${u.streak}🔥` : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: MONO }}>
                            {mv === null
                              ? <span style={{ color: '#d1d5db' }}>—</span>
                              : mv > 0
                                ? <span style={{ color: '#16a34a', fontWeight: 700 }}>▲{mv}</span>
                                : mv < 0
                                  ? <span style={{ color: '#dc2626', fontWeight: 700 }}>▼{Math.abs(mv)}</span>
                                  : <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Model benchmark row */}
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>⚡ SP-fav benchmark</span>
                        <span
                          title="Tracks the starting-price favourite as a model-performance proxy. Data accumulates from today forward."
                          style={{ fontSize: 9, color: '#9ca3af', marginLeft: 6, cursor: 'help', textDecoration: 'underline dotted' }}>
                          what&apos;s this?
                        </span>
                      </td>
                      <td colSpan={4} style={{ padding: '9px 12px', fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                        Tracking starts from today — accumulates over coming race days
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
              Tie-break: equal points sorted by hit % descending · Scores recalculated after every race day
            </div>
          </>
        )}
      </div>
    </div>
  );
}
