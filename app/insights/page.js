'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const G   = '#00471b';
const RED = '#dc2626';
const MONO = { fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontFeatureSettings: '"tnum"' };

async function sbFetch(path) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    if (!res.ok) return null;
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

function aestToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

function dateRangeBounds(range, customStart, customEnd) {
  const today = aestToday();
  if (range === 'today') return { start: today, end: today };
  if (range === 'yesterday') {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    const y = d.toISOString().slice(0, 10);
    return { start: y, end: y };
  }
  if (range === 'this_week') {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (range === 'this_month') {
    const d = new Date(today);
    return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: today };
  }
  if (range === 'custom') return { start: customStart || today, end: customEnd || today };
  return null; // all_time
}

function isBetWon(b)      { return b.status === 'won'  || b.status === 'win'  || b.status === 'place'; }
function isBetLost(b)     { return b.status === 'lost' || b.status === 'loss'; }
function isBetSettled(b)  { return isBetWon(b) || isBetLost(b); }

function betPnl(b) {
  if (isBetWon(b))  return +(+b.stake * (+b.odds - 1)).toFixed(2);
  if (isBetLost(b)) return -(+b.stake);
  return 0;
}

function roi(pnl, staked) { return staked > 0 ? pnl / staked * 100 : 0; }

function fmt$(n) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return n >= 0 ? `+${s}` : `-${s}`;
}
function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }

function maxDrawdown(sorted) {
  let peak = 0, cum = 0, dd = 0;
  for (const b of sorted) {
    cum += betPnl(b);
    if (cum > peak) peak = cum;
    const d = peak - cum;
    if (d > dd) dd = d;
  }
  return -dd;
}

function kellyPct(winRate, decOdds) {
  const b = decOdds - 1;
  return b > 0 ? Math.max(0, (winRate * b - (1 - winRate)) / b * 100) : 0;
}

function rankBucket(r) {
  const n = +(r || 0);
  if (!n) return null;
  if (n <= 2) return 'R1-2';
  if (n <= 4) return 'R3-4';
  return 'R5+';
}

function oddsBucket(o) {
  const n = +o;
  if (n < 4) return '$2-4';
  if (n < 8) return '$4-8';
  if (n < 15) return '$8-15';
  return '$15+';
}

function heatBg(roiV, n) {
  if (!n || n < 3) return '#f3f4f6';
  if (roiV > 25) return '#14532d';
  if (roiV > 10) return '#166534';
  if (roiV > 0)  return '#4ade80';
  if (roiV > -10) return '#fca5a5';
  if (roiV > -25) return '#ef4444';
  return '#991b1b';
}
function heatFg(roiV, n) {
  if (!n || n < 3) return '#9ca3af';
  return (roiV > 0 || Math.abs(roiV) > 10) ? '#fff' : '#111';
}

function aggGroup(bets) {
  const settled = bets.filter(isBetSettled);
  const won = settled.filter(isBetWon);
  const staked = settled.reduce((s, b) => s + +b.stake, 0);
  const pnl = settled.reduce((s, b) => s + betPnl(b), 0);
  return {
    n: settled.length, wins: won.length, staked, pnl,
    roi: roi(pnl, staked),
    sr: settled.length > 0 ? won.length / settled.length * 100 : 0,
  };
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', ...style }}>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState({ msg }) {
  return <div style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0', textAlign: 'center' }}>{msg}</div>;
}

const RANKS_HEAT = ['R1-2', 'R3-4', 'R5+'];
const ODDS_HEAT  = ['$2-4', '$4-8', '$8-15', '$15+'];

