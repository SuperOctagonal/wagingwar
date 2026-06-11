'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const G  = '#1D9E75';
const DG = '#1B4332';
const R  = '#E24B4A';

// ─── helpers ──────────────────────────────────────────────────────────────────

function groupBy(bets, fn) {
  const m = {};
  for (const b of bets) {
    const k = fn(b);
    if (k == null) continue;
    if (!m[k]) m[k] = [];
    m[k].push(b);
  }
  return m;
}

function gStats(bets) {
  if (!bets.length) return { bets: 0, wins: 0, strike: 0, staked: 0, ret: 0, pl: 0, roi: null };
  const wins   = bets.filter(b => (b.return_amt || 0) > (b.stake || 0)).length;
  const staked = bets.reduce((s, b) => s + (b.stake || 0), 0);
  const ret    = bets.reduce((s, b) => s + (b.return_amt || 0), 0);
  const pl     = ret - staked;
  return { bets: bets.length, wins, strike: wins / bets.length * 100, staked, ret, pl, roi: staked > 0 ? pl / staked * 100 : null };
}

function oddsRange(o) {
  if (o == null) return null;
  if (o < 2)    return '$1–$2';
  if (o < 3.5)  return '$2–$3.50';
  if (o < 6)    return '$3.50–$6';
  if (o < 10)   return '$6–$10';
  if (o < 20)   return '$10–$20';
  return '$20+';
}

