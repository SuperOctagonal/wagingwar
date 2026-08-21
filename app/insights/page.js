'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import BetFilterPanel from '@/components/BetFilterPanel';

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

function fmt$(n) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return n >= 0 ? `+${s}` : `-${s}`;
}
function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }

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

function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4, verticalAlign: 'middle' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%',
          background: '#e5e7eb', color: '#6b7280',
          fontSize: 9, fontWeight: 700, cursor: 'pointer', userSelect: 'none',
          lineHeight: 1, flexShrink: 0,
        }}
      >i</span>
      {show && (
        <div style={{
          position: 'absolute', top: '110%', left: 0,
          background: '#1f2937', color: '#f9fafb', fontSize: 11, lineHeight: 1.55,
          padding: '8px 11px', borderRadius: 7, width: 230, zIndex: 200,
          boxShadow: '0 4px 16px rgba(0,0,0,0.28)', pointerEvents: 'none',
          fontWeight: 400, textTransform: 'none', letterSpacing: 0,
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function Card({ title, info, children, style }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', ...style }}>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center' }}>
          {title}
          {info && <InfoTip text={info} />}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState({ msg }) {
  return <div style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0', textAlign: 'center' }}>{msg}</div>;
}

export default function InsightsPage() {
  const { user, isLoaded } = useUser();
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const [lockVisible, setLockVisible] = useState(true);
  const [bets, setBets] = useState([]);
  const [results, setResults] = useState([]);
  const [userSettings, setUserSettings] = useState({});
  const [range, setRange] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortVenue, setSortVenue] = useState('roi');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !isPro) { if (isPro === false) setLoading(false); return; }
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
    // dist/class added (beyond what CLV needs) purely to populate the new
    // Distance/Race Class filter dropdowns from real seen values — CLV logic
    // below only reads .sp, keyed per-horse (see resultMap), unaffected.
    sbFetch(`race_results?date=in.(${dates.join(',')})&select=date,venue,race_num,horse_name,sp,winner,dist,class`).then(rows => {
      setResults(rows || []);
    });
  }, [bets]);

  // ─── server-computed summary (Hero, ROI by rank, Edge heatmap, Track
  // condition) — /api/insights/summary, Pro-gated server-side and computed
  // entirely server-side (see that route + lib/serverInsightsData.js).
  // BetFilterPanel's filters (activeFilterEntries, declared below) are
  // threaded into both this fetch and the AI-summary fetch below it via the
  // same query params /api/insights/filtered-bets used to accept -- every
  // migrated section re-filters together now, closing the temporary
  // inconsistency from earlier batches.

  // ─── filter panel ────────────────────────────────────────────────────────────
  // Selection UI lives in BetFilterPanel (components/BetFilterPanel.js); this
  // page only owns the resulting active-filters map. Declared before the
  // summary/ai-summary fetch effects below since both read
  // activeFilterEntries directly now (no more separate /api/insights/
  // filtered-bets round-trip -- that route's filtering logic moved into
  // lib/serverInsightsData.js's fetchUserBetData, applied server-side as
  // part of computeInsightsSummary itself).
  const [activeFilters, setActiveFilters] = useState({});
  const handleFilterChange = useCallback((f) => setActiveFilters(f), []);
  const activeFilterEntries = useMemo(() => Object.entries(activeFilters).filter(([, v]) => v), [activeFilters]);

  useEffect(() => {
    if (!user?.id || !isPro) { if (isPro === false) setSummaryLoading(false); return; }
    const bounds = dateRangeBounds(range, customStart, customEnd);
    const params = new URLSearchParams(Object.fromEntries(activeFilterEntries));
    if (bounds) { params.set('start', bounds.start); params.set('end', bounds.end); }
    const qs = params.toString() ? `?${params.toString()}` : '';
    setSummaryLoading(true);
    let cancelled = false;
    fetch(`/api/insights/summary${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) { setSummary(data); setSummaryLoading(false); } })
      .catch(() => { if (!cancelled) { setSummary(null); setSummaryLoading(false); } });
    return () => { cancelled = true; };
  }, [user?.id, isPro, range, customStart, customEnd, activeFilterEntries]);

  // ─── AI Insight (section 10) — /api/insights/ai-summary, Pro-gated and
  // computed server-side from the exact same aggregated numbers as summary
  // above (never raw bet_log/race_results). Template-generated (best/worst
  // performing group by ROI, picked across the already-computed rank/
  // condition/venue/heatmap breakdowns), not a live LLM call — no external
  // API cost, so no caching needed, just a fresh cheap computation per
  // request. Independent fetch/loading state from `summary` since it's a
  // separate call, not blocking the rest of the page.
  const [aiSummaryText, setAiSummaryText] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(true);
  const [aiSummaryError, setAiSummaryError] = useState(false);
  useEffect(() => {
    if (!user?.id || !isPro) { if (isPro === false) setAiSummaryLoading(false); return; }
    const bounds = dateRangeBounds(range, customStart, customEnd);
    const params = new URLSearchParams(Object.fromEntries(activeFilterEntries));
    if (bounds) { params.set('start', bounds.start); params.set('end', bounds.end); }
    const qs = params.toString() ? `?${params.toString()}` : '';
    setAiSummaryLoading(true);
    setAiSummaryError(false);
    let cancelled = false;
    fetch(`/api/insights/ai-summary${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { if (!cancelled) { setAiSummaryText(data.text || null); setAiSummaryLoading(false); } })
      .catch(() => { if (!cancelled) { setAiSummaryError(true); setAiSummaryLoading(false); } });
    return () => { cancelled = true; };
  }, [user?.id, isPro, range, customStart, customEnd, activeFilterEntries]);

  // The /api/insights/filtered-bets round-trip + serverFilteredBets state
  // that used to live here are gone -- that route's filtering logic moved
  // into lib/serverInsightsData.js (fetchUserBetData), applied server-side
  // as part of computeInsightsSummary, and threaded directly into the
  // summary/ai-summary fetches above via activeFilterEntries. Nothing on
  // this page reads raw filtered bet_log rows client-side anymore.

  // Hero bar is now server-computed (summary.hero, see the fetch effect
  // above) — this local version was removed once that migrated in batch 1
  // of the Insights rebuild.

  // AI Insight is now server-generated (aiSummaryText, see the fetch effect
  // above), reusing the shared summary aggregation instead of this page's
  // own rank x condition zone computation.

  // CLV Tracker, ROI by rank, and Edge heatmap are now server-computed
  // (summary.clv / summary.roiByRank / summary.edgeHeatmap) — see above.

  // Track condition breakdown is now server-computed (summary.condition).

  // bankroll still used by the Kelly Advisor card's "set your bankroll"
  // empty-state check and display below (Kelly's own zone math is now
  // server-computed, see summary.kelly).
  const bankroll = useMemo(() => +(userSettings.bankroll || 0), [userSettings]);

  // Kelly Advisor zones, Top Venues, Staking Discipline, and P&L Calendar
  // are all now server-computed (summary.kelly / summary.venues /
  // summary.staking / summary.calendar) — see below for the display-only
  // calMax/calColor derived from summary.calendar.

  function calColor(pnl, calMax) {
    if (pnl === null) return '#f3f4f6';
    if (pnl === 0) return '#e5e7eb';
    if (pnl > calMax * 0.6) return '#14532d';
    if (pnl > 0) return '#4ade80';
    if (pnl < -calMax * 0.6) return '#991b1b';
    return '#fca5a5';
  }

  // ─── early returns ───────────────────────────────────────────────────────────
  if (!isLoaded) return null;

  if (isPro === false) {
    const fakeHero = [
      ['Total P&L',   '+$312.50', '#00471b'],
      ['ROI %',       '+14.8%',   '#00471b'],
      ['Strike Rate', '38.2%',    '#111'],
      ['Avg CLV %',   '+2.1%',    '#00471b'],
      ['Avg Odds',    '4.20',     '#111'],
      ['Max Drawdown','-$87.00',  '#dc2626'],
    ];
    const fakeClv = [
      ['R1 (top pick)', '+4.2%', 68],
      ['R2',            '+1.8%', 56],
      ['R3–5',          '-0.9%', 44],
    ];
    const fakeRoi = [
      ['R1', 22.4, 18],
      ['R2',  8.1, 31],
      ['R3',  1.2, 24],
      ['R4', -6.8, 19],
      ['R5+', -14.2, 12],
    ];
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#f3f4f6', position: 'relative' }}>
        <div style={{ opacity: 0.18, filter: 'blur(2px)', pointerEvents: 'none', userSelect: 'none' }}>
          {/* Header */}
          <div style={{ background: G, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>Insights</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Today','Yesterday','This Week','This Month','All Time'].map((l, i) => (
                <div key={l} style={{ background: i === 4 ? 'rgba(255,255,255,0.25)' : 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: i === 4 ? 700 : 400 }}>{l}</div>
              ))}
            </div>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Hero bar */}
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '8px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)' }}>
                {fakeHero.map(([label, value, color], i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '10px 6px', borderRight: i < 5 ? '1px solid #f3f4f6' : 'none' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 19, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* AI insight */}
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>AI Insight</div>
              <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.65 }}>
                Your best zone is <strong>R1</strong> picks in <strong>Soft/Heavy</strong> conditions — ROI <strong>+31.4%</strong> over 18 bets.{' '}
                Main leak: <strong>R4–5</strong> in <strong>Good</strong> — ROI <strong>-18.2%</strong> over 22 bets. Consider cutting stakes here.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* CLV Tracker */}
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 10 }}>CLV Tracker</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#9ca3af' }}>
                      {['Rank','Avg CLV','Beat %','vs 50%'].map(h => (
                        <th key={h} style={{ textAlign: h === 'Rank' ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fakeClv.map(([rank, clv, beat]) => (
                      <tr key={rank} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '7px 0', fontWeight: 600 }}>{rank}</td>
                        <td style={{ fontFamily: 'ui-monospace,monospace', textAlign: 'right', color: clv.startsWith('+') ? G : '#dc2626' }}>{clv}</td>
                        <td style={{ fontFamily: 'ui-monospace,monospace', textAlign: 'right' }}>{beat}%</td>
                        <td style={{ textAlign: 'right', paddingLeft: 8 }}>
                          <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                            <div style={{ width: 64, height: 8, background: '#f3f4f6', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db', zIndex: 1 }} />
                              {beat >= 50
                                ? <div style={{ position: 'absolute', left: '50%', width: `${Math.min(50, beat - 50)}%`, height: '100%', background: G }} />
                                : <div style={{ position: 'absolute', right: '50%', width: `${Math.min(50, 50 - beat)}%`, height: '100%', background: '#dc2626' }} />}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>50% beat rate = no edge over closing line</div>
              </div>
              {/* ROI by Rank */}
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 10 }}>ROI by Model Rank</div>
                {fakeRoi.map(([label, roi, n]) => (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{label}</div>
                      <div style={{ flex: 1, height: 18, background: '#f3f4f6', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', [roi >= 0 ? 'left' : 'right']: '50%', width: `${Math.min(50, Math.abs(roi) / 25 * 50)}%`, height: '100%', background: roi >= 0 ? G : '#dc2626' }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db' }} />
                      </div>
                      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, width: 52, textAlign: 'right', color: roi >= 0 ? G : '#dc2626' }}>{roi > 0 ? '+' : ''}{roi}%</div>
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginLeft: 36 }}>n={n}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Overlay */}
        {lockVisible && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 40px', textAlign: 'center', maxWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', position: 'relative' }}>
              <button onClick={() => setLockVisible(false)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              <div style={{ fontSize: 28, marginBottom: 10 }}>&#128202;</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 8 }}>Insights is a Pro feature</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>Full betting analytics — CLV tracking, edge zones, Kelly advisor and more.</div>
              <a href="/account" style={{ display: 'inline-block', background: G, color: '#fff', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Upgrade to Pro</a>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── computed display values ─────────────────────────────────────────────────
  const roiMaxAbs = Math.max(1, ...(summary?.roiByRank || []).map(r => Math.abs(r.roi)));
  const sortedVenues = [...(summary?.venues || [])].sort((a, b) =>
    sortVenue === 'bets' ? b.n - a.n : sortVenue === 'pnl' ? b.pnl - a.pnl : sortVenue === 'sr' ? b.sr - a.sr : b.roi - a.roi);

  // Calendar padding to Monday
  const calendarData = summary?.calendar || [];
  const firstDay = new Date(calendarData[0]?.date || aestToday());
  const dow = firstDay.getDay();
  const padDays = dow === 0 ? 6 : dow - 1;
  const calCells = [...Array(padDays).fill(null), ...calendarData];
  const calMax = Math.max(1, ...calendarData.map(d => d.pnl !== null ? Math.abs(d.pnl) : 0));

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#f3f4f6' }}>

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

          {/* 0. FILTER PANEL — additive, AND'd with the date-range tabs above */}
          <BetFilterPanel bets={bets} results={results} isMobile={isMobile} onChange={handleFilterChange} />

          {/* 1. HERO BAR — server-computed, see summary.hero */}
          <Card>
            {summaryLoading ? (
              <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
            ) : !summary ? (
              <EmptyState msg="Couldn't load summary" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)' }}>
                {[
                  ['Total P&L',    summary.hero.pnl !== 0 ? fmt$(summary.hero.pnl) : '$0', summary.hero.pnl > 0, `${summary.hero.n} settled`, 'Total profit/loss from all settled bets. Win bets: (odds − 1) × stake. Losing bets: −stake.'],
                  ['ROI %',        fmtPct(summary.hero.roi), summary.hero.roi > 0, null, 'Return on investment: P&L ÷ total staked × 100. Positive = profitable long-term.'],
                  ['Strike Rate',  `${summary.hero.sr.toFixed(1)}%`, null, `${summary.hero.wins}/${summary.hero.n} bets`, 'Percentage of bets that won or placed. High SR at short odds or low SR at long odds can both be profitable.'],
                  ['Avg CLV %',    summary.hero.avgClv !== null ? fmtPct(summary.hero.avgClv) : '—', summary.hero.avgClv !== null && summary.hero.avgClv > 0, 'vs closing SP', 'Average Closing Line Value — how much better your odds were vs the final market price. Positive CLV means you consistently beat the market.'],
                  ['Avg Odds',     summary.hero.avgOdds > 0 ? summary.hero.avgOdds.toFixed(2) : '—', null, null, 'Average decimal odds taken across all settled bets.'],
                  ['Max Drawdown', summary.hero.dd !== 0 ? fmt$(summary.hero.dd) : '$0', false, null, 'Largest peak-to-trough drop in your running P&L — the most you\'ve been "down" at any point.'],
                ].map(([label, value, pos, sub, tip], i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '10px 6px', borderRight: isMobile ? (i % 2 === 0 ? '1px solid #f3f4f6' : 'none') : (i < 5 ? '1px solid #f3f4f6' : 'none'), borderBottom: isMobile && i < 4 ? '1px solid #f3f4f6' : 'none' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label}<InfoTip text={tip} /></div>
                    <div style={{ ...MONO, fontSize: 19, fontWeight: 700, color: pos === true ? G : pos === false ? RED : '#111' }}>{value}</div>
                    {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 2. AI INSIGHT — template-generated server-side, see aiSummaryText fetch effect above */}
          {(aiSummaryLoading || aiSummaryText) && !aiSummaryError && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>AI Insight</div>
              {aiSummaryLoading ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>Loading…</div>
              ) : (
                <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.65 }}>{aiSummaryText}</div>
              )}
            </div>
          )}

          {/* 3+4. CLV + ROI by rank */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Card title="CLV Tracker" info="Closing Line Value — compares your taken odds to the final market price at jump time (race_results.sp). Consistently beating the SP means you have a real edge. 50% beat rate = no edge. Needs 10+ bets in a rank to show a real percentage.">
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary || summary.clv.every(r => r.n === 0) ? (
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
                      {summary.clv.map(r => (
                        <tr key={r.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 600 }}>{r.label}</td>
                          {r.n === 0 ? (
                            <td colSpan={3} style={{ textAlign: 'right', color: '#9ca3af' }}>—</td>
                          ) : r.insufficientData ? (
                            <td colSpan={3} style={{ textAlign: 'right', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>insufficient data (n={r.n})</td>
                          ) : (
                            <>
                              <td style={{ ...MONO, textAlign: 'right', color: r.avgClv >= 0 ? G : RED }}>{fmtPct(r.avgClv)}</td>
                              <td style={{ ...MONO, textAlign: 'right' }}>{r.beatPct.toFixed(0)}%</td>
                              <td style={{ textAlign: 'right', paddingLeft: 8 }}>
                                <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                                  <div style={{ width: 64, height: 8, background: '#f3f4f6', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db', zIndex: 1 }} />
                                    {r.beatPct >= 50
                                      ? <div style={{ position: 'absolute', left: '50%', width: `${Math.min(50, r.beatPct - 50)}%`, height: '100%', background: G }} />
                                      : <div style={{ position: 'absolute', right: '50%', width: `${Math.min(50, 50 - r.beatPct)}%`, height: '100%', background: RED }} />}
                                  </div>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>50% beat rate = no edge over closing line</div>
                </>
              )}
            </Card>

            <Card title="ROI by Model Rank" info="P&L efficiency grouped by the model's ranking of each horse. R1 = top pick. Shows whether your edge is concentrated in highly-ranked selections or spread across the field. Needs 10+ bets in a rank to show a real percentage.">
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary || summary.roiByRank.every(r => r.n === 0) ? (
                <EmptyState msg="No rank data in bet log" />
              ) : (
                summary.roiByRank.map(r => (
                  <div key={r.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{r.label}</div>
                      <div style={{ flex: 1, height: 18, background: '#f3f4f6', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                        {r.n > 0 && !r.insufficientData && (
                          <div style={{
                            position: 'absolute',
                            [r.roi >= 0 ? 'left' : 'right']: '50%',
                            width: `${Math.min(50, Math.abs(r.roi) / roiMaxAbs * 50)}%`,
                            height: '100%', background: r.roi >= 0 ? G : RED,
                          }} />
                        )}
                        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#d1d5db' }} />
                      </div>
                      <div style={{ ...MONO, fontSize: 11, width: 52, textAlign: 'right', flexShrink: 0, color: r.n && !r.insufficientData ? (r.roi >= 0 ? G : RED) : '#9ca3af' }}>
                        {r.n === 0 ? '—' : r.insufficientData ? 'n/a' : fmtPct(r.roi)}
                      </div>
                    </div>
                    {r.n > 0 && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginLeft: 32 }}>
                        {r.insufficientData ? `insufficient data (n=${r.n}, need 10+)` : `n=${r.n} · ${r.sr.toFixed(0)}% SR`}
                      </div>
                    )}
                  </div>
                ))
              )}
            </Card>
          </div>

          {/* 5. EDGE ZONE HEATMAP — server-computed, see summary.edgeHeatmap */}
          <Card title="Edge Zone Heatmap" info="Your ROI broken down by model rank AND odds range. Each cell needs 10+ bets to display. Dark green = your most profitable zone, red = worst. A gold ring flags a clear edge (±20% ROI or more) once a cell has enough bets.">
            {summaryLoading ? (
              <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
            ) : !summary ? (
              <EmptyState msg="Couldn't load summary" />
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 52, textAlign: 'left', color: '#9ca3af', fontWeight: 500, paddingBottom: 8 }}></th>
                        {summary.edgeHeatmap.odds.map(o => <th key={o} style={{ color: '#9ca3af', fontWeight: 500, paddingBottom: 8, textAlign: 'center', minWidth: 90 }}>{o}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.edgeHeatmap.ranks.map(rk => (
                        <tr key={rk}>
                          <td style={{ fontWeight: 600, color: '#374151', paddingRight: 8, paddingBottom: 4, verticalAlign: 'middle' }}>{rk}</td>
                          {summary.edgeHeatmap.odds.map(ob => {
                            const cell = summary.edgeHeatmap.cells[`${rk}||${ob}`] || { n: 0, insufficientData: true };
                            const show = !cell.insufficientData;
                            return (
                              <td key={ob} style={{ padding: 3 }}>
                                <div style={{
                                  background: heatBg(cell.roi, show ? cell.n : 0),
                                  borderRadius: 4, padding: '8px 6px', textAlign: 'center',
                                  boxShadow: cell.hasEdge ? 'inset 0 0 0 2px #f59e0b' : 'none',
                                }}>
                                  {show ? (
                                    <>
                                      <div style={{ ...MONO, fontSize: 12, fontWeight: 700, color: heatFg(cell.roi, cell.n) }}>{fmtPct(cell.roi)}</div>
                                      <div style={{ fontSize: 10, color: heatFg(cell.roi, cell.n), opacity: 0.75 }}>n={cell.n}</div>
                                    </>
                                  ) : (
                                    <div style={{ color: '#9ca3af', fontSize: cell.n > 0 ? 9 : 12 }}>{cell.n > 0 ? `n=${cell.n}` : '—'}</div>
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
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>Min 10 bets to show a cell. Dark green = best ROI → red = worst. Gold ring = clear edge (±20% ROI).</div>
              </>
            )}
          </Card>

          {/* 6+8. TRACK CONDITIONS + TOP VENUES */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Card title="Track Condition Breakdown" info="Record (Starts-Wins-2nds-3rds), ROI, and P&L split by track condition. Needs 10+ bets on a condition to show ROI/SR/P&L. Some punters have a real edge on certain surfaces — this reveals it.">
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary || summary.condition.every(c => c.n === 0) ? (
                <EmptyState msg="No track_condition data in bet log" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                        {['Condition','Record','ROI','SR','P&L'].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.condition.map(c => (
                        <tr key={c.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 500 }}>{c.label}</td>
                          <td style={{ ...MONO, textAlign: 'right', fontSize: 11 }}>{c.n ? `${c.n}-${c.firsts}-${c.seconds}-${c.thirds}` : '—'}</td>
                          {c.n === 0 ? (
                            <td colSpan={3} style={{ textAlign: 'right', color: '#9ca3af' }}>—</td>
                          ) : c.insufficientData ? (
                            <td colSpan={3} style={{ textAlign: 'right', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>insufficient data (n={c.n})</td>
                          ) : (
                            <>
                              <td style={{ ...MONO, textAlign: 'right', color: c.roi >= 0 ? G : RED }}>{fmtPct(c.roi)}</td>
                              <td style={{ ...MONO, textAlign: 'right' }}>{c.sr.toFixed(0)}%</td>
                              <td style={{ ...MONO, textAlign: 'right', color: c.pnl >= 0 ? G : RED }}>{fmt$(c.pnl)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Top Venues" info="Record (Starts-Wins-2nds-3rds), strike rate, ROI and P&L at each track. Needs 10+ bets at a venue to show ROI/Strike/P&L. Sort by ROI to find where you have a genuine edge, or by Bets to weight results by sample size.">
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
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : sortedVenues.length === 0 ? <EmptyState msg="No settled bets yet" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                        {['Venue','Record','Strike','ROI','P&L'].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedVenues.slice(0, 15).map(v => (
                        <tr key={v.venue} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 500 }}>
                            {v.venue.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                          </td>
                          <td style={{ ...MONO, textAlign: 'right', fontSize: 11 }}>{v.n}-{v.firsts}-{v.seconds}-{v.thirds}</td>
                          {v.insufficientData ? (
                            <td colSpan={3} style={{ textAlign: 'right', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>insufficient data</td>
                          ) : (
                            <>
                              <td style={{ ...MONO, textAlign: 'right' }}>{v.sr.toFixed(1)}%</td>
                              <td style={{ ...MONO, textAlign: 'right', color: v.roi >= 0 ? G : RED }}>{fmtPct(v.roi)}</td>
                              <td style={{ ...MONO, textAlign: 'right', color: v.pnl >= 0 ? G : RED }}>{fmt$(v.pnl)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* 7+9. KELLY + STAKING */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Card title="Kelly Staking Advisor" info="Shows the stake size the Kelly Criterion implies from your historical win rate and average odds in each zone, next to what you've actually staked there — for information only, not a recommendation. Set your bankroll in Settings to see this.">
              {!bankroll ? (
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
                  Set your bankroll in{' '}
                  <a href="/settings" style={{ color: G, textDecoration: 'none', fontWeight: 600 }}>Settings &#8594; Betting defaults</a>
                  {' '}to see this breakdown.
                </div>
              ) : summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary || summary.kelly.zones.length === 0 ? (
                <EmptyState msg="Need 10+ settled bets in a zone to show this breakdown" />
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                    Bankroll: <span style={{ ...MONO, color: '#374151', fontWeight: 600 }}>${bankroll.toLocaleString()}</span>
                    {' '}· {summary.kelly.kellyFractionLabel}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>
                        {['Zone','Model %','Actual %','Comparison'].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, paddingBottom: 8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.kelly.zones.map(z => (
                        <tr key={z.label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 0', fontWeight: 500 }}>{z.label}</td>
                          <td style={{ ...MONO, textAlign: 'right' }}>{z.optK.toFixed(1)}%</td>
                          <td style={{ ...MONO, textAlign: 'right' }}>{z.actPct.toFixed(1)}%</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                              {z.signal === 'no_model_edge' ? 'No model edge in this zone'
                                : z.signal === 'above_model_size' ? 'Above model-implied size'
                                : z.signal === 'below_model_size' ? 'Below model-implied size'
                                : 'In line with model-implied size'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8, lineHeight: 1.5 }}>For information only — not financial advice. Consider your own risk tolerance before changing how you stake.</div>
                </>
              )}
            </Card>

            <Card title="Staking Discipline" info="Compares your actual P&L to two benchmarks: flat $10 stakes on every bet, and a simulated Kelly stake. Shown for comparison, not as a verdict on your staking.">
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary?.staking ? <EmptyState msg="No settled bets in this range" /> : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                    <tbody>
                      {[
                        ['Actual P&L',       fmt$(summary.staking.actualPnl),   summary.staking.actualPnl >= 0, false],
                        ['Flat $10 stake',   fmt$(summary.staking.flatPnl),     summary.staking.flatPnl >= 0, false],
                        ['Kelly simulation', fmt$(summary.staking.kellyPnlSum), summary.staking.kellyPnlSum >= 0, summary.staking.kellySimDiverged],
                      ].map(([label, val, pos, diverged]) => (
                        <tr key={label} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 0', color: '#374151' }}>{label}</td>
                          {diverged ? (
                            <td style={{ textAlign: 'right', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>simulation diverged — insufficient realistic data</td>
                          ) : (
                            <td style={{ ...MONO, textAlign: 'right', fontWeight: 700, color: pos ? G : RED }}>{val}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center' }}>Post-Loss Staking<InfoTip text="Compares your average stake on days following a loss to your overall average stake — a factual comparison, not a diagnosis." /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Post-loss 24h avg stake</span>
                      <span style={{ ...MONO, fontWeight: 600 }}>
                        {summary.staking.postLossAvg !== null ? `$${summary.staking.postLossAvg.toFixed(0)}` : 'n/a'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 10 }}>
                      <span style={{ color: '#6b7280' }}>Overall avg stake</span>
                      <span style={{ ...MONO, fontWeight: 600 }}>${summary.staking.overallAvg.toFixed(0)}</span>
                    </div>
                    <div style={{
                      background: summary.staking.elevatedPostLossStaking ? '#fef2f2' : '#f0fdf4',
                      border: `1px solid ${summary.staking.elevatedPostLossStaking ? '#fca5a5' : '#86efac'}`,
                      borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                      color: summary.staking.elevatedPostLossStaking ? RED : G,
                    }}>
                      {summary.staking.postLossAvg === null
                        ? 'Insufficient data (need loss history)'
                        : summary.staking.elevatedPostLossStaking
                        ? `⚠ Post-loss stakes are ${summary.staking.postLossPctDiff.toFixed(0)}% higher than your overall average`
                        : '✓ Post-loss stakes are in line with your overall average'}
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* 10. CALENDAR */}
          <div style={{ paddingBottom: 24 }}>
            <Card title="P&L Calendar (Last 90 Days)" info="Daily P&L grid for the past 90 days, intersected with the date range selected above. Dark green = big profit day, red = losing day, light grey = no bets. Hover a square to see the exact date and P&L.">
              {summaryLoading ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : !summary ? (
                <EmptyState msg="Couldn't load summary" />
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px', gap: 2, width: 'fit-content' }}>
                      {calCells.map((cell, i) => (
                        <div
                          key={i}
                          title={cell ? `${cell.date}${cell.pnl !== null ? ` · ${fmt$(cell.pnl)}` : ''}` : ''}
                          style={{ width: 12, height: 12, borderRadius: 2, background: cell ? calColor(cell.pnl, calMax) : 'transparent' }}
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
                </>
              )}
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