export default function InsightsPage() {
  const { user, isLoaded } = useUser();
  const isPro = useIsPro();
  const [bets, setBets] = useState([]);
  const [results, setResults] = useState([]);
  const [userSettings, setUserSettings] = useState({});
  const [range, setRange] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortVenue, setSortVenue] = useState('roi');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !isPro) return;
    setLoading(true);
    Promise.all([
      sbFetch(`bet_log?clerk_id=eq.${encodeURIComponent(user.id)}&select=*&order=date.asc,created_at.asc`),
      sbFetch(`user_settings?clerk_id=eq.${encodeURIComponent(user.id)}&select=settings`),
    ]).then(([betRows, settingRows]) => {
      const rows = betRows || [];
      console.log('[insights] bet_log rows:', rows.length, '· statuses:', [...new Set(rows.map(b => b.status))]);
      setBets(rows);
      setUserSettings(settingRows?.[0]?.settings || {});
      setLoading(false);
    });
  }, [user?.id, isPro]);

  useEffect(() => {
    if (!bets.length) return;
    const dates = [...new Set(bets.map(b => b.date).filter(Boolean))];
    if (!dates.length) return;
    sbFetch(`race_results?date=in.(${dates.join(',')})&select=date,venue,race_num,sp,winner`).then(rows => {
      setResults(rows || []);
    });
  }, [bets]);

  const filteredBets = useMemo(() => {
    const bounds = dateRangeBounds(range, customStart, customEnd);
    if (!bounds) return bets;
    return bets.filter(b => b.date >= bounds.start && b.date <= bounds.end);
  }, [bets, range, customStart, customEnd]);

  const settled = useMemo(() => filteredBets.filter(isBetSettled), [filteredBets]);
  const wins    = useMemo(() => settled.filter(isBetWon), [settled]);

  const resultMap = useMemo(() => {
    const m = {};
    results.forEach(r => { m[`${r.date}||${(r.venue || '').toUpperCase().trim()}||${r.race_num}`] = r; });
    return m;
  }, [results]);

  // ─── hero ────────────────────────────────────────────────────────────────────
  const hero = useMemo(() => {
    const staked = settled.reduce((s, b) => s + +b.stake, 0);
    const pnl    = settled.reduce((s, b) => s + betPnl(b), 0);
    const sr     = settled.length > 0 ? wins.length / settled.length * 100 : 0;
    const avgOdds = settled.length > 0 ? settled.reduce((s, b) => s + +b.odds, 0) / settled.length : 0;
    const clvBets = settled.filter(b => {
      const r = resultMap[`${b.date}||${(b.venue||'').toUpperCase().trim()}||${b.race_num}`];
      return r?.sp && +r.sp > 0;
    });
    const avgClv = clvBets.length > 0
      ? clvBets.reduce((s, b) => {
          const r = resultMap[`${b.date}||${(b.venue||'').toUpperCase().trim()}||${b.race_num}`];
          return s + (+b.odds - +r.sp) / +r.sp * 100;
        }, 0) / clvBets.length
      : null;
    return { pnl, roi: roi(pnl, staked), sr, avgClv, avgOdds, dd: maxDrawdown(settled), n: settled.length };
  }, [settled, wins, resultMap]);

  // ─── ai insight ──────────────────────────────────────────────────────────────
  const aiInsight = useMemo(() => {
    if (settled.length < 5) return null;
    const zones = {};
    settled.forEach(b => {
      const rank = b.model_rank ? (+(b.model_rank) <= 2 ? 'R1-2' : +(b.model_rank) <= 4 ? 'R3-4' : 'R5+') : null;
      const cond = (b.track_condition || '').trim() || null;
      if (!rank || !cond) return;
      const k = `${rank}__${cond}`;
      if (!zones[k]) zones[k] = [];
      zones[k].push(b);
    });
    let bestKey = null, bestRoi = -Infinity, worstKey = null, worstRoi = Infinity;
    Object.entries(zones).forEach(([k, bs]) => {
      const g = aggGroup(bs);
      if (bs.length >= 10 && g.roi > bestRoi) { bestRoi = g.roi; bestKey = k; }
      if (bs.length >= 5  && g.roi < worstRoi) { worstRoi = g.roi; worstKey = k; }
    });
    return {
      bestParts: bestKey ? bestKey.split('__') : [],
      bestRoi, bestN: bestKey ? zones[bestKey].length : 0,
      worstParts: worstKey ? worstKey.split('__') : [],
      worstRoi, worstN: worstKey ? zones[worstKey].length : 0,
    };
  }, [settled]);

  // ─── clv by rank ─────────────────────────────────────────────────────────────
  const clvByRank = useMemo(() => {
    return ['R1', 'R2', 'R3+', 'All'].map(label => {
      const bs = settled.filter(b => {
        const r = resultMap[`${b.date}||${(b.venue||'').toUpperCase().trim()}||${b.race_num}`];
        if (!r?.sp || +r.sp <= 0) return false;
        const mr = +(b.model_rank || 99);
        if (label === 'R1')  return mr === 1;
        if (label === 'R2')  return mr === 2;
        if (label === 'R3+') return mr >= 3;
        return true;
      });
      if (!bs.length) return { label, avgClv: 0, beatPct: 0, n: 0 };
      const vals = bs.map(b => {
        const r = resultMap[`${b.date}||${(b.venue||'').toUpperCase().trim()}||${b.race_num}`];
        return (+b.odds - +r.sp) / +r.sp * 100;
      });
      return {
        label,
        avgClv: vals.reduce((s, v) => s + v, 0) / vals.length,
        beatPct: vals.filter(v => v > 0).length / vals.length * 100,
        n: bs.length,
      };
    });
  }, [settled, resultMap]);

  // ─── roi by rank ─────────────────────────────────────────────────────────────
  const roiByRank = useMemo(() => ['R1','R2','R3','R4+'].map(label => {
    const bs = settled.filter(b => {
      const mr = +(b.model_rank || 99);
      if (label === 'R1')  return mr === 1;
      if (label === 'R2')  return mr === 2;
      if (label === 'R3')  return mr === 3;
      return mr >= 4;
    });
    return { label, ...aggGroup(bs) };
  }), [settled]);

  // ─── edge heatmap ────────────────────────────────────────────────────────────
  const edgeMap = useMemo(() => {
    const grid = {};
    RANKS_HEAT.forEach(rk => ODDS_HEAT.forEach(ob => { grid[`${rk}||${ob}`] = []; }));
    settled.forEach(b => {
      const rb = rankBucket(b.model_rank);
      const ob = oddsBucket(b.odds);
      if (rb && ob && grid[`${rb}||${ob}`] !== undefined) grid[`${rb}||${ob}`].push(b);
    });
    return grid;
  }, [settled]);

  // ─── track conditions ────────────────────────────────────────────────────────
  const condData = useMemo(() => ['Good','Soft','Heavy','Synthetic'].map(c => {
    const bs = settled.filter(b => (b.track_condition || '').toLowerCase().includes(c.toLowerCase()));
    return { label: c, ...aggGroup(bs) };
  }), [settled]);

  // ─── kelly advisor ───────────────────────────────────────────────────────────
  const bankroll    = useMemo(() => +(userSettings.bankroll || 0), [userSettings]);
  const kellyFrac   = useMemo(() => {
    const kf = userSettings.kellyFraction || 'Half Kelly';
    return kf === 'Full Kelly' ? 1 : kf === 'Quarter Kelly' ? 0.25 : 0.5;
  }, [userSettings]);

  const kellyZones = useMemo(() => {
    const zones = [
      { label: 'R1 $2-4',  rb: 'R1-2', ob: '$2-4'  },
      { label: 'R1 $4-8',  rb: 'R1-2', ob: '$4-8'  },
      { label: 'R2 $2-4',  rb: null,   ob: '$2-4', r2: true },
      { label: 'R3+ $8+',  rb: 'R3-4', ob: '$8-15' },
      { label: 'R3+ $15+', rb: 'R5+',  ob: '$15+'  },
    ];
    return zones.map(z => {
      const bs = settled.filter(b => {
        const rb = rankBucket(b.model_rank);
        const ob = oddsBucket(b.odds);
        if (z.r2) return +(b.model_rank || 0) === 2 && ob === z.ob;
        return rb === z.rb && ob === z.ob;
      });
      if (bs.length < 3) return null;
      const g = aggGroup(bs);
      const avgOdds = bs.reduce((s, b) => s + +b.odds, 0) / bs.length;
      const optK = kellyPct(g.sr / 100, avgOdds) * kellyFrac;
      const actPct = bankroll > 0 ? (g.staked / g.n / bankroll * 100) : 0;
      const signal = optK === 0 ? 'avoid' : actPct > optK * 1.2 ? 'over' : actPct < optK * 0.8 ? 'under' : 'ok';
      return { label: z.label, optK, actPct, signal, n: g.n };
    }).filter(Boolean);
  }, [settled, bankroll, kellyFrac]);

  // ─── top venues ──────────────────────────────────────────────────────────────
  const venueData = useMemo(() => {
    const vm = {};
    settled.forEach(b => {
      const v = (b.venue || 'Unknown').toUpperCase().trim();
      if (!vm[v]) vm[v] = [];
      vm[v].push(b);
    });
    return Object.entries(vm)
      .map(([v, bs]) => ({ venue: v, ...aggGroup(bs) }))
      .sort((a, b) => sortVenue === 'bets' ? b.n - a.n : sortVenue === 'pnl' ? b.pnl - a.pnl : sortVenue === 'sr' ? b.sr - a.sr : b.roi - a.roi);
  }, [settled, sortVenue]);

  // ─── staking discipline ──────────────────────────────────────────────────────
  const stakingStats = useMemo(() => {
    if (!settled.length) return null;
    const actualPnl = settled.reduce((s, b) => s + betPnl(b), 0);
    const flatPnl   = settled.reduce((s, b) => s + (b.status === 'won' ? 10 * (+b.odds - 1) : -10), 0);
    // Kelly sim: use rolling strike rate estimate per day
    const sorted = [...settled].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    let kb = bankroll || 1000, kellyPnlSum = 0;
    sorted.forEach((b, i) => {
      const slice = sorted.slice(0, i);
      const sliceW = slice.filter(x => x.status === 'won').length;
      const estSR = slice.length > 5 ? sliceW / slice.length : 0.25;
      const kStakePct = kellyPct(estSR, +b.odds) * kellyFrac / 100;
      const kStake = kb * Math.min(kStakePct, 0.1);
      const p = b.status === 'won' ? kStake * (+b.odds - 1) : -kStake;
      kb += p; kellyPnlSum += p;
    });
    const overallAvg = settled.reduce((s, b) => s + +b.stake, 0) / settled.length;
    const lossDates = new Set(settled.filter(b => b.status === 'lost').map(b => b.date));
    const postLoss = settled.filter(b => {
      const prev = new Date(b.date); prev.setDate(prev.getDate() - 1);
      return lossDates.has(prev.toISOString().slice(0, 10));
    });
    const postLossAvg = postLoss.length ? postLoss.reduce((s, b) => s + +b.stake, 0) / postLoss.length : null;
    const tiltFlag = postLossAvg !== null && (postLossAvg - overallAvg) / overallAvg > 0.15;
    return { actualPnl, flatPnl, kellyPnlSum, overallAvg, postLossAvg, tiltFlag };
  }, [settled, bankroll, kellyFrac]);

  // ─── calendar ────────────────────────────────────────────────────────────────
  const calendarData = useMemo(() => {
    const today = aestToday();
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const dayPnl = {};
    settled.forEach(b => { if (b.date) dayPnl[b.date] = (dayPnl[b.date] || 0) + betPnl(b); });
    const hasBet = {};
    settled.forEach(b => { if (b.date) hasBet[b.date] = true; });
    return days.map(d => ({ date: d, pnl: hasBet[d] ? (dayPnl[d] || 0) : null }));
  }, [settled]);

  const calMax = useMemo(() => Math.max(1, ...calendarData.map(d => d.pnl !== null ? Math.abs(d.pnl) : 0)), [calendarData]);

  function calColor(pnl) {
    if (pnl === null) return '#f3f4f6';
    if (pnl === 0) return '#e5e7eb';
    if (pnl > calMax * 0.6) return '#14532d';
    if (pnl > 0) return '#4ade80';
    if (pnl < -calMax * 0.6) return '#991b1b';
    return '#fca5a5';
  }

  // ─── early returns ───────────────────────────────────────────────────────────
  if (!isLoaded) return null;

  if (!isPro) {
    return (
      <div>
        <div style={{ background: G, padding: '14px 24px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2, fontFamily: 'Bebas Neue, sans-serif' }}>Insights</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)', background: '#f9fafb' }}>
          <div style={{ textAlign: 'center', maxWidth: 380, padding: '0 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#128202;</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>Insights is a Pro feature</h2>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
              Full betting analytics — CLV tracking, edge zone heatmap, Kelly advisor, P&L calendar and more.
            </p>
            <a href="/account" style={{ display: 'inline-block', background: G, color: '#fff', borderRadius: 8, padding: '11px 28px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              Upgrade to Pro
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── computed display values ─────────────────────────────────────────────────
  const roiMaxAbs = Math.max(1, ...roiByRank.map(r => Math.abs(r.roi)));

  // Calendar padding to Monday
  const firstDay = new Date(calendarData[0]?.date || aestToday());
  const dow = firstDay.getDay();
  const padDays = dow === 0 ? 6 : dow - 1;
  const calCells = [...Array(padDays).fill(null), ...calendarData];

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f3f4f6' }}>

      {/* Header */}
      <div style={{ background: G, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2, fontFamily: 'Bebas Neue, sans-serif' }}>Insights</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['today','Today'],['yesterday','Yesterday'],['this_week','This Week'],['this_month','This Month'],['all_time','All Time'],['custom','Custom']].map(([v, label]) => (
            <button key={v} onClick={() => setRange(v)} style={{
              background: range === v ? 'rgba(255,255,255,0.25)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.4)', color: '#fff',
              borderRadius: 6, padding: '4px 10px', fontSize: 11,
              cursor: 'pointer', fontWeight: range === v ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Custom date inputs */}
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 5, color: '#374151' }} />
          <span style={{ fontSize: 11, color: '#9ca3af' }}>–</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 5, color: '#374151' }} />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 1. HERO BAR */}
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)' }}>
              {[
                ['Total P&L',    hero.pnl !== 0 ? fmt$(hero.pnl) : '$0', hero.pnl > 0, `${hero.n} settled`],
                ['ROI %',        fmtPct(hero.roi), hero.roi > 0, null],
                ['Strike Rate',  `${hero.sr.toFixed(1)}%`, null, `${wins.length}/${settled.length} bets`],
                ['Avg CLV %',    hero.avgClv !== null ? fmtPct(hero.avgClv) : '—', hero.avgClv !== null && hero.avgClv > 0, 'vs closing SP'],
                ['Avg Odds',     hero.avgOdds > 0 ? hero.avgOdds.toFixed(2) : '—', null, null],
                ['Max Drawdown', hero.dd !== 0 ? fmt$(hero.dd) : '$0', false, null],
              ].map(([label, value, pos, sub], i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 6px', borderRight: i < 5 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ ...MONO, fontSize: 19, fontWeight: 700, color: pos === true ? G : pos === false ? RED : '#111' }}>{value}</div>
                  {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
                </div>
              ))}
            </div>
          </Card>

          {/* 2. AI INSIGHT */}
          {aiInsight && (aiInsight.bestParts.length > 0 || aiInsight.worstParts.length > 0) && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>AI Insight</div>
              <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.65 }}>
                {aiInsight.bestParts.length > 0 && (
                  <span>Your best zone is <strong>{aiInsight.bestParts[0]}</strong> picks in <strong>{aiInsight.bestParts[1]}</strong> conditions — ROI <strong>{fmtPct(aiInsight.bestRoi)}</strong> over {aiInsight.bestN} bets.{' '}</span>
                )}
                {aiInsight.worstParts.length > 0 && (
                  <span>Main leak: <strong>{aiInsight.worstParts[0]}</strong> in <strong>{aiInsight.worstParts[1]}</strong> — ROI <strong>{fmtPct(aiInsight.worstRoi)}</strong> over {aiInsight.worstN} bets. Consider cutting stakes here.</span>
                )}
                {!aiInsight.bestParts.length && <span>Not enough data in any single zone for a best-zone signal (need 10+ bets per rank/condition combo).</span>}
              </div>
            </div>
          )}

          {/* 3+4. CLV + ROI by rank */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="CLV Tracker">
              {clvByRank.every(r => r.n === 0) ? (
                <EmptyState msg="No SP data in race_results yet" />
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#9ca3af' }}>
                        {['Rank','Avg CLV','Beat %','vs 50%'].map(h => (
                          <th key={h} style={{ textAlign: h === 'Rank' ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clvByRank.map(r => (
                        <tr key={r.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 600 }}>{r.label}</td>
                          <td style={{ ...MONO, textAlign: 'right', color: r.n ? (r.avgClv >= 0 ? G : RED) : '#9ca3af' }}>{r.n ? fmtPct(r.avgClv) : '—'}</td>
                          <td style={{ ...MONO, textAlign: 'right' }}>{r.n ? `${r.beatPct.toFixed(0)}%` : '—'}</td>
                          <td style={{ textAlign: 'right', paddingLeft: 8 }}>
                            {r.n > 0 && (
                              <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                                <div style={{ width: 64, height: 8, background: '#f3f4f6', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                                  <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db', zIndex: 1 }} />
                                  {r.beatPct >= 50
                                    ? <div style={{ position: 'absolute', left: '50%', width: `${Math.min(50, r.beatPct - 50)}%`, height: '100%', background: G }} />
                                    : <div style={{ position: 'absolute', right: '50%', width: `${Math.min(50, 50 - r.beatPct)}%`, height: '100%', background: RED }} />}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>50% beat rate = no edge over closing line</div>
                </>
              )}
            </Card>

            <Card title="ROI by Model Rank">
              {roiByRank.every(r => r.n === 0) ? (
                <EmptyState msg="No model_rank data in bet log" />
              ) : (
                roiByRank.map(r => (
                  <div key={r.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{r.label}</div>
                      <div style={{ flex: 1, height: 18, background: '#f3f4f6', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                        {r.n > 0 && (
                          <div style={{
                            position: 'absolute',
                            [r.roi >= 0 ? 'left' : 'right']: '50%',
                            width: `${Math.min(50, Math.abs(r.roi) / roiMaxAbs * 50)}%`,
                            height: '100%', background: r.roi >= 0 ? G : RED,
                          }} />
                        )}
                        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db' }} />
                      </div>
                      <div style={{ ...MONO, fontSize: 11, width: 52, textAlign: 'right', flexShrink: 0, color: r.n ? (r.roi >= 0 ? G : RED) : '#9ca3af' }}>
                        {r.n ? fmtPct(r.roi) : '—'}
                      </div>
                    </div>
                    {r.n > 0 && <div style={{ fontSize: 10, color: '#9ca3af', marginLeft: 32 }}>n={r.n} · {r.sr.toFixed(0)}% SR</div>}
                  </div>
                ))
              )}
            </Card>
          </div>

          {/* 5. EDGE ZONE HEATMAP */}
          <Card title="Edge Zone Heatmap">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 52, textAlign: 'left', color: '#9ca3af', fontWeight: 500, paddingBottom: 8 }}></th>
                    {ODDS_HEAT.map(o => <th key={o} style={{ color: '#9ca3af', fontWeight: 500, paddingBottom: 8, textAlign: 'center', minWidth: 90 }}>{o}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {RANKS_HEAT.map(rk => (
                    <tr key={rk}>
                      <td style={{ fontWeight: 600, color: '#374151', paddingRight: 8, paddingBottom: 4, verticalAlign: 'middle' }}>{rk}</td>
                      {ODDS_HEAT.map(ob => {
                        const bs = edgeMap[`${rk}||${ob}`] || [];
                        const g = aggGroup(bs);
                        const show = g.n >= 3;
                        return (
                          <td key={ob} style={{ padding: 3 }}>
                            <div style={{ background: heatBg(g.roi, show ? g.n : 0), borderRadius: 4, padding: '8px 6px', textAlign: 'center' }}>
                              {show ? (
                                <>
                                  <div style={{ ...MONO, fontSize: 12, fontWeight: 700, color: heatFg(g.roi, g.n) }}>{fmtPct(g.roi)}</div>
                                  <div style={{ fontSize: 10, color: heatFg(g.roi, g.n), opacity: 0.75 }}>n={g.n}</div>
                                </>
                              ) : (
                                <div style={{ color: '#9ca3af', fontSize: 12 }}>—</div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>Min 3 bets to show a cell. Dark green = best ROI → red = worst.</div>
          </Card>

          {/* 6+7. TRACK CONDITIONS + KELLY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Track Condition Breakdown">
              {condData.every(c => c.n === 0) ? (
                <EmptyState msg="No track_condition data in bet log" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                      {['Condition','P&L','ROI','SR','n'].map((h, i) => (
                        <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {condData.map(c => (
                      <tr key={c.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '7px 0', fontWeight: 500 }}>{c.label}</td>
                        <td style={{ ...MONO, textAlign: 'right', color: c.n ? (c.pnl >= 0 ? G : RED) : '#9ca3af' }}>{c.n ? fmt$(c.pnl) : '—'}</td>
                        <td style={{ ...MONO, textAlign: 'right', color: c.n ? (c.roi >= 0 ? G : RED) : '#9ca3af' }}>{c.n ? fmtPct(c.roi) : '—'}</td>
                        <td style={{ ...MONO, textAlign: 'right' }}>{c.n ? `${c.sr.toFixed(0)}%` : '—'}</td>
                        <td style={{ ...MONO, textAlign: 'right', color: '#9ca3af' }}>{c.n || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Kelly Criterion Advisor">
              {!bankroll ? (
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
                  Set your bankroll in{' '}
                  <a href="/settings" style={{ color: G, textDecoration: 'none', fontWeight: 600 }}>Settings &#8594; Betting defaults</a>
                  {' '}to see Kelly recommendations.
                </div>
              ) : kellyZones.length === 0 ? (
                <EmptyState msg="Need 3+ settled bets per zone for Kelly recommendations" />
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                    Bankroll: <span style={{ ...MONO, color: '#374151', fontWeight: 600 }}>${bankroll.toLocaleString()}</span>
                    {' '}· {userSettings.kellyFraction || 'Half Kelly'}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                        {['Zone','Opt%','Actual%','Signal'].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kellyZones.map(z => (
                        <tr key={z.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 500 }}>{z.label}</td>
                          <td style={{ ...MONO, textAlign: 'right' }}>{z.optK.toFixed(1)}%</td>
                          <td style={{ ...MONO, textAlign: 'right' }}>{z.actPct.toFixed(1)}%</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: z.signal === 'avoid' ? RED : z.signal === 'over' ? '#f59e0b' : z.signal === 'under' ? '#3b82f6' : G }}>
                              {z.signal === 'over' ? '&#8595; over' : z.signal === 'under' ? '&#8593; under' : z.signal === 'avoid' ? '&#10005; avoid' : '&#10003; ok'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
          </div>

          {/* 8. TOP VENUES */}
          <Card title="Top Venues">
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['roi','ROI'],['bets','Bets'],['pnl','P&L'],['sr','Strike']].map(([v, label]) => (
                <button key={v} onClick={() => setSortVenue(v)} style={{
                  background: sortVenue === v ? G : '#f3f4f6',
                  color: sortVenue === v ? '#fff' : '#374151',
                  border: 'none', borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, cursor: 'pointer', fontWeight: 500,
                }}>{label}</button>
              ))}
            </div>
            {venueData.length === 0 ? <EmptyState msg="No settled bets yet" /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                    {['Venue','Bets','Strike','ROI','P&L'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {venueData.slice(0, 15).map(v => (
                    <tr key={v.venue} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 0', fontWeight: 500 }}>
                        {v.venue.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </td>
                      <td style={{ ...MONO, textAlign: 'right' }}>{v.n}</td>
                      <td style={{ ...MONO, textAlign: 'right' }}>{v.sr.toFixed(1)}%</td>
                      <td style={{ ...MONO, textAlign: 'right', color: v.roi >= 0 ? G : RED }}>{fmtPct(v.roi)}</td>
                      <td style={{ ...MONO, textAlign: 'right', color: v.pnl >= 0 ? G : RED }}>{fmt$(v.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* 9+10. STAKING + CALENDAR */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 24 }}>
            <Card title="Staking Discipline">
              {!stakingStats ? <EmptyState msg="No settled bets in this range" /> : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                    <tbody>
                      {[
                        ['Actual P&L',       fmt$(stakingStats.actualPnl),   stakingStats.actualPnl >= 0],
                        ['Flat $10 stake',   fmt$(stakingStats.flatPnl),     stakingStats.flatPnl >= 0],
                        ['Kelly simulation', fmt$(stakingStats.kellyPnlSum), stakingStats.kellyPnlSum >= 0],
                      ].map(([label, val, pos]) => (
                        <tr key={label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 0', color: '#374151' }}>{label}</td>
                          <td style={{ ...MONO, textAlign: 'right', fontWeight: 700, color: pos ? G : RED }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Tilt Detection</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Post-loss 24h avg stake</span>
                      <span style={{ ...MONO, fontWeight: 600 }}>
                        {stakingStats.postLossAvg !== null ? `$${stakingStats.postLossAvg.toFixed(0)}` : 'n/a'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 10 }}>
                      <span style={{ color: '#6b7280' }}>Overall avg stake</span>
                      <span style={{ ...MONO, fontWeight: 600 }}>${stakingStats.overallAvg.toFixed(0)}</span>
                    </div>
                    <div style={{
                      background: stakingStats.tiltFlag ? '#fef2f2' : '#f0fdf4',
                      border: `1px solid ${stakingStats.tiltFlag ? '#fca5a5' : '#86efac'}`,
                      borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                      color: stakingStats.tiltFlag ? RED : G,
                    }}>
                      {stakingStats.postLossAvg === null
                        ? '— insufficient data (need loss history)'
                        : stakingStats.tiltFlag
                        ? '&#9888; Tilt detected — staking 15%+ higher after losses'
                        : '&#10003; Staking discipline OK'}
                    </div>
                  </div>
                </>
              )}
            </Card>

            <Card title="P&L Calendar (Last 90 Days)">
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px', gap: 2, width: 'fit-content' }}>
                  {calCells.map((cell, i) => (
                    <div
                      key={i}
                      title={cell ? `${cell.date}${cell.pnl !== null ? ` · ${fmt$(cell.pnl)}` : ''}` : ''}
                      style={{ width: 12, height: 12, borderRadius: 2, background: cell ? calColor(cell.pnl) : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 10, color: '#9ca3af', flexWrap: 'wrap' }}>
                {[['#14532d','Profit'],['#4ade80','Small profit'],['#fca5a5','Small loss'],['#991b1b','Loss'],['#f3f4f6','No bets']].map(([color, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                    {label}
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