const ODDS_ORDER  = ['$1–$2','$2–$3.50','$3.50–$6','$6–$10','$10–$20','$20+'];
const ODDS_GROUPS = ['Low ($1–$3.50)', 'Mid ($3.50–$10)', 'High ($10+)'];
const RANK_GROUPS = ['1', '2', '3+'];
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function calcAll(settled) {
  if (!settled.length) return null;
  const totalBets   = settled.length;
  const wins        = settled.filter(b => (b.return_amt || 0) > (b.stake || 0));
  const totalWins   = wins.length;
  const strikeRate  = totalWins / totalBets * 100;
  const totalStaked = settled.reduce((s, b) => s + (b.stake || 0), 0);
  const totalReturn = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
  const totalPL     = totalReturn - totalStaked;
  const roi         = totalStaked > 0 ? totalPL / totalStaked * 100 : 0;
  const avgOdds     = settled.reduce((s, b) => s + (b.odds || 0), 0) / totalBets;
  const avgStake    = totalStaked / totalBets;
  const unitsPL     = avgStake > 0 ? totalPL / avgStake : 0;

  const clvBets = settled.filter(b => b.live_odds != null && b.odds != null);
  const clv     = clvBets.length > 0
    ? clvBets.reduce((s, b) => s + (b.odds - b.live_odds), 0) / clvBets.length
    : null;

  // current streak (most-recent first)
  const byDate = [...settled].sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
  let streak = 0, streakType = null;
  for (const b of byDate) {
    const w = (b.return_amt || 0) > (b.stake || 0);
    if (streakType === null) { streakType = w ? 'W' : 'L'; streak = 1; }
    else if ((w && streakType === 'W') || (!w && streakType === 'L')) streak++;
    else break;
  }

  // worst drawdown
  const asc = [...byDate].reverse();
  let maxDD = 0, curDD = 0;
  for (const b of asc) {
    if ((b.return_amt || 0) <= (b.stake || 0)) { curDD++; maxDD = Math.max(maxDD, curDD); }
    else curDD = 0;
  }

  return { totalBets, totalWins, strikeRate, totalStaked, totalReturn, totalPL, roi, avgOdds, avgStake, unitsPL, clv, streak, streakType, worstDD: maxDD };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, val, color, sub, tooltip }) {
  return (
    <div title={tooltip || ''} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 10px', cursor: tooltip ? 'help' : 'default' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || '#111827', lineHeight: 1, marginBottom: 3 }}>{val}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BreakdownTable({ rows, isMobile }) {
  if (!rows.length) return <div style={{ padding: '20px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>No data</div>;
  const bestROI = Math.max(...rows.map(r => r.roi ?? -Infinity));

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
        {rows.map(r => (
          <div key={r.cat} style={{ background: r.roi === bestROI && r.roi != null ? '#f0fdf4' : '#f9fafb', borderRadius: 8, padding: '10px 12px', borderLeft: r.roi === bestROI && r.roi != null ? `3px solid ${G}` : '3px solid transparent' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{r.cat}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 6px' }}>
              {[
                { label: 'Bets',   val: String(r.bets),                                                                           color: '#374151' },
                { label: 'Wins',   val: String(r.wins),                                                                           color: '#374151' },
                { label: 'Strike', val: r.bets > 0 ? r.strike.toFixed(1) + '%' : '—',                                            color: '#374151' },
                { label: 'Staked', val: `$${r.staked.toFixed(0)}`,                                                                color: '#374151' },
                { label: 'P&L',    val: `${r.pl >= 0 ? '+' : ''}$${r.pl.toFixed(2)}`,                                            color: r.pl >= 0 ? '#059669' : R },
                { label: 'ROI',    val: r.roi != null ? `${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(1)}%` : '—',                    color: r.roi != null ? (r.roi >= 0 ? '#059669' : R) : '#9ca3af' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{item.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const th = { fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', padding: '0 8px 8px', textAlign: 'right', letterSpacing: '0.4px', whiteSpace: 'nowrap' };
  const td = { fontSize: 11, padding: '7px 8px', textAlign: 'right', color: '#374151' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Category</th>
            <th style={th}>Bets</th>
            <th style={th}>Wins</th>
            <th style={th}>Strike%</th>
            <th style={th}>Staked</th>
            <th style={th}>P&amp;L</th>
            <th style={th}>ROI%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.cat} style={{ borderLeft: r.roi === bestROI && r.roi != null ? `3px solid ${G}` : '3px solid transparent', background: r.roi === bestROI && r.roi != null ? '#f0fdf4' : 'transparent', borderBottom: '0.5px solid #f3f4f6' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.cat}</td>
              <td style={td}>{r.bets}</td>
              <td style={td}>{r.wins}</td>
              <td style={td}>{r.bets > 0 ? r.strike.toFixed(1) + '%' : '—'}</td>
              <td style={td}>${r.staked.toFixed(0)}</td>
              <td style={{ ...td, color: r.pl >= 0 ? '#059669' : R, fontWeight: 700 }}>{r.pl >= 0 ? '+' : ''}${r.pl.toFixed(2)}</td>
              <td style={{ ...td, color: r.roi != null ? (r.roi >= 0 ? '#059669' : R) : '#9ca3af', fontWeight: 700 }}>{r.roi != null ? `${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(1)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { user } = useUser();
  const userId   = user?.id || null;
  const isPro    = useIsPro();
  const isMobile = useIsMobile();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [allBets,     setAllBets]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('rank');

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    if (!SURL || !SKEY) { setLoading(false); return; }
    fetch(`${SURL}/rest/v1/bet_log?select=*&user_id=eq.${userId}&order=date.asc`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setAllBets(d || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  // ── gate ──────────────────────────────────────────────────────────────────

  if (isPro === false) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProfileRail />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <i className="ti ti-lock" style={{ fontSize: 48, color: '#d1d5db', display: 'block', marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Insights is a Pro feature</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Unlock win rate, ROI analytics, and performance breakdowns.</div>
            <button onClick={() => setUpgradeOpen(true)} style={{ padding: '10px 24px', background: DG, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Start free trial
            </button>
          </div>
        </main>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </div>
    );
  }

  // ── derive data ───────────────────────────────────────────────────────────

  const settledBets = allBets.filter(b => b.status === 'settled' || b.return_amt != null);
  const pendingBets = allBets.filter(b => b.status === 'pending'  && b.return_amt == null);
  const m = calcAll(settledBets);

  // bankroll curve
  const bankrollData = (() => {
    let cum = 0;
    return settledBets.map((b, i) => {
      cum += (b.return_amt || 0) - (b.stake || 0);
      return { i: i + 1, pl: +cum.toFixed(2) };
    });
  })();

  // breakdowns
  const byRankGrp = groupBy(settledBets, b => b.rank != null ? String(b.rank) : null);
  const byOddsGrp = groupBy(settledBets, b => oddsRange(b.odds));
  const byCondGrp = groupBy(settledBets, b => b.track_condition || null);
  const byBookGrp = groupBy(settledBets, b => b.bookmaker || null);

  const rankRows = Object.entries(byRankGrp).map(([c, b]) => ({ cat: c, ...gStats(b) })).sort((a, b) => +a.cat - +b.cat);
  const oddsRows = ODDS_ORDER.filter(k => byOddsGrp[k]).map(k => ({ cat: k, ...gStats(byOddsGrp[k]) }));
  const condRows = Object.entries(byCondGrp).map(([c, b]) => ({ cat: c, ...gStats(b) })).sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
  const bookRows = Object.entries(byBookGrp).map(([c, b]) => ({ cat: c, ...gStats(b) })).sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));

  const tabRows = { rank: rankRows, odds: oddsRows, cond: condRows, book: bookRows };

  // heatmap
  const heatmap = RANK_GROUPS.map(rg => ({
    rank: rg,
    cells: ODDS_GROUPS.map(og => {
      const bets = settledBets.filter(b => {
        const rankMatch = rg === '3+' ? (b.rank == null || +b.rank >= 3) : String(b.rank) === rg;
        const oddsMatch = og === 'Low ($1–$3.50)'  ? b.odds < 3.5
                        : og === 'Mid ($3.50–$10)' ? (b.odds >= 3.5 && b.odds < 10)
                        : b.odds >= 10;
        return rankMatch && oddsMatch;
      });
      return { label: og, ...gStats(bets) };
    }),
  }));

  // model accuracy
  const rank1Bets  = settledBets.filter(b => +b.rank === 1);
  const rank1St    = gStats(rank1Bets);
  const valueBets  = settledBets.filter(b => b.odds != null && b.my_odds != null && b.odds > b.my_odds);
  const nValueBets = settledBets.filter(b => b.odds != null && b.my_odds != null && b.odds <= b.my_odds);
  const valueSt    = gStats(valueBets);
  const nValueSt   = gStats(nValueBets);
  const clvBets    = settledBets.filter(b => b.live_odds != null);
  const posClvPct  = clvBets.length > 0 ? clvBets.filter(b => b.odds > b.live_odds).length / clvBets.length * 100 : null;

  const rankBarData = rankRows.slice(0, 8).map(r => ({ name: `R${r.cat}`, roi: r.roi != null ? +r.roi.toFixed(1) : 0 }));

  // alerts
  const alerts = [];
  if (m) {
    if (m.streak >= 5 && m.streakType === 'L')
      alerts.push({ type: 'red', msg: `🔴 You've had ${m.streak} consecutive losses — consider reducing stakes or taking a break` });
    const badCond = condRows.find(r => r.roi != null && r.roi < -20 && r.bets >= 5);
    if (badCond)
      alerts.push({ type: 'amber', msg: `⚠️ Avoid ${badCond.cat} tracks — your ROI is ${badCond.roi.toFixed(1)}% from ${badCond.bets} bets` });
    if (bookRows[0]?.roi != null && bookRows[0].roi > 0)
      alerts.push({ type: 'green', msg: `✅ ${bookRows[0].cat} is your most profitable bookie (+${bookRows[0].roi.toFixed(1)}% ROI)` });
    const satSt = gStats(settledBets.filter(b => b.date && new Date(b.date).getDay() === 6));
    const wdSt  = gStats(settledBets.filter(b => b.date && [1,2,3,4,5].includes(new Date(b.date).getDay())));
    if (satSt.bets >= 5 && satSt.roi != null && wdSt.roi != null && satSt.roi > wdSt.roi + 10)
      alerts.push({ type: 'green', msg: `✅ Saturday meetings suit your style — ${satSt.roi.toFixed(1)}% ROI vs ${wdSt.roi.toFixed(1)}% weekday` });
    if (m.clv != null)
      alerts.push(m.clv > 0
        ? { type: 'green', msg: `✅ You're consistently beating the market price — your selections have genuine edge` }
        : { type: 'amber', msg: `⚠️ You're paying above market price on average — shop for better odds` });
    if (settledBets.length < 100)
      alerts.push({ type: 'info', msg: `📊 Keep logging — your data becomes statistically meaningful at 100+ bets (${settledBets.length} so far)` });
  }

  // variance
  const expectedWins = settledBets.reduce((s, b) => s + (b.odds > 0 ? 1 / b.odds : 0), 0);
  const actualWins   = m?.totalWins || 0;
  const winDiff      = actualWins - expectedWins;
  const maxBar       = Math.max(expectedWins, actualWins) * 1.15 || 1;

  // best rank highlight
  const bestRankRow = [...rankRows].sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999))[0];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>

        {/* page header */}
        <div style={{ padding: '16px 20px 0', maxWidth: 980, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Insights</h1>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {allBets.length} bets · {settledBets.length} settled · {pendingBets.length} pending
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 13 }}>Loading…</div>
        ) : !settledBets.length ? (
          <div style={{ maxWidth: 980, margin: '32px auto', padding: '0 20px' }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 8 }}>No settled bets yet</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Start logging bets from the Races page, then settle them in My Bets.</div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '14px 20px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── S1: Performance snapshot ─────────────────────────────── */}
            <div style={{ background: DG, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14 }}>
                Performance Snapshot
              </div>
              <div className="insights-snapshot" style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6 }}>
                {[
                  { label: 'Total P&L',   val: m ? `${m.totalPL >= 0 ? '+' : '−'}$${Math.abs(m.totalPL).toFixed(2)}` : '—',  color: m ? (m.totalPL >= 0 ? '#6ee7b7' : '#fca5a5') : '#fff' },
                  { label: 'ROI',         val: m ? `${m.roi >= 0 ? '+' : ''}${m.roi.toFixed(1)}%` : '—',                       color: m ? (m.roi >= 0 ? '#6ee7b7' : '#fca5a5') : '#fff' },
                  { label: 'Strike Rate', val: m ? `${m.strikeRate.toFixed(1)}%` : '—',                                         color: '#fff' },
                  { label: 'Avg Odds',    val: m ? `$${m.avgOdds.toFixed(2)}` : '—',                                            color: '#fff' },
                  { label: 'CLV',         val: m?.clv != null ? `${m.clv >= 0 ? '+' : ''}$${Math.abs(m.clv).toFixed(2)}` : 'N/A', color: m?.clv != null ? (m.clv >= 0 ? '#6ee7b7' : '#fca5a5') : 'rgba(255,255,255,0.35)', tooltip: 'Closing Line Value — avg difference between your odds and the final market price. Positive = you beat the market.' },
                  { label: 'Units P&L',   val: m ? `${m.unitsPL >= 0 ? '+' : ''}${m.unitsPL.toFixed(1)}u` : '—',              color: m ? (m.unitsPL >= 0 ? '#6ee7b7' : '#fca5a5') : '#fff', tooltip: '1 unit = your avg stake. Normalises profit across different bet sizes.' },
                  { label: 'Settled',     val: settledBets.length,                                                               color: '#fff' },
                  { label: 'Pending',     val: pendingBets.length,                                                               color: '#fff' },
                ].map(s => (
                  <div key={s.label} title={s.tooltip || ''} style={{ textAlign: 'center', cursor: s.tooltip ? 'help' : 'default' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.val}</div>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── S2: Bankroll curve ───────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Bankroll curve</div>
              <ResponsiveContainer width="100%" height={isMobile ? 180 : 160}>
                <LineChart data={bankrollData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="i" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
                  <Tooltip formatter={v => [`$${v}`, 'Cum. P&L']} labelFormatter={i => `Bet #${i}`} contentStyle={{ fontSize: 11, borderRadius: 6, border: '0.5px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="pl" stroke={G} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── S3: Best performer + heatmap ─────────────────────────── */}
            {bestRankRow && bestRankRow.roi != null && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #6ee7b7', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: DG }}>
                  🏆 Best performer: Rank {bestRankRow.cat} — {bestRankRow.roi.toFixed(1)}% ROI from {bestRankRow.bets} bets
                </div>
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>ROI heatmap — rank × odds range</div>
              {/* header */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <div style={{ width: isMobile ? 44 : 72, flexShrink: 0 }} />
                {ODDS_GROUPS.map(g => (
                  <div key={g} style={{ flex: 1, fontSize: isMobile ? 8 : 9, fontWeight: 700, color: '#9ca3af', textAlign: 'center', padding: '4px 2px' }}>{g}</div>
                ))}
              </div>
              {/* rows */}
              {heatmap.map(row => (
                <div key={row.rank} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: isMobile ? 44 : 72, flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center' }}>Rank {row.rank}</div>
                  {row.cells.map(cell => {
                    const hasDat = cell.bets > 0 && cell.roi != null;
                    const bg = !hasDat ? '#f9fafb'
                      : cell.roi > 20  ? 'rgba(16,185,129,0.18)'
                      : cell.roi > 0   ? 'rgba(16,185,129,0.09)'
                      : cell.roi > -20 ? 'rgba(226,75,74,0.09)'
                      : 'rgba(226,75,74,0.18)';
                    return (
                      <div key={cell.label} style={{ flex: 1, background: bg, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                        {hasDat ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: cell.roi >= 0 ? '#059669' : R }}>{cell.roi.toFixed(1)}%</div>
                            <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>{cell.bets}b</div>
                          </>
                        ) : <div style={{ color: '#d1d5db', fontSize: 10 }}>—</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* ── S4: Breakdown tables ─────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb' }}>
              <div style={{ borderBottom: '0.5px solid #e5e7eb', display: 'flex' }}>
                {[['rank','By Rank'],['odds','By Odds'],['cond','By Condition'],['book','By Bookmaker']].map(([k, label]) => (
                  <button key={k} onClick={() => setActiveTab(k)}
                    style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                      color: activeTab === k ? DG : '#9ca3af',
                      borderBottom: activeTab === k ? `2px solid ${DG}` : '2px solid transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ padding: '8px 8px' }}>
                <BreakdownTable rows={tabRows[activeTab] || []} isMobile={isMobile} />
              </div>
            </div>

            {/* ── S5: Model accuracy ───────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>Model accuracy 🤖</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                <StatCard
                  label="Rank 1 win rate"
                  val={rank1St.bets > 0 ? `${(rank1St.wins / rank1St.bets * 100).toFixed(1)}%` : '—'}
                  color={rank1St.bets > 0 ? ((rank1St.wins / rank1St.bets * 100) > 27 ? '#059669' : R) : '#9ca3af'}
                  sub="Market baseline ~27%"
                />
                <StatCard
                  label="Value bet ROI"
                  val={valueSt.roi != null ? `${valueSt.roi >= 0 ? '+' : ''}${valueSt.roi.toFixed(1)}%` : '—'}
                  color={valueSt.roi != null ? (valueSt.roi >= 0 ? '#059669' : R) : '#9ca3af'}
                  sub={`Non-value: ${nValueSt.roi != null ? nValueSt.roi.toFixed(1) + '%' : '—'}`}
                />
                <StatCard
                  label="CLV accuracy"
                  val={posClvPct != null ? `${posClvPct.toFixed(1)}%` : 'N/A'}
                  color={posClvPct != null ? (posClvPct > 50 ? '#059669' : R) : '#9ca3af'}
                  sub="Bets that beat close"
                  tooltip="% of your bets placed at better odds than the final market price"
                />
                <StatCard
                  label="Avg edge / bet"
                  val={m?.clv != null ? `${m.clv >= 0 ? '+' : ''}$${Math.abs(m.clv).toFixed(2)}` : 'N/A'}
                  color={m?.clv != null ? (m.clv >= 0 ? '#059669' : R) : '#9ca3af'}
                  sub={m?.clv != null ? (m.clv > 0 ? 'Beating market' : 'Below market') : 'No CLV data'}
                />
              </div>
              {rankBarData.length > 1 && (
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 130}>
                  <BarChart data={rankBarData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={36} />
                    <Tooltip formatter={v => [`${v}%`, 'ROI']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '0.5px solid #e5e7eb' }} />
                    <Bar dataKey="roi" radius={[4,4,0,0]}>
                      {rankBarData.map((d, i) => <Cell key={i} fill={d.roi >= 0 ? G : R} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── S6: Alerts ───────────────────────────────────────────── */}
            {alerts.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Insights &amp; alerts 💡</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                      background:   a.type === 'red' ? '#fef2f2' : a.type === 'amber' ? '#FAEEDA' : a.type === 'green' ? '#f0fdf4' : '#f8fafc',
                      color:        a.type === 'red' ? '#991b1b' : a.type === 'amber' ? '#854F0B' : a.type === 'green' ? '#065f46' : '#374151',
                      borderLeft: `3px solid ${a.type === 'red' ? '#ef4444' : a.type === 'amber' ? '#f59e0b' : a.type === 'green' ? '#10b981' : '#d1d5db'}`,
                    }}>
                      {a.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── S7: Luck vs skill ────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>Luck vs skill 🎲</div>
              <div style={{ display: 'flex', gap: 28, marginBottom: 12 }}>
                {[
                  { label: 'Expected wins', val: expectedWins.toFixed(1), color: '#374151' },
                  { label: 'Actual wins',   val: actualWins,              color: '#374151' },
                  { label: 'Difference',    val: `${winDiff >= 0 ? '+' : ''}${winDiff.toFixed(1)}`, color: winDiff >= 0 ? '#059669' : R },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', padding: '8px 12px', background: '#f9fafb', borderRadius: 6, marginBottom: 14, lineHeight: 1.6 }}>
                {winDiff > 2
                  ? 'You may be running hot — results could regress toward expectation.'
                  : winDiff < -2
                  ? 'You may be running cold — if CLV is positive, results should improve.'
                  : 'Your results are close to statistical expectation.'}
              </div>
              {[
                { label: 'Expected wins', val: expectedWins },
                { label: 'Actual wins',   val: actualWins   },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', width: 96, flexShrink: 0 }}>{s.label}</div>
                  <div style={{ flex: 1, height: 14, background: '#f3f4f6', borderRadius: 7, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.val / maxBar) * 100}%`, background: G, borderRadius: 7, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', width: 28, textAlign: 'right' }}>{typeof s.val === 'number' ? s.val.toFixed(1) : s.val}</div>
                </div>
              ))}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
