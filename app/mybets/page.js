'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import useUserSettings from '@/hooks/useUserSettings';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { normaliseVenue } from '@/lib/venues';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BOOKMAKERS = ['Sportsbet','TAB','Betfair','Bet365','BlueBet','Ladbrokes','Neds','Other'];

// Direct REST fetch — bypasses Supabase JS client schema cache
async function sbFetch(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SKEY,
        'Authorization': `Bearer ${SKEY}`,
        ...(opts.prefer ? { 'Prefer': opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[MyBets sbFetch] Error', res.status, errText);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('[MyBets sbFetch] Network error:', err);
    return null;
  }
}

async function loadBets(userId) {
  const data = await sbFetch(`bet_log?clerk_id=eq.${encodeURIComponent(userId)}&order=date.desc,id.desc`);
  return Array.isArray(data) ? data : [];
}

async function removeBet(id) {
  return sbFetch(`bet_log?id=eq.${id}`, { method: 'DELETE' });
}

async function patchBet(id, fields) {
  return sbFetch(`bet_log?id=eq.${id}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
}

function normName(n) { return (n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }


function ordinal(n) { if (!n) return ''; const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function parseRaceTime(t) {
  if (!t) return Infinity;
  // dots→colons, then strip anything after am/pm marker so "04.00 pm (racing)" or "04:00:00" all match
  const s = String(t).trim().replace(/\./g, ':');
  if (!s) return Infinity;
  // 12-hour — no end-anchor so trailing seconds/text are ignored
  const m12 = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m12) { let h = +m12[1]; const min = +m12[2]; const pm = /pm/i.test(m12[3]); if (pm && h !== 12) h += 12; if (!pm && h === 12) h = 0; return h * 60 + min; }
  // 24-hour — also no end-anchor (handles "04:00:00" postgres time)
  const m24 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m24) return +m24[1] * 60 + +m24[2];
  return Infinity;
}
function typePillCfg(betType) {
  const bt = (betType || '').toLowerCase();
  if (bt.includes('each')) return { bg: '#7c3aed', label: 'E/W' };
  if (bt === 'place') return { bg: '#2563eb', label: 'Place' };
  return { bg: '#16a34a', label: 'Win' };
}
function computePnl(b) {
  const isEW = (b.bet_type || '').toLowerCase().includes('each');
  const stk = +(b.stake || 0);
  if (b.profit_loss !== null && b.profit_loss !== undefined) return b.profit_loss;
  if (b.return_amt !== null && b.return_amt !== undefined) return b.return_amt - (isEW ? stk * 2 : stk);
  if (b.status === 'loss') return isEW ? -(stk * 2) : -stk;
  return null;
}

async function matchAndUpdateBets(pendingBets) {
  if (!pendingBets.length || !SURL || !SKEY) return { spMap: {}, anyUpdated: false };

  const dates = [...new Set(pendingBets.map(b => b.date).filter(Boolean))];
  const allResults = {};
  await Promise.all(dates.map(async date => {
    try {
      const res = await fetch(
        `${SURL}/rest/v1/race_results?select=*&date=eq.${date}&order=venue,race_num,finish_pos`,
        { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }
      );
      if (res.ok) allResults[date] = await res.json();
    } catch {}
  }));

  const spMap = {};
  const patches = [];

  for (const bet of pendingBets) {
    const rows = allResults[bet.date] || [];
    if (!rows.length) continue;

    const betRaceNum = +(bet.race_number ?? bet.race_num ?? 0);
    const betHorse = normName(bet.horse_name || '');
    const betHorseStripped = normName((bet.horse_name || '').replace(/\s*\([A-Z]+\)\s*$/i, ''));

    const row = rows.find(r => {
      const rRace  = +r.race_num;
      const rHorse = normName(r.horse_name);
      const rHorseStripped = normName(r.horse_name.replace(/\s*\([A-Z]+\)\s*$/i, ''));
      return rRace === betRaceNum && (
        rHorse === betHorse ||
        rHorseStripped === betHorse ||
        rHorse === betHorseStripped ||
        rHorseStripped === betHorseStripped
      );
    });

    if (!row) continue;

    const stake = +(bet.stake || 0);
    const odds  = +(bet.odds  || 0);
    const sp    = +(row.sp    || 0);
    const pos   = row.finish_pos;
    const type  = (bet.bet_type || '').toLowerCase();
    const isEW = type === 'each-way' || type === 'each way';
    const FF_CODES = ['FF','BD','UR','PU','DNF','DISQ','NP','FELL','REF'];
    const isFF = row.result_status && FF_CODES.includes(row.result_status.toUpperCase());

    let status, returnAmt, profitLoss;
    if (isFF) {
      status     = 'loss';
      returnAmt  = 0;
      profitLoss = isEW ? -(2 * stake) : -stake;
    } else if (isEW) {
      if (pos === 1) {
        status     = 'win';
        profitLoss = (stake * odds) - stake + (stake * (odds / 4)) - stake;
      } else if (pos <= 3) {
        status     = 'place';
        profitLoss = -stake + (stake * (odds / 4)) - stake;
      } else {
        status = 'loss'; profitLoss = -(2 * stake);
      }
      returnAmt = profitLoss + 2 * stake;
    } else if (type === 'place') {
      if (pos <= 3) {
        status     = 'place';
        returnAmt  = stake * (odds / 4);
        profitLoss = returnAmt - stake;
      } else {
        status = 'loss'; returnAmt = 0; profitLoss = -stake;
      }
    } else {
      if (pos === 1) {
        status     = 'win';
        returnAmt  = stake * odds;
        profitLoss = returnAmt - stake;
      } else {
        status = 'loss'; returnAmt = 0; profitLoss = -stake;
      }
    }

    spMap[bet.id] = sp || null;

    const winMargin = isFF
      ? (row.result_status || row.margin || null)
      : pos === 1
        ? (rows.find(r => +r.race_num === betRaceNum && r.finish_pos === 2)?.margin || null)
        : (row.margin || null);

    const hasExistingPnl = bet.profit_loss !== null && bet.profit_loss !== undefined;
    const fields = {
      status,
      result:   status,
      position: pos,
      margin:   winMargin,
      ...(hasExistingPnl ? {} : {
        return_amt:  Math.round((returnAmt  || 0) * 100) / 100,
        profit_loss: Math.round((profitLoss || 0) * 100) / 100,
      }),
    };

    patches.push(
      fetch(`${SURL}/rest/v1/bet_log?id=eq.${bet.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SKEY,
          Authorization: `Bearer ${SKEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(fields),
      })
    );
  }

  let anyUpdated = false;
  if (patches.length) {
    await Promise.all(patches);
    anyUpdated = true;
  }
  return { spMap, anyUpdated };
}

// ─── Period helpers ──────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().slice(0, 10); }

// Date arithmetic anchored at noon UTC — avoids DST/timezone boundary issues.
// Always pass an AEST ISO string as the base; returns ISO date string.
function dateMath(isoStr, days) {
  const d = new Date(isoStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodFilter(period, todayISO) {
  const anchor = new Date(todayISO + 'T12:00:00Z');
  const dow = anchor.getUTCDay();
  const weekStart = new Date(anchor);
  weekStart.setUTCDate(anchor.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const weekStartISO  = weekStart.toISOString().slice(0, 10);
  const monthStartISO = todayISO.slice(0, 7) + '-01';
  if (period === 'Today') return b => b.date === todayISO;
  if (period === 'This week') return b => b.date >= weekStartISO;
  if (period === 'This month') return b => b.date >= monthStartISO;
  return () => true;
}

function calcRow(bets) {
  const settled = bets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'unresolved');
  const wins = settled.filter(b => b.status === 'win').length;
  const totalStaked = settled.reduce((s, b) => s + (b.stake || 0), 0);
  const totalRet = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
  const pnl = settled.reduce((s, b) => {
    if (b.profit_loss !== null && b.profit_loss !== undefined) return s + b.profit_loss;
    return s + (b.return_amt || 0) - (b.stake || 0);
  }, 0);
  return {
    bets: settled.length, wins,
    strike: settled.length > 0 ? (wins / settled.length * 100).toFixed(0) + '%' : '—',
    staked: totalStaked > 0 ? `$${totalStaked.toFixed(0)}` : '—',
    ret:    totalRet    > 0 ? `$${totalRet.toFixed(0)}`    : '—',
    pnl:    totalStaked > 0 ? pnl : null,
    roi:    totalStaked > 0 ? (pnl / totalStaked * 100).toFixed(1) + '%' : '—',
  };
}

// ─── Resulted bet row ─────────────────────────────────────────────────────────

function ResultedBetRow({ b, sp }) {
  const stake  = b.stake || 0;
  const ret    = b.return_amt || 0;
  const isEW   = (b.bet_type || '').toLowerCase().includes('each');
  const pnl    = b.profit_loss !== null && b.profit_loss !== undefined
    ? b.profit_loss
    : ret - (isEW ? stake * 2 : stake);
  const status  = b.status || '';
  const pos     = b.position;
  const raceNum = b.race_number ?? b.race_num;
  const venue   = b.track || b.venue;
  const resultCfg = {
    win:   { bg: '#d1fae5', color: '#065f46', label: 'WIN'   },
    place: { bg: '#dbeafe', color: '#1e40af', label: 'PLACE' },
    loss:  { bg: '#fee2e2', color: '#991b1b', label: 'LOSS'  },
  }[status] || { bg: '#f3f4f6', color: '#374151', label: (status || 'result').toUpperCase() };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f3f4f6', background: '#fff' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          {[venue, raceNum ? `R${raceNum}` : null, b.date ? b.date.slice(5).replace('-', '/') : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {b.bet_type && (
          <span style={{ fontSize: 9, background: '#f3f4f6', color: '#6b7280', padding: '1px 6px', borderRadius: 8, textTransform: 'capitalize', display: 'block', marginBottom: 2 }}>{b.bet_type}</span>
        )}
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>${stake.toFixed(0)} @ ${Number(b.odds || 0).toFixed(2)}</span>
        {sp && <span style={{ fontSize: 9, color: '#9ca3af', display: 'block' }}>SP ${Number(sp).toFixed(2)}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: resultCfg.bg, color: resultCfg.color }}>{resultCfg.label}</span>
        {pos && <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>{ordinal(pos)}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: pnl >= 0 ? '#059669' : '#dc2626', flexShrink: 0, width: 64, textAlign: 'right' }}>
        {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toFixed(2)}
      </div>
    </div>
  );
}

function parseRaceTimeStr(timeStr) {
  if (!timeStr) return null;
  try {
    const norm = timeStr.trim().replace(/\./g, ':');
    const m = norm.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    if (m[3].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
    return h * 60 + min; // minutes since midnight
  } catch { return null; }
}

function BetCountdown({ bet, isFirst = false }) {
  const [secsLeft, setSecsLeft] = useState(null);

  useEffect(() => {
    const minsFromMidnight = parseRaceTimeStr(bet.race_time || null);
    if (minsFromMidnight === null) return;
    const getRaceDate = () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minsFromMidnight / 60), minsFromMidnight % 60, 0);
    };
    const update = () => setSecsLeft(Math.floor((getRaceDate() - Date.now()) / 1000));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [bet.id, bet.race_time]);

  if (secsLeft === null) return <span style={{ color: '#9ca3af' }}>—</span>;

  let badge;
  if (secsLeft < 120) {
    badge = (
      <>
        <style>{`@keyframes ww-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', animation: 'ww-pulse 1s ease-in-out infinite', display: 'inline-block' }}>RACING NOW</span>
      </>
    );
  } else if (secsLeft < 900) {
    badge = <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626' }}>{Math.floor(secsLeft / 60)}m</span>;
  } else if (secsLeft < 3600) {
    badge = <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ffedd5', color: '#c2410c' }}>{Math.floor(secsLeft / 60)}m</span>;
  } else {
    const hrs = Math.floor(secsLeft / 3600);
    const mins = Math.floor((secsLeft % 3600) / 60);
    badge = <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>{hrs}h {mins}m</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {isFirst && <span style={{ fontSize: 9, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.5px' }}>NEXT →</span>}
      {badge}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MybetsPage() {
  const { user } = useUser();
  const isPro    = useIsPro();
  const isMobile = useIsMobile();
  const { settings, loading: settingsLoading } = useUserSettings();
  const settingsApplied = useRef(false);

  const [upgradeOpen,      setUpgradeOpen]      = useState(false);
  const [bets,             setBets]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [activeTab,        setActiveTab]        = useState('all');
  const [matchingResults,  setMatchingResults]  = useState(false);
  const [resultSpMap,      setResultSpMap]      = useState({});
  const [raceTimeMap,      setRaceTimeMap]      = useState({});

  const [betView,          setBetView]          = useState('table');
  const [mainTab,          setMainTab]          = useState('ledger');
  const [chartType,        setChartType]        = useState('outcome');
  const [refreshing,       setRefreshing]       = useState(false);
  const [racePopup,        setRacePopup]        = useState(null);
  const [racePopupData,    setRacePopupData]    = useState([]);
  const [sortCol,          setSortCol]          = useState('time');
  const [sortDir,          setSortDir]          = useState('asc');
  const [dateRange,        setDateRange]        = useState('today');
  const [customStart,      setCustomStart]      = useState('');
  const [customEnd,        setCustomEnd]        = useState('');
  const [edgeZoneTab,      setEdgeZoneTab]      = useState('odds');
  const [hoveredId,    setHoveredId]    = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [editStake,    setEditStake]    = useState('');
  const [editOdds,     setEditOdds]     = useState('');
  const [mobileMenuId, setMobileMenuId] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  // CSV data for Quick Log
  const [csvMeetings, setCsvMeetings] = useState([]);   // ['Flemington', ...]
  const [csvVenues,   setCsvVenues]   = useState({});   // { 'Flemington': ['Flemington_R1', ...] }
  const [csvRaces,    setCsvRaces]    = useState({});   // { 'Flemington_R1': { num, horses, ... } }

  // Quick Log form
  const [qlMeeting,   setQlMeeting]   = useState('');
  const [qlRace,      setQlRace]      = useState('');
  const [qlHorse,     setQlHorse]     = useState('');
  const [qlBetType,   setQlBetType]   = useState('win');
  const [qlStake,     setQlStake]     = useState('');
  const [qlOdds,      setQlOdds]      = useState('');
  const [qlBookmaker, setQlBookmaker] = useState('Sportsbet');
  const [qlSaving,    setQlSaving]    = useState(false);
  const [qlToast,     setQlToast]     = useState(null);
  const [qlRaceTime,  setQlRaceTime]  = useState('');
  const [qlTab,       setQlTab]       = useState('');
  const [raceDate,    setRaceDate]    = useState(null);

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (settingsLoading || settingsApplied.current) return;
    settingsApplied.current = true;
    const rangeMap = { 'Today': 'today', 'This week': 'this_week', 'This month': 'this_month', 'All time': 'all_time' };
    const viewMap  = { 'Table': 'table', 'Terminal': 'terminal', 'Sessions': 'sessions', 'Kanban': 'kanban' };
    const mappedRange = rangeMap[settings.mybetsRange];
    const mappedView  = viewMap[settings.mybetsView];
    if (mappedRange) setDateRange(mappedRange);
    if (mappedView)  setBetView(mappedView);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading]);

  const showScratched = settings.mybetsShowScratched !== false;

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadBets(user.id).then(async loaded => {
      setBets(loaded);
      setLoading(false);

      // Seed SP map from race_results for all already-resulted bets
      const resultedLoaded = loaded.filter(b => b.status && b.status !== 'pending' && b.status !== 'unresolved');
      if (resultedLoaded.length > 0) {
        const combos = {};
        for (const b of resultedLoaded) {
          const venue = b.track || b.venue;
          const raceNum = +(b.race_number ?? b.race_num ?? 0);
          if (!b.date || !venue || !raceNum) continue;
          const key = `${b.date}|${venue}|${raceNum}`;
          if (!combos[key]) combos[key] = { date: b.date, venue, raceNum };
        }
        const initSpMap = {};
        await Promise.all(Object.values(combos).map(async ({ date, venue, raceNum }) => {
          const rows = await sbFetch(
            `race_results?date=eq.${date}&venue=eq.${encodeURIComponent(venue)}&race_num=eq.${raceNum}&select=horse_name,sp`
          );
          if (!Array.isArray(rows)) return;
          for (const b of resultedLoaded) {
            if (b.date !== date) continue;
            if ((b.track || b.venue) !== venue) continue;
            if (+(b.race_number ?? b.race_num ?? 0) !== raceNum) continue;
            const row = rows.find(r => normName(r.horse_name) === normName(b.horse_name));
            if (row?.sp) initSpMap[b.id] = row.sp;
          }
        }));
        if (Object.keys(initSpMap).length > 0) setResultSpMap(prev => ({ ...prev, ...initSpMap }));
      }

      const pending = loaded.filter(b => !b.status || b.status === 'pending' || b.status === 'unresolved');
      if (pending.length > 0) {
        setMatchingResults(true);
        const { spMap, anyUpdated } = await matchAndUpdateBets(pending);
        setMatchingResults(false);
        if (Object.keys(spMap).length > 0) setResultSpMap(prev => ({ ...prev, ...spMap }));
        if (anyUpdated) {
          const fresh = await loadBets(user.id);
          setBets(fresh);
        }
      }
    });
  }, [user?.id]);

  // Keep `now` fresh so countdown timers update (1s for live negative countdown)
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  // ww:refresh event — re-pull bets from DB (dispatched by TopNav refresh button)
  useEffect(() => {
    const handler = async () => {
      if (!user?.id) return;
      const loaded = await loadBets(user.id);
      setBets(loaded);
    };
    window.addEventListener('ww:refresh', handler);
    return () => window.removeEventListener('ww:refresh', handler);
  }, [user?.id]);

  // Reset sort to sensible default when switching date ranges
  useEffect(() => {
    if (dateRange === 'today') { setSortCol('time'); setSortDir('asc'); }
    else { setSortCol('date'); setSortDir('desc'); }
  }, [dateRange]);

  // Auto-flag pending bets as scratched if the horse appears in the scratchings table
  const scratchCheckRef = useRef(false);
  useEffect(() => {
    if (scratchCheckRef.current || !bets.length || !SURL || !SKEY) return;
    const pending = bets.filter(b => !b.status || b.status === 'pending');
    if (!pending.length) { scratchCheckRef.current = true; return; }
    const aestNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
    const aestISO = `${aestNow.getFullYear()}-${String(aestNow.getMonth()+1).padStart(2,'0')}-${String(aestNow.getDate()).padStart(2,'0')}`;
    sbFetch(`scratchings?date=eq.${aestISO}&select=venue,race_num,horse_name`)
      .then(rows => {
        console.log('[Scratchings] MyBets fetch returned:', rows?.length ?? 'null', 'rows for', aestISO);
        if (Array.isArray(rows) && rows.length) {
          const scrSet = new Set(
            rows.map(r => `${normaliseVenue(r.venue || '')}||${String(+(r.race_num || 0))}||${normName(r.horse_name || '')}`)
          );
          console.log('[Scratchings] Set populated:', scrSet.size, 'entries');
          const toScratch = [];
          for (const bet of pending) {
            const key = `${normaliseVenue(bet.track || bet.venue || '')}||${String(+(bet.race_number ?? bet.race_num ?? 0))}||${normName(bet.horse_name || '')}`;
            if (scrSet.has(key)) toScratch.push(bet.id);
          }
          if (toScratch.length) {
            setBets(prev => prev.map(b => toScratch.includes(b.id) ? { ...b, status: 'scratched' } : b));
            toScratch.forEach(id => patchBet(id, { status: 'scratched' }));
          }
        }
        scratchCheckRef.current = true;
      });
  }, [bets]);

  // Backfill post times from race_schedule for bets that don't have race_time stored
  useEffect(() => {
    if (!bets.length) return;
    const needsTime = bets.filter(b =>
      !b.race_time && b.date && (b.track || b.venue) && (b.race_number ?? b.race_num)
    );
    if (!needsTime.length) return;
    const dates = [...new Set(needsTime.map(b => b.date))];
    sbFetch(`race_schedule?date=in.(${dates.join(',')})&select=date,venue,race_num,post_time`)
      .then(rows => {
        if (!Array.isArray(rows) || !rows.length) return;
        const updates = {};
        for (const b of needsTime) {
          const betVenue = normName(normaliseVenue(b.track || b.venue || ''));
          const betNum   = String(+(b.race_number ?? b.race_num ?? 0));
          const match = rows.find(r =>
            r.date === b.date &&
            normName(normaliseVenue(r.venue)) === betVenue &&
            String(+r.race_num) === betNum
          );
          if (match) updates[b.id] = match.post_time;
        }
        if (Object.keys(updates).length) setRaceTimeMap(prev => ({ ...prev, ...updates }));
      });
  }, [bets]);

  // Fetch full race result when user clicks R# in War Record
  useEffect(() => {
    if (!racePopup) { setRacePopupData([]); return; }
    sbFetch(
      `race_results?venue=eq.${encodeURIComponent(racePopup.venue)}&race_num=eq.${racePopup.race_num}&date=eq.${racePopup.date}&order=finish_pos.asc.nullslast&select=horse_name,finish_pos,sp,result_status,margin`
    ).then(data => setRacePopupData(Array.isArray(data) ? data : []));
  }, [racePopup]);

  // Fetch race date from today_meetings so Quick Log uses the correct betting date
  useEffect(() => {
    sbFetch('today_meetings?select=date&limit=1').then(data => {
      if (Array.isArray(data) && data.length > 0 && data[0].date === todayISO) {
        setRaceDate(data[0].date);
      }
    });
  }, []);

  // Load CSV race data from localStorage (key: ww_csv, set by races page)
  useEffect(() => {
    try {
      const csv = localStorage.getItem('ww_csv');
      if (csv) {
        const { allRaces: ar, allVenues: av } = buildRaces(parseCSV(csv));
        setCsvRaces(ar);
        setCsvVenues(av);
        setCsvMeetings(Object.keys(av));
      }
    } catch (e) {
      console.error('[MyBets] CSV parse error:', e);
    }
  }, []);

  // Race options for selected meeting — populated from CSV, falls back to R1-R12
  const csvRaceOptions = useMemo(() => {
    if (!qlMeeting) return [];
    return (csvVenues[qlMeeting] || [])
      .map(k => ({ key: k, value: csvRaces[k]?.num || '', label: `R${csvRaces[k]?.num}` }))
      .filter(o => o.value);
  }, [csvVenues, csvRaces, qlMeeting]);

  // Horses available for the selected meeting + race
  const csvHorses = useMemo(() => {
    if (!qlMeeting || !qlRace) return [];
    const venueKeys = csvVenues[qlMeeting] || [];
    // Compare numerically so "01" matches "1", etc.
    const raceKey = venueKeys.find(k => {
      const rc = csvRaces[k];
      return rc && +rc.num === +qlRace;
    });
    if (!raceKey) return [];
    const rc = csvRaces[raceKey];
    if (!rc || !rc.horses) return [];
    return rc.horses
      .filter(h => !h.scratched)
      .sort((a, b) => (+a.tab || 99) - (+b.tab || 99))
      .map(h => ({ name: h.name, tab: h.tab, odds: h.rawOdds }));
  }, [csvRaces, csvVenues, qlMeeting, qlRace]);

  // Auto-populate race time when meeting + race are selected
  useEffect(() => {
    if (!qlMeeting || !qlRace) { setQlRaceTime(''); return; }
    // 1. In-memory CSV (immediate, no network)
    const venueKeys = csvVenues[qlMeeting] || [];
    const raceKey = venueKeys.find(k => csvRaces[k] && String(+csvRaces[k].num) === String(+qlRace));
    const inMemTime = raceKey ? (csvRaces[raceKey]?.time || '') : '';
    if (inMemTime) { setQlRaceTime(inMemTime); return; }
    // 2. race_schedule fallback (for when no CSV is loaded but schedule data exists)
    const date = raceDate || todayISO;
    sbFetch(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`)
      .then(rows => {
        if (!Array.isArray(rows) || !rows.length) return;
        const match = rows.find(r =>
          String(+r.race_num) === String(+qlRace) &&
          normName(normaliseVenue(r.venue)) === normName(normaliseVenue(qlMeeting))
        );
        if (match?.post_time) setQlRaceTime(match.post_time);
      });
  }, [qlMeeting, qlRace, csvVenues, csvRaces, raceDate, todayISO]);

  const handleQuickLog = useCallback(async () => {
    console.log('[QuickLog] Save Bet clicked | horse:', qlHorse, '| stake:', qlStake, '| odds:', qlOdds, '| user:', !!user?.id);
    console.log('[QuickLog] Date check — raceDate:', raceDate, '| todayISO:', todayISO, '| will use:', raceDate || todayISO);
    if (!qlHorse.trim() || !qlStake || isNaN(+qlStake) || +qlStake <= 0) {
      console.log('[QuickLog] Blocked: horse/stake invalid'); return;
    }
    if (!qlOdds || isNaN(+qlOdds) || +qlOdds <= 1) {
      console.log('[QuickLog] Blocked: odds must be > 1, got:', qlOdds); return;
    }
    if (!user?.id || !SURL || !SKEY) {
      console.log('[QuickLog] Blocked: missing user or env | user:', !!user?.id, 'SURL:', !!SURL, 'SKEY:', !!SKEY); return;
    }
    setQlSaving(true);

    const normVenue = normaliseVenue(qlMeeting || '') || null;

    const insertBody = {
      clerk_id:    user.id,
      date:        todayISO,
      horse_name:  qlHorse.trim(),
      track:       normVenue,
      venue:       normVenue,
      race_number: qlRace     ? +qlRace : null,
      bet_type:    qlBetType,
      stake:       +qlStake,
      odds:        +qlOdds,
      bookmaker:   qlBookmaker || null,
      race_time:   qlRaceTime  || null,
      tab_no:      qlTab       || null,
      status:      'pending',
      return_amt:  null,
      position:    null,
    };
    console.log('[QuickLog] Posting to bet_log:', JSON.stringify(insertBody));

    let ok = false;
    try {
      const res = await fetch(`${SURL}/rest/v1/bet_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SKEY,
          'Authorization': `Bearer ${SKEY}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(insertBody),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[QuickLog] Supabase error — status:', res.status, '| body:', errText);
      } else {
        ok = true;
        const text = await res.text();
        const inserted = text ? JSON.parse(text) : null;
        const newBet = Array.isArray(inserted) ? inserted[0] : inserted;
        if (newBet) setBets(prev => [newBet, ...prev]);
        loadBets(user.id).then(fresh => { if (fresh.length) setBets(fresh); });
        try { awardPoints(user.id, 'bet_logged', qlHorse.trim()).catch(() => {}); } catch {}
        setQlHorse(''); setQlStake(''); setQlOdds('');
      }
    } catch (err) {
      console.error('[QuickLog] Network error:', err);
    }

    setQlToast(ok ? 'success' : 'error');
    setQlSaving(false);
    setTimeout(() => setQlToast(null), 2500);
  }, [user?.id, todayISO, raceDate, qlHorse, qlMeeting, qlRace, qlBetType, qlStake, qlOdds, qlRaceTime, qlBookmaker, qlTab]);

  const handleDeleteBet = useCallback(async (id) => {
    if (!confirm('Remove this bet?')) return;
    await removeBet(id);
    setBets(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleEditSave = useCallback(async (id) => {
    if (!editStake || !editOdds) return;
    await patchBet(id, { stake: +editStake, odds: +editOdds });
    setBets(prev => prev.map(b => b.id === id ? { ...b, stake: +editStake, odds: +editOdds } : b));
    setEditingId(null);
  }, [editStake, editOdds]);

  const statsRows = useMemo(() => (
    ['Today', 'This week', 'This month', 'All time'].map(p => ({ label: p, ...calcRow(bets.filter(periodFilter(p, todayISO))) }))
  ), [bets, todayISO]);

  const resultedBets     = useMemo(() => bets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'unresolved'), [bets]);
  const filteredResulted = useMemo(() => {
    if (activeTab === 'all') return resultedBets;
    if (activeTab === 'win') return resultedBets.filter(b => b.status === 'win');
    if (activeTab === 'place') return resultedBets.filter(b => b.status === 'place');
    if (activeTab === 'loss') return resultedBets.filter(b => b.status === 'loss');
    if (activeTab === 'today') return resultedBets.filter(b => b.date === todayISO);
    if (activeTab === 'this week') {
      const anchor = new Date(todayISO + 'T12:00:00Z');
      const dow = anchor.getUTCDay();
      const ws = new Date(anchor); ws.setUTCDate(anchor.getUTCDate() - (dow === 0 ? 6 : dow - 1));
      return resultedBets.filter(b => b.date >= ws.toISOString().slice(0, 10));
    }
    return resultedBets;
  }, [resultedBets, activeTab, todayISO]);

  const pendingBets = useMemo(() => bets.filter(b => !b.status || b.status === 'pending' || b.status === 'unresolved'), [bets]);

  const filteredBets = useMemo(() => {
    const base = bets.filter(b => b.status !== 'scratched');
    if (activeTab === 'all') return base;
    if (activeTab === 'win') return base.filter(b => b.status === 'win');
    if (activeTab === 'place') return base.filter(b => b.status === 'place');
    if (activeTab === 'loss') return base.filter(b => b.status === 'loss');
    if (activeTab === 'today') return base.filter(b => b.date === todayISO);
    if (activeTab === 'this week') {
      const anchor = new Date(todayISO + 'T12:00:00Z');
      const dow = anchor.getUTCDay();
      const ws = new Date(anchor); ws.setUTCDate(anchor.getUTCDate() - (dow === 0 ? 6 : dow - 1));
      return base.filter(b => b.date >= ws.toISOString().slice(0, 10));
    }
    return base;
  }, [bets, activeTab, todayISO]);

  const pendingBetsSorted = useMemo(() => {
    return [...pendingBets].sort((a, b) => {
      const mins = bet => {
        let t = bet.race_time || null;
        if (!t) {
          const vn = bet.track || bet.venue || '';
          const rk = (csvVenues[vn] || []).find(k => csvRaces[k] && +csvRaces[k].num === +(bet.race_number ?? bet.race_num ?? 0));
          if (rk) t = csvRaces[rk]?.time || null;
        }
        return parseRaceTimeStr(t) ?? Infinity;
      };
      return mins(a) - mins(b);
    });
  }, [pendingBets, csvRaces, csvVenues]);

  const dateFilteredBets = useMemo(() => {
    const anchor = new Date(todayISO + 'T12:00:00Z');
    const yesterdayISO = dateMath(todayISO, -1);
    const dow = anchor.getUTCDay();
    const ws = new Date(anchor); ws.setUTCDate(anchor.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    const weekStartISO  = ws.toISOString().slice(0, 10);
    const monthStartISO = todayISO.slice(0, 7) + '-01';
    switch (dateRange) {
      case 'today':      return bets.filter(b => b.date === todayISO);
      case 'yesterday':  return bets.filter(b => b.date === yesterdayISO);
      case 'this_week':  return bets.filter(b => b.date >= weekStartISO);
      case 'this_month': return bets.filter(b => b.date >= monthStartISO);
      case 'custom':     return bets.filter(b => (!customStart || b.date >= customStart) && (!customEnd || b.date <= customEnd));
      default:           return bets;
    }
  }, [bets, dateRange, customStart, customEnd, todayISO]);

  const dateResulted = useMemo(() =>
    dateFilteredBets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'unresolved'),
  [dateFilteredBets]);

  const dateStats = useMemo(() => calcRow(dateFilteredBets), [dateFilteredBets]);

  const tabCounts = useMemo(() => {
    const base = dateFilteredBets.filter(b => b.status !== 'scratched');
    return {
      all:      base.length,
      win:      base.filter(b => b.status === 'win').length,
      place:    base.filter(b => b.status === 'place').length,
      loss:     base.filter(b => b.status === 'loss').length,
      upcoming: base.filter(b => !b.status || b.status === 'pending' || b.status === 'unresolved').length,
      resulted: base.filter(b => b.status && b.status !== 'pending' && b.status !== 'unresolved').length,
    };
  }, [dateFilteredBets]);

  const avgOdds = useMemo(() => {
    const settled = dateFilteredBets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'unresolved' && +(b.odds || 0) > 1);
    if (!settled.length) return '—';
    return '$' + (settled.reduce((s, b) => s + +(b.odds || 0), 0) / settled.length).toFixed(2);
  }, [dateFilteredBets]);

  const heroRecord = useMemo(() => {
    const n = dateResulted.length;
    if (n === 0) return '0-0-0-0';
    const wins = dateResulted.filter(b => b.status === 'win').length;
    const sec  = dateResulted.filter(b => b.position === 2).length;
    const thr  = dateResulted.filter(b => b.position === 3).length;
    return `${n}-${wins}-${sec}-${thr}`;
  }, [dateResulted]);

  const heroStreak = useMemo(() => {
    const sorted = [...dateResulted].sort((a, b) => {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      const ta = parseRaceTime(raceTimeMap[a.id] || a.race_time);
      const tb = parseRaceTime(raceTimeMap[b.id] || b.race_time);
      if (ta !== tb) return tb - ta;
      const ra = +(a.race_number ?? a.race_num ?? 99);
      const rb = +(b.race_number ?? b.race_num ?? 99);
      if (ra !== rb) return rb - ra;
      return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
    });
    if (!sorted.length) return null;
    const isW = s => s === 'win' || s === 'place';
    const firstW = isW(sorted[0].status);
    let count = 0;
    for (const b of sorted) { if (isW(b.status) === firstW) count++; else break; }
    return { type: firstW ? 'W' : 'L', count };
  }, [dateResulted, raceTimeMap]);

  const heroChartData = useMemo(() => {
    const sorted = [...dateResulted].sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      const ta = parseRaceTime(raceTimeMap[a.id] || a.race_time);
      const tb = parseRaceTime(raceTimeMap[b.id] || b.race_time);
      if (ta !== tb) return ta - tb;
      const ra = +(a.race_number ?? a.race_num ?? 99);
      const rb = +(b.race_number ?? b.race_num ?? 99);
      if (ra !== rb) return ra - rb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    let cum = 0;
    return sorted.map((b, i) => {
      cum += (b.profit_loss || 0);
      return { label: i === sorted.length - 1 ? `${i + 1} (now)` : `${i + 1}`, pnl: Math.round(cum * 100) / 100, status: b.status, horse: b.horse_name };
    });
  }, [dateResulted, raceTimeMap]);

  const sevenDaySparkData = useMemo(() => {
    const today = new Date(todayISO + 'T00:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      const dayBets = bets.filter(b => b.date === iso && b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'unresolved');
      const pnl = dayBets.reduce((s, b) => s + (b.profit_loss || 0), 0);
      return { day: iso.slice(5), pnl: Math.round(pnl * 100) / 100 };
    });
  }, [bets, todayISO]);

  const ledgerFilteredBets = useMemo(() => {
    const base = showScratched
      ? dateFilteredBets
      : dateFilteredBets.filter(b => b.status !== 'scratched');
    if (activeTab === 'all') return base;
    if (activeTab === 'upcoming') return base.filter(b => !b.status || b.status === 'pending' || b.status === 'unresolved');
    if (activeTab === 'resulted') return base.filter(b => b.status && b.status !== 'pending' && b.status !== 'unresolved');
    return base.filter(b => b.status === activeTab);
  }, [dateFilteredBets, activeTab, showScratched]);

  const tabStats = useMemo(() => calcRow(ledgerFilteredBets), [ledgerFilteredBets]);

  const sortedLedgerBets = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortCol === 'time') {
      console.log('[TimeSort] raw →', ledgerFilteredBets.map(b => ({
        horse: (b.horse_name || '').slice(0, 14),
        date: b.date,
        fromMap: raceTimeMap[b.id] ?? null,
        race_time: b.race_time ?? null,
        parsed: parseRaceTime(raceTimeMap[b.id] || b.race_time),
      })));
    }
    const sorted = [...ledgerFilteredBets].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'date':    va = a.date || ''; vb = b.date || ''; break;
        case 'horse':   va = (a.horse_name || '').toLowerCase(); vb = (b.horse_name || '').toLowerCase(); break;
        case 'venue':   va = (a.track || a.venue || '').toLowerCase(); vb = (b.track || b.venue || '').toLowerCase(); break;
        case 'race':    va = +(a.race_number ?? a.race_num ?? 0); vb = +(b.race_number ?? b.race_num ?? 0); break;
        case 'time': {
          const da = a.date || '', db = b.date || '';
          if (da !== db) return (da < db ? -1 : 1) * dir;
          va = parseRaceTime(raceTimeMap[a.id] || a.race_time);
          vb = parseRaceTime(raceTimeMap[b.id] || b.race_time);
          break;
        }
        case 'no':      va = +(a.tab_no || a.horse_number || 99); vb = +(b.tab_no || b.horse_number || 99); break;
        case 'stake':   va = +(a.stake || 0); vb = +(b.stake || 0); break;
        case 'odds':    va = +(a.odds || 0); vb = +(b.odds || 0); break;
        case 'pnl':     va = a.profit_loss ?? -Infinity; vb = b.profit_loss ?? -Infinity; break;
        case 'result':  va = +(a.position || 99); vb = +(b.position || 99); break;
        default:        va = a.date || ''; vb = b.date || '';
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    if (sortCol === 'time') {
      console.log('[TimeSort] sorted →', sorted.map(b => ({
        horse: (b.horse_name || '').slice(0, 14),
        date: b.date,
        parsed: parseRaceTime(raceTimeMap[b.id] || b.race_time),
      })));
    }
    return sorted;
  }, [ledgerFilteredBets, sortCol, sortDir, raceTimeMap]);

  const exportCSV = useCallback(() => {
    const headers = ['Date','Venue','R#','Time','Tab','Horse','Type','Stake','Odds','P&L','Result'];
    const csvRows = sortedLedgerBets.map(b => {
      const hasPnl = b.profit_loss !== null && b.profit_loss !== undefined;
      const isEW = (b.bet_type || '').toLowerCase().includes('each');
      const pnl = hasPnl ? b.profit_loss : (b.return_amt || 0) - (isEW ? (b.stake || 0) * 2 : (b.stake || 0));
      const isPending = !b.status || b.status === 'pending';
      const raceNum = b.race_number ?? b.race_num;
      return [
        b.date || '',
        b.track || b.venue || '',
        raceNum ? `R${raceNum}` : '',
        raceTimeMap[b.id] || b.race_time || '',
        b.tab_no || b.horse_number || '',
        b.horse_name || '',
        b.bet_type || '',
        (+(b.stake || 0)).toFixed(2),
        Number(b.odds || 0).toFixed(2),
        isPending ? '' : (pnl >= 0 ? '+' : '') + pnl.toFixed(2),
        isPending ? 'pending' : b.status || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mybets_${dateRange}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [sortedLedgerBets, dateRange, raceTimeMap]);

  const nextRaces = useMemo(() => {
    const nowDate = new Date(now);
    const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();
    const nowSecs = nowDate.getSeconds();
    return bets
      .filter(b => b.date === todayISO)
      .map(b => {
        const t = raceTimeMap[b.id] || b.race_time;
        const timeMins = parseRaceTimeStr(t);
        if (timeMins === null) return null;
        const secsToRace = (timeMins - nowMins) * 60 - nowSecs;
        if (secsToRace < -240) return null;
        const rawV = (b.track || b.venue || '').toUpperCase().trim();
        const normed = normaliseVenue(rawV);
        const abbr = normed.split(/\s+/).map(w => w.slice(0, 3)).join(' ');
        return { id: b.id, horse: b.horse_name || '—', odds: b.odds, abbr, timeMins, secsToRace };
      })
      .filter(Boolean)
      .sort((a, b) => a.timeMins - b.timeMins);
  }, [bets, raceTimeMap, now, todayISO]);

  const fmtPanelCd = secs => {
    if (secs >= 3600) { const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60); return { text:m?`${h}h ${m}m`:`${h}h`, color:'#9ca3af', bold:false }; }
    if (secs > 600)   return { text:`${Math.ceil(secs/60)}m`, color:'#9ca3af', bold:false };
    if (secs > 0)     return { text:`${Math.ceil(secs/60)}m`, color:'#4ade80', bold:true };
    const e=Math.abs(secs), m=Math.floor(e/60), s=e%60;
    return { text:m>0?`-${m}m ${s}s`:`-${s}s`, color:'#f87171', bold:true };
  };


  const leakFinderCards = useMemo(() => {
    if (resultedBets.length < 5) return [];
    const calcROI = arr => {
      const staked = arr.reduce((s, b) => s + (b.stake || 0), 0);
      const pnl = arr.reduce((s, b) => {
        if (b.profit_loss !== null && b.profit_loss !== undefined) return s + b.profit_loss;
        return s + (b.return_amt || 0) - (b.stake || 0);
      }, 0);
      return staked > 0 ? Math.round(pnl / staked * 1000) / 10 : null;
    };
    const cards = [];
    const bands = [['$1–$2',1,2],['$2–$4',2,4],['$4–$6',4,6],['$6–$8',6,8],['$8+',8,Infinity]];
    const bandStats = bands.flatMap(([label,lo,hi]) => {
      const arr = resultedBets.filter(b => { const o=+(b.odds||0); return o>=lo&&o<hi; });
      if (arr.length < 5) return [];
      const roi = calcROI(arr);
      return roi !== null ? [{ label, roi, count: arr.length }] : [];
    });
    if (bandStats.length > 0) {
      const worst = [...bandStats].sort((a,b) => a.roi - b.roi)[0];
      if (worst.roi < 0) cards.push({ leak: true, insight: `${worst.label} odds are costing you`, stat: `${worst.count} bets · ${worst.roi}% ROI` });
      const best = [...bandStats].sort((a,b) => b.roi - a.roi)[0];
      if (best.roi > 0 && best.label !== worst.label) cards.push({ leak: false, insight: `${best.label} odds are your edge`, stat: `${best.count} bets · +${best.roi}% ROI` });
    }
    const venueMap = {};
    resultedBets.forEach(b => { const v=b.track||b.venue; if(v){if(!venueMap[v])venueMap[v]=[]; venueMap[v].push(b);} });
    const venueStats = Object.entries(venueMap).filter(([,a]) => a.length >= 3).map(([v,a]) => ({ venue: v, roi: calcROI(a), count: a.length })).filter(s => s.roi !== null);
    if (venueStats.length > 0) {
      const worst = [...venueStats].sort((a,b) => a.roi - b.roi)[0];
      if (worst.roi < 0) cards.push({ leak: true, insight: `${worst.venue} is your weakest venue`, stat: `${worst.count} bets · ${worst.roi}% ROI` });
    }
    return cards.slice(0, 3);
  }, [resultedBets]);

  if (isPro === false) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProfileRail />
        <main className="mob-page" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <i className="ti ti-lock" style={{ fontSize: 48, color: '#d1d5db', display: 'block', marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Track your bets with Pro</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Log every bet and track your P&amp;L and ROI with a Pro subscription.</div>
            <button onClick={() => setUpgradeOpen(true)} style={{ padding: '10px 24px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Start free trial
            </button>
          </div>
        </main>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </div>
    );
  }

  const inp = { fontSize: 11, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 5, color: '#111827', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' };
  const inpIL = { fontSize: 11, padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 4, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' };

  const renderHeroDot = ({ cx, cy, payload }) => {
    if (cx == null || cy == null) return null;
    const c = payload?.status === 'win' ? '#1D9E75' : payload?.status === 'loss' ? '#E24B4A' : '#6366f1';
    return <circle key={`hd-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={c} stroke="#fff" strokeWidth={1.5} />;
  };
  const renderMobileSparkDot = ({ cx, cy, payload }) => {
    if (cx == null || cy == null) return null;
    const c = payload?.status === 'win' ? '#1D9E75' : payload?.status === 'loss' ? '#E24B4A' : '#6366f1';
    return <circle key={`msd-${cx}-${cy}`} cx={cx} cy={cy} r={2.5} fill={c} stroke="#fff" strokeWidth={1} />;
  };

  // Race-has-passed check for Quick Log — recalculated every second via `now`
  const qlAestNow = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
  const qlAestDateISO = `${qlAestNow.getFullYear()}-${String(qlAestNow.getMonth()+1).padStart(2,'0')}-${String(qlAestNow.getDate()).padStart(2,'0')}`;
  const qlAestMins = qlAestNow.getHours() * 60 + qlAestNow.getMinutes();
  const qlRaceMins = parseRaceTime(qlRaceTime);
  const qlRaceDate = (raceDate && raceDate >= qlAestDateISO) ? raceDate : qlAestDateISO;
  const raceHasPassed = !!qlRaceTime && isFinite(qlRaceMins) &&
    qlRaceDate === qlAestDateISO && qlRaceMins <= qlAestMins;
  const qlBtnDisabled = qlSaving || raceHasPassed || !qlHorse.trim() || !(+qlStake > 0) || !(+qlOdds > 1);

  const sbPnl = tabStats.pnl;
  const sbPnlPos = sbPnl !== null && sbPnl >= 0;
  const sbPnlColor = sbPnl === null ? '#9ca3af' : sbPnlPos ? '#0F6E56' : '#dc2626';
  const _rl = { today: "Today's P&L", yesterday: "Yesterday's P&L", this_week: "This Week's P&L", this_month: "This Month's P&L", all_time: "All-Time P&L", custom: "Period P&L" };
  const sbPeriodLabel = activeTab !== 'all'
    ? `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} P&L`
    : _rl[dateRange] || "P&L";
  const sbStreakLabel = heroStreak ? `${heroStreak.type}${heroStreak.count}` : '—';
  const sbStreakColor = heroStreak?.type === 'W' ? '#059669' : heroStreak?.type === 'L' ? '#dc2626' : '#9ca3af';
  const nextBetsPanel = null;

  return (
    <div className="mob-page" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail>
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Log a Bet</div>
          {csvMeetings.length > 0 ? (
            <select value={qlMeeting} onChange={e => { setQlMeeting(e.target.value); setQlRace(''); setQlHorse(''); setQlOdds(''); setQlTab(''); }} style={{ ...inp, marginBottom: 5 }}>
              <option value="">Meeting…</option>
              {csvMeetings.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input value={qlMeeting} onChange={e => setQlMeeting(e.target.value)} placeholder="Track…" style={{ ...inp, marginBottom: 5 }} />
          )}
          <select value={qlRace} onChange={e => { setQlRace(e.target.value); setQlHorse(''); setQlOdds(''); setQlTab(''); }} style={{ ...inp, marginBottom: 5 }}>
            <option value="">Race…</option>
            {csvRaceOptions.length > 0
              ? csvRaceOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)
              : Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>R{n}</option>)}
          </select>
          {csvHorses.length > 0 ? (
            <select value={qlHorse} onChange={e => { const h = csvHorses.find(x => x.name === e.target.value); setQlHorse(e.target.value); if (h?.odds) setQlOdds(h.odds.toFixed(2)); setQlTab(h?.tab ? String(h.tab) : ''); }} style={{ ...inp, marginBottom: 5 }}>
              <option value="">Horse…</option>
              {csvHorses.map(h => <option key={h.name} value={h.name}>{h.tab ? `${h.tab}. ` : ''}{h.name}{h.odds ? ` ($${h.odds.toFixed(1)})` : ''}</option>)}
            </select>
          ) : (
            <input value={qlHorse} onChange={e => setQlHorse(e.target.value)} placeholder="Horse *" style={{ ...inp, marginBottom: 5 }} />
          )}
          <select value={qlBetType} onChange={e => setQlBetType(e.target.value)} style={{ ...inp, marginBottom: 5 }}>
            <option value="win">Win</option>
            <option value="place">Place</option>
            <option value="each-way">E/W</option>
          </select>
          <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
            <input value={qlStake} onChange={e => setQlStake(e.target.value)} type="number" placeholder="$Stake" min="0.01" step="0.01" style={{ ...inp, flex: 1 }} />
            <input value={qlOdds} onChange={e => setQlOdds(e.target.value)} type="number" placeholder="$Odds" min="1.01" step="0.01" style={{ ...inp, flex: 1 }} />
          </div>
          <select value={qlBookmaker} onChange={e => setQlBookmaker(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
            {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button
            onClick={handleQuickLog}
            disabled={qlBtnDisabled}
            style={{ width: '100%', padding: '7px 0', background: raceHasPassed ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: qlBtnDisabled ? 'default' : 'pointer', opacity: qlBtnDisabled ? 0.6 : 1 }}
          >
            {qlSaving ? '…' : 'Save Bet'}
          </button>
          {qlToast && (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, textAlign: 'center', color: qlToast === 'success' ? '#059669' : '#dc2626' }}>
              {qlToast === 'success' ? '✓ Logged' : '✗ Failed'}
            </div>
          )}
        </div>
      </ProfileRail>

      {/* ── Main content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f3f4f6' }}>

        {/* 3-COLUMN SCOREBOARD HEADER */}
        <div style={{ flexShrink: 0, display: 'flex', background: '#fff', borderBottom: '1px solid #e5e7eb', minHeight: isMobile ? 68 : 120 }}>

          {/* Col 1 — P&L + record + streak */}
          <div style={{ flex: 1, padding: isMobile ? '8px 12px' : '12px 18px', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em' }}>{sbPeriodLabel}</div>
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, fontFamily: 'monospace', color: sbPnlColor, lineHeight: 1 }}>
              {sbPnl === null ? '—' : (sbPnlPos ? '+$' : '-$') + Math.abs(sbPnl).toFixed(2)}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151', letterSpacing: '.04em', marginTop: 2 }}>{heroRecord}</div>
            {heroStreak && (
              <div style={{ fontSize: 11, fontWeight: 700, color: sbStreakColor }}>{sbStreakLabel} streak</div>
            )}
          </div>

          {/* Col 2 — Cumulative chart (desktop only) */}
          {!isMobile && (
            <div style={{ flex: 1, borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
              {heroChartData.length > 1 ? (() => {
                const finalPnl = heroChartData[heroChartData.length - 1].pnl;
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={heroChartData} margin={{ top: 8, right: 8, bottom: 4, left: 32 }}>
                      <defs>
                        <linearGradient id="heroFill3c" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={finalPnl >= 0 ? '#1D9E75' : '#E24B4A'} stopOpacity={0.18} />
                          <stop offset="95%" stopColor={finalPnl >= 0 ? '#1D9E75' : '#E24B4A'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#9ca3af' }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} width={32} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                            <div style={{ color: '#6b7280', marginBottom: 2 }}>{d.horse}</div>
                            <div style={{ fontWeight: 700, fontFamily: 'monospace', color: d.pnl >= 0 ? '#1D9E75' : '#E24B4A' }}>{d.pnl >= 0 ? '+$' : '-$'}{Math.abs(d.pnl).toFixed(2)}</div>
                          </div>
                        );
                      }} />
                      <Area type="monotone" dataKey="pnl" stroke={finalPnl >= 0 ? '#1D9E75' : '#E24B4A'} fill="url(#heroFill3c)" strokeWidth={2} dot={renderHeroDot} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                );
              })() : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db', fontSize: 11 }}>No data yet</div>
              )}
            </div>
          )}

          {/* Col 3 — Stat grid (desktop only) */}
          {!isMobile && (
            <div style={{ flex: 1, padding: '12px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
              {[
                { label: 'Strike',   value: dateStats.strike },
                { label: 'Staked',   value: dateStats.staked },
                { label: 'ROI',      value: dateStats.roi, color: parseFloat(dateStats.roi) > 0 ? '#059669' : parseFloat(dateStats.roi) < 0 ? '#dc2626' : '#374151' },
                { label: 'Avg Odds', value: avgOdds },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: color || '#111827' }}>{value}</span>
                </div>
              ))}
            </div>
          )}

        </div>


        {/* DATE RANGE SWITCHER */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, margin: '6px 8px 0', ...(isMobile ? { overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' } : { flexWrap: 'wrap' }) }}>
          {[['today','Today'],['yesterday','Yesterday'],['this_week','This Week'],['this_month','This Month'],['all_time','All Time'],['custom','Custom']].map(([v,l]) => (
            <button key={v} onClick={() => setDateRange(v)}
              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
                background: dateRange === v ? '#00471b' : '#f3f4f6', color: dateRange === v ? '#fff' : '#374151' }}>
              {l}
            </button>
          ))}
          {dateRange === 'custom' && (<>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ fontSize: 10, padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 4, color: '#374151' }} />
            <span style={{ fontSize: 10, color: '#9ca3af' }}>–</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ fontSize: 10, padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 4, color: '#374151' }} />
          </>)}
        </div>

        {/* TAB BAR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, flexShrink: 0, gap: 8, margin: '4px 8px 6px' }}>
          <div style={{ display: 'flex', gap: 4, ...(isMobile && { flex: 1 }) }}>
            {[['ledger', 'Ledger'], ['charts', 'Charts']].map(([v, l]) => (
              <button key={v} onClick={() => setMainTab(v)}
                style={{ padding: '4px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: mainTab === v ? '#00471b' : '#f3f4f6', color: mainTab === v ? '#fff' : '#111827',
                  ...(isMobile && { flex: 1, textAlign: 'center' }) }}>
                {l}
              </button>
            ))}
          </div>
          {mainTab === 'ledger' && !isMobile && (
            <div style={{ display: 'flex', gap: 4 }}>
              {[['table', 'Table'], ['terminal', 'Terminal'], ['sessions', 'Sessions'], ['kanban', 'Kanban']].map(([v, l]) => (
                <button key={v} onClick={() => setBetView(v)}
                  style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: betView === v ? '#374151' : '#f3f4f6', color: betView === v ? '#fff' : '#374151' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {mainTab === 'ledger' && (<>

        {/* MOBILE: filter pills + mobile table */}
        {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: '6px 10px', background: '#0D1C13', borderBottom: '1px solid #1a3a25' }}>
            {['All','Win','Place','Loss','Upcoming','Resulted'].map(t => {
              const key = t.toLowerCase();
              return (
                <button key={t} onClick={() => setActiveTab(key)}
                  style={{ padding: '8px 12px', fontSize: 11, fontWeight: activeTab === key ? 700 : 400,
                    color: activeTab === key ? '#0B1F14' : '#fff',
                    background: activeTab === key ? '#4ade80' : 'transparent',
                    border: activeTab === key ? 'none' : '1px solid #1a3a25',
                    borderRadius: 3, cursor: 'pointer' }}>
                  {t} ({tabCounts[key] ?? 0})
                </button>
              );
            })}
          </div>
          <div style={{ background: '#11241A' }}>
            <div style={{ padding: '4px 10px', fontSize: 9, color: '#fff', borderBottom: '1px solid #1a3a25' }}>
              Horse name stays fixed · swipe right for more →
            </div>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#fff', fontSize: 11 }}>Loading…</div>
            ) : sortedLedgerBets.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#fff', fontSize: 11 }}>No bets for this period</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#0D1C13' }}>
                      {(() => {
                        const thBase = { padding: '6px 8px', fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase', border: '1px solid #1a3a25', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
                        const mkSort = (col) => () => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };
                        const ind = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                        return (<>
                          <th onClick={mkSort('horse')} style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, background: '#0D1C13' }}>
                            <div style={{ width: 94, whiteSpace: 'nowrap' }}>Horse{ind('horse')}</div>
                          </th>
                          {[['Venue','left','venue',110],['R#','right','race',36],['Time','right','time',72],['No','right','no',30],['Stake','right','stake',54],['Odds','right','odds',54],['P&L','right','pnl',70],['Result','right','result',50],['Margin','right','margin',60]].map(([h, align, col, mw]) => (
                            <th key={h} onClick={mkSort(col)} style={{ ...thBase, textAlign: align, minWidth: mw }}>{h}{ind(col)}</th>
                          ))}
                          <th style={{ ...thBase, width: 32, cursor: 'default', textAlign: 'center' }}>···</th>
                        </>);
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const pinned = sortedLedgerBets.filter(b => b.date === todayISO && (!b.status || b.status === 'pending'));
                      const rest = sortedLedgerBets.filter(b => !(b.date === todayISO && (!b.status || b.status === 'pending')));
                      const items = pinned.length > 0 && rest.length > 0 ? [...pinned, null, ...rest] : sortedLedgerBets;
                      return items.map((b, idx) => {
                        if (b === null) return (
                          <tr key="mob-pending-divider"><td colSpan={11} style={{ height: 2, background: '#2d5a3d', padding: 0 }} /></tr>
                        );
                        const pnl = computePnl(b);
                        const hasPnl = pnl !== null;
                        const pos = b.position;
                        const isPending = !b.status || b.status === 'pending';
                        const isUnresolved = b.status === 'unresolved';
                        const isScratched = b.status === 'scratched';
                        const isAbandoned = b.status === 'abandoned';
                        const FF_DISP = ['FF','BD','UR','PU','DNF','DISQ','NP','FELL','REF'];
                        const isFF = b.status === 'loss' && b.margin && FF_DISP.includes((b.margin || '').toUpperCase());
                        const pnlColor = !hasPnl || isPending || isUnresolved || isAbandoned ? '#6b7280' : pnl >= 0 ? '#4ade80' : '#f87171';
                        const resultColor = pos === 1 ? '#4ade80' : (pos === 2 || pos === 3) ? '#60a5fa' : '#f87171';
                        const raceNum = b.race_number ?? b.race_num;
                        const venue = b.track || b.venue || '—';
                        const cs = { border: '1px solid #1a3a25', padding: '5px 8px', whiteSpace: 'nowrap' };
                        return (
                          <tr key={b.id}>
                            <td style={{ ...cs, position: 'sticky', left: 0, zIndex: 1, background: '#11241A' }}>
                              <div style={{ width: 94, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</div>
                            </td>
                            <td style={{ ...cs, color: '#fff', whiteSpace: 'nowrap' }}>{venue}</td>
                            <td style={{ ...cs, color: '#fff', textAlign: 'right', whiteSpace: 'nowrap' }}>{raceNum ? `R${raceNum}` : '—'}</td>
                            <td style={{ ...cs, color: '#fff', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{(() => { const t = raceTimeMap[b.id] || b.race_time; if (!t) return '—'; if (isPending && b.date === todayISO) { const d = new Date(now); const rem = parseRaceTime(t) - (d.getHours() * 60 + d.getMinutes()); if (rem > 0 && isFinite(rem)) { const h = Math.floor(rem / 60); const m = rem % 60; const cd = h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`; return <>{t} <span style={{ color: rem < 10 ? '#4ade80' : '#9ca3af', fontWeight: 700, fontSize: 9 }}>({cd})</span></>; } } return t; })()}</td>
                            <td style={{ ...cs, color: '#fff', textAlign: 'right', whiteSpace: 'nowrap' }}>{b.tab_no || b.horse_number || '—'}</td>
                            <td style={{ ...cs, color: '#fff', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>${(+(b.stake || 0)).toFixed(0)}</td>
                            <td style={{ ...cs, color: '#fff', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>${Number(b.odds || 0).toFixed(2)}</td>
                            <td style={{ ...cs, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: pnlColor, whiteSpace: 'nowrap' }}>
                              {isPending || isUnresolved || isAbandoned ? '—' : hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—'}
                            </td>
                            <td style={{ ...cs, textAlign: 'right', fontWeight: 700, color: isAbandoned ? '#6b7280' : isUnresolved ? '#6b7280' : isPending ? '#f97316' : isScratched ? '#6b7280' : isFF ? '#f87171' : (pos ? resultColor : '#6b7280'), whiteSpace: 'nowrap' }}>
                              {isAbandoned ? 'ABND' : isUnresolved ? 'NR' : isPending ? 'PND' : isScratched ? 'SCR' : isFF ? (b.margin || 'FF') : pos ? String(pos) : '—'}
                            </td>
                            <td style={{ ...cs, textAlign: 'right', color: '#9ca3af', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {isFF ? '—' : b.margin || '—'}
                            </td>
                            <td style={{ ...cs, textAlign: 'center', padding: '2px 4px', width: 32 }}>
                              <button onClick={() => { setMobileMenuId(b.id); setEditStake(String(b.stake || '')); setEditOdds(String(b.odds || '')); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', padding: '1px 4px', lineHeight: 1 }}>⋯</button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}

        {/* DESKTOP: full-width table */}
        {!isMobile && (

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {betView === 'table' && (<>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#0D1C13', borderBottom: '1px solid #1a3a25' }}>
                {['All','Win','Place','Loss','Upcoming','Resulted'].map(t => {
                  const key = t.toLowerCase();
                  return (
                    <button key={t} onClick={() => setActiveTab(key)}
                      style={{ padding: '2px 8px', fontSize: 9, fontWeight: activeTab === key ? 700 : 400,
                        color: activeTab === key ? '#0B1F14' : '#fff',
                        background: activeTab === key ? '#4ade80' : 'transparent',
                        border: activeTab === key ? 'none' : '1px solid #1a3a25',
                        borderRadius: 3, cursor: 'pointer' }}>
                      {t} ({tabCounts[key] ?? 0})
                    </button>
                  );
                })}
                <button onClick={exportCSV} title="Export CSV" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 9, fontWeight: 600, cursor: 'pointer', border: '1px solid #4ade80', background: 'transparent', color: '#4ade80', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <i className="ti ti-download" style={{ fontSize: 11 }} /> CSV
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <div style={{ background: '#11241A', minWidth: 600 }}>
                {(() => {
                  const thBase = { padding: '5px 6px', fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase', border: '1px solid #1a3a25', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
                  const mkSort = (col) => () => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };
                  const ind = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ background: '#0D1C13' }}>
                          {[['Date','left','date',48],['Venue','left','venue',76],['R#','right','race',26],['Time','right','time',62],['No','right','no',20],['Horse','left','horse',106],['Stake','right','stake',42],['Odds','right','odds',42],['P&L','right','pnl',62],['Result','right','result',38],['Margin','right','margin',48]].map(([h, align, col, mw]) => (
                            <th key={h} onClick={mkSort(col)} style={{ ...thBase, textAlign: align, minWidth: mw }}>{h}{ind(col)}</th>
                          ))}
                          <th style={{ ...thBase, width: 44, cursor: 'default' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: '#fff', fontSize: 11 }}>Loading…</td></tr>
                        ) : sortedLedgerBets.length === 0 ? (
                          <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: '#fff', fontSize: 11 }}>No bets for this period</td></tr>
                        ) : (() => {
                          const pinned = sortedLedgerBets.filter(b => b.date === todayISO && (!b.status || b.status === 'pending'));
                          const rest = sortedLedgerBets.filter(b => !(b.date === todayISO && (!b.status || b.status === 'pending')));
                          const items = pinned.length > 0 && rest.length > 0 ? [...pinned, null, ...rest] : sortedLedgerBets;
                          return items.map((b, idx) => {
                            if (b === null) return (
                              <tr key="desk-pending-divider"><td colSpan={12} style={{ height: 2, background: '#2d5a3d', padding: 0 }} /></tr>
                            );
                            const pnl = computePnl(b);
                            const hasPnl = pnl !== null;
                            const pos = b.position;
                            const isPending = !b.status || b.status === 'pending';
                            const isUnresolved = b.status === 'unresolved';
                            const isScratched = b.status === 'scratched';
                            const isAbandoned = b.status === 'abandoned';
                            const FF_DISP = ['FF','BD','UR','PU','DNF','DISQ','NP','FELL','REF'];
                            const isFF = b.status === 'loss' && b.margin && FF_DISP.includes((b.margin || '').toUpperCase());
                            const pnlColor = !hasPnl || isPending || isUnresolved || isAbandoned ? '#6b7280' : pnl >= 0 ? '#4ade80' : '#f87171';
                            const raceNum = b.race_number ?? b.race_num;
                            const venue = b.track || b.venue || '—';
                            const cs = { border: '1px solid #1a3a25', padding: '4px 6px', whiteSpace: 'nowrap' };
                            const raceT = raceTimeMap[b.id] || b.race_time;
                            const raceMinsCD = parseRaceTime(raceT);
                            const nowD = new Date(now);
                            const nowMinsCD = nowD.getHours() * 60 + nowD.getMinutes();
                            const secsToRace = isFinite(raceMinsCD) ? (raceMinsCD - nowMinsCD) * 60 - nowD.getSeconds() : null;
                            const isImminent = isPending && b.date === todayISO && secsToRace !== null && secsToRace < 900 && secsToRace > -240;
                            const isEditing = editingId === b.id;
                            const isHovered = hoveredId === b.id;
                            const isLocked  = b.date < todayISO || (secsToRace !== null && secsToRace <= 0);
                            const rowBg = isImminent ? 'rgba(251,191,36,0.10)' : 'transparent';
                            return (
                              <tr key={b.id}
                                style={{ background: rowBg }}
                                onMouseEnter={e => { e.currentTarget.style.background = isImminent ? 'rgba(251,191,36,0.18)' : '#1a3a25'; setHoveredId(b.id); }}
                                onMouseLeave={e => { e.currentTarget.style.background = rowBg; setHoveredId(null); }}>
                                <td style={{ ...cs, color: '#fff' }}>{fmtDate(b.date)}</td>
                                <td style={{ ...cs, color: '#fff', maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue}</td>
                                <td style={{ ...cs, color: '#fff', textAlign: 'right' }}>{raceNum ? `R${raceNum}` : '—'}</td>
                                <td style={{ ...cs, color: '#fff', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {(() => {
                                    if (!raceT) return '—';
                                    if (isPending && b.date === todayISO && secsToRace !== null && secsToRace > -240) {
                                      if (secsToRace > 0) {
                                        const remMins = Math.ceil(secsToRace / 60);
                                        const cdStr = remMins >= 60 ? `${Math.floor(remMins/60)}h${remMins%60?remMins%60+'m':''}` : `${remMins}m`;
                                        return <>{raceT} <span style={{ color: secsToRace < 900 ? '#4ade80' : '#9ca3af', fontWeight: 700, fontSize: 9 }}>({cdStr})</span></>;
                                      }
                                      return <>{raceT} <span style={{ color: '#f87171', fontWeight: 700, fontSize: 9 }}>(-{Math.floor(Math.abs(secsToRace)/60)}m)</span></>;
                                    }
                                    return raceT;
                                  })()}
                                </td>
                                <td style={{ ...cs, color: '#fff', textAlign: 'right' }}>{b.tab_no || b.horse_number || '—'}</td>
                                <td style={{ ...cs, color: '#fff', fontWeight: 600, maxWidth: 106, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</td>
                                <td style={{ ...cs, color: '#fff', textAlign: 'right', fontFamily: 'monospace' }}>
                                  {isEditing && !isLocked ? <input type="number" value={editStake} onChange={e => setEditStake(e.target.value)} style={{ width: 40, fontSize: 10, textAlign: 'right', border: '1px solid #4ade80', background: '#1a3a25', color: '#fff', borderRadius: 3, padding: '1px 3px' }} /> : `$${(+(b.stake || 0)).toFixed(0)}`}
                                </td>
                                <td style={{ ...cs, color: '#fff', textAlign: 'right', fontFamily: 'monospace' }}>
                                  {isEditing && !isLocked ? <input type="number" value={editOdds} onChange={e => setEditOdds(e.target.value)} style={{ width: 40, fontSize: 10, textAlign: 'right', border: '1px solid #4ade80', background: '#1a3a25', color: '#fff', borderRadius: 3, padding: '1px 3px' }} /> : `$${Number(b.odds || 0).toFixed(2)}`}
                                </td>
                                <td style={{ ...cs, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: pnlColor, whiteSpace: 'nowrap' }}>
                                  {isPending || isUnresolved || isAbandoned ? '—' : hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—'}
                                </td>
                                <td style={{ ...cs, textAlign: 'right', fontWeight: 700, color: isAbandoned ? '#6b7280' : isUnresolved ? '#6b7280' : isPending ? '#f97316' : isScratched ? '#6b7280' : isFF ? '#f87171' : (pos === 1 ? '#4ade80' : (pos === 2 || pos === 3) ? '#60a5fa' : pos ? '#f87171' : '#6b7280') }}>
                                  {isAbandoned ? 'ABND' : isUnresolved ? 'NR' : isPending ? 'PND' : isScratched ? 'SCR' : isFF ? (b.margin || 'FF') : pos ? String(pos) : '—'}
                                </td>
                                <td style={{ ...cs, textAlign: 'right', color: '#9ca3af', fontFamily: 'monospace' }}>
                                  {isFF ? '—' : b.margin || '—'}
                                </td>
                                <td style={{ ...cs, textAlign: 'center', padding: '2px 4px', width: 48 }}>
                                  {isEditing && !isLocked ? (
                                    <span style={{ display: 'inline-flex', gap: 3 }}>
                                      <button onClick={() => handleEditSave(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', padding: 2, lineHeight: 1 }}><i className="ti ti-check" style={{ fontSize: 13 }} /></button>
                                      <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2, lineHeight: 1 }}><i className="ti ti-x" style={{ fontSize: 13 }} /></button>
                                    </span>
                                  ) : !isLocked && isHovered ? (
                                    <span style={{ display: 'inline-flex', gap: 3 }}>
                                      <button onClick={() => { setEditingId(b.id); setEditStake(String(b.stake || '')); setEditOdds(String(b.odds || '')); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, lineHeight: 1 }}><i className="ti ti-pencil" style={{ fontSize: 12 }} /></button>
                                      <button onClick={() => handleDeleteBet(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2, lineHeight: 1 }}><i className="ti ti-trash" style={{ fontSize: 12 }} /></button>
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              </div>
            </>)}

            {betView === 'terminal' && (
              <div style={{ display:'flex', flexDirection:'column' }}>
                <div style={{ flexShrink:0, display:'flex', gap:4, padding:'6px 10px', background:'#0f1117', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                  {['All','Win','Place','Loss','Upcoming','Resulted'].map(t => { const key = t.toLowerCase(); return (
                    <button key={t} onClick={() => setActiveTab(key)}
                      style={{ padding:'2px 8px', fontSize:9, fontWeight: activeTab===key?700:400, color: activeTab===key?'#0B1F14':'#fff', background: activeTab===key?'#4ade80':'transparent', border: activeTab===key?'none':'1px solid #1a3a25', borderRadius:3, cursor:'pointer' }}>
                      {t}
                    </button>
                  ); })}
                </div>
                <div style={{ background:'#0f1117', padding:12 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                      {['Date','Horse','Venue · R#','Rank','Odds','Stake','P&L','Result'].map(h => (
                        <th key={h} style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#475569', textAlign: h==='P&L'||h==='Odds'||h==='Stake' ? 'right' : h==='Rank'||h==='Result' ? 'center' : 'left', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerFilteredBets.map(b => {
                      const pnl = b.profit_loss !== null && b.profit_loss !== undefined ? b.profit_loss : b.status==='win'||b.status==='place' ? +(b.stake||0)*(+(b.odds||0)-1) : -(+(b.stake||0));
                      const isWin = b.status==='win'||b.status==='place';
                      return (
                        <tr key={b.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', borderLeft:`3px solid ${isWin?'#22c55e':b.status==='pending'?'#f59e0b':'#ef4444'}` }}>
                          <td style={{ padding:'4px 6px', color:'#475569', fontSize:10 }}>{b.date?.slice(5).replace('-','/')}</td>
                          <td style={{ padding:'4px 6px', color:'#f1f5f9', fontWeight:600, fontSize:11 }}>{b.horse_name}</td>
                          <td style={{ padding:'4px 6px', color:'#64748b', fontSize:10 }}>{(b.track||b.venue||'').toUpperCase()} · R{b.race_number||b.race_num}</td>
                          <td style={{ padding:'4px 6px', textAlign:'center' }}>
                            {b.rank ? <span style={{ background: b.rank===1?'#fbbf24':b.rank===2?'#d1d5db':b.rank===3?'#cd7f32':'#374151', color: b.rank<=3?'#78350f':'#fff', width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700 }}>R{b.rank}</span> : <span style={{ color:'#475569' }}>—</span>}
                          </td>
                          <td style={{ padding:'4px 6px', textAlign:'right', color:'#94a3b8', fontFamily:'monospace', fontSize:10 }}>${(+(b.odds||0)).toFixed(2)}</td>
                          <td style={{ padding:'4px 6px', textAlign:'right', color:'#64748b', fontSize:10 }}>${b.stake}</td>
                          <td style={{ padding:'4px 6px', textAlign:'right', fontWeight:700, fontSize:11, color: isWin?'#4ade80':'#f87171' }}>{pnl>=0?'+$':'-$'}{Math.abs(pnl).toFixed(2)}</td>
                          <td style={{ padding:'4px 6px', textAlign:'center' }}>
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background: b.status==='win'?'#166534':b.status==='place'?'#1e40af':b.status==='pending'?'#92400e':'#991b1b', color:'#fff' }}>{(b.status||'PENDING').toUpperCase()}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {betView === 'sessions' && (
              <div style={{ display:'flex', flexDirection:'column' }}>
                <div style={{ flexShrink:0, display:'flex', gap:4, padding:'6px 10px', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
                  {['All','Win','Place','Loss','Upcoming','Resulted'].map(t => { const key = t.toLowerCase(); return (
                    <button key={t} onClick={() => setActiveTab(key)}
                      style={{ padding:'2px 8px', fontSize:9, fontWeight: activeTab===key?700:400, color: activeTab===key?'#fff':'#374151', background: activeTab===key?'#374151':'#f3f4f6', border:'none', borderRadius:3, cursor:'pointer' }}>
                      {t}
                    </button>
                  ); })}
                </div>
                <div style={{ padding:12, background:'#f3f4f6' }}>
                {(() => {
                  const byDate = {};
                  ledgerFilteredBets.forEach(b => { if (!byDate[b.date]) byDate[b.date] = []; byDate[b.date].push(b); });
                  return Object.entries(byDate).sort(([a],[b]) => b.localeCompare(a)).map(([date, betsOnDay]) => {
                    const dayPnl = betsOnDay.reduce((sum,b) => {
                      if (b.profit_loss !== null && b.profit_loss !== undefined) return sum + b.profit_loss;
                      if (b.status==='win'||b.status==='place') return sum + +(b.stake||0)*(+(b.odds||0)-1);
                      if (b.status==='loss') return sum - +(b.stake||0);
                      return sum;
                    }, 0);
                    const wins = betsOnDay.filter(b=>b.status==='win'||b.status==='place').length;
                    return (
                      <div key={date} style={{ marginBottom:8, background:'#fff', borderRadius:8, overflow:'hidden', border:'0.5px solid #e5e7eb' }}>
                        <div style={{ padding:'6px 12px', background: dayPnl>=0?'#f0fdf4':'#fef2f2', display:'flex', alignItems:'center', gap:12 }}>
                          <span style={{ fontWeight:700, fontSize:11, color:'#111827' }}>{new Date(date + 'T00:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</span>
                          <span style={{ fontSize:10, color:'#6b7280' }}>{betsOnDay.length} bets · {wins} wins</span>
                          <span style={{ marginLeft:'auto', fontWeight:700, fontSize:11, color: dayPnl>=0?'#15803d':'#dc2626' }}>{dayPnl>=0?'+$':'-$'}{Math.abs(dayPnl).toFixed(2)}</span>
                        </div>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <tbody>
                            {betsOnDay.map(b => {
                              const pnl = b.profit_loss !== null && b.profit_loss !== undefined ? b.profit_loss : b.status==='win'||b.status==='place' ? +(b.stake||0)*(+(b.odds||0)-1) : -(+(b.stake||0));
                              const isWin = b.status==='win'||b.status==='place';
                              return (
                                <tr key={b.id} style={{ borderTop:'0.5px solid #f3f4f6', borderLeft:`3px solid ${isWin?'#22c55e':b.status==='pending'?'#f59e0b':'#ef4444'}` }}>
                                  <td style={{ padding:'4px 6px', fontSize:11, fontWeight:600, color:'#111827', width:'35%' }}>{b.horse_name}</td>
                                  <td style={{ padding:'4px 6px', fontSize:10, color:'#6b7280' }}>{(b.track||b.venue||'').toUpperCase()} R{b.race_number||b.race_num}</td>
                                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                                    {b.rank ? <span style={{ background: b.rank===1?'#fbbf24':'#d1d5db', color: b.rank===1?'#78350f':'#374151', width:16, height:16, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700 }}>R{b.rank}</span> : null}
                                  </td>
                                  <td style={{ padding:'4px 6px', textAlign:'right', fontSize:10, color:'#374151', fontFamily:'monospace' }}>${(+(b.odds||0)).toFixed(2)}</td>
                                  <td style={{ padding:'4px 6px', textAlign:'right', fontSize:10, color:'#6b7280' }}>${b.stake}</td>
                                  <td style={{ padding:'4px 6px', textAlign:'right', fontWeight:700, fontSize:11, color: isWin?'#15803d':'#dc2626' }}>{pnl>=0?'+$':'-$'}{Math.abs(pnl).toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
                </div>
              </div>
            )}

            {betView === 'kanban' && (
              <div style={{ padding:12, background:'#f3f4f6' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                  {[
                    { label:'Wins',    statuses:['win','place'], bg:'#f0fdf4', border:'#86efac', headerBg:'#dcfce7', textColor:'#166534' },
                    { label:'Losses',  statuses:['loss'],        bg:'#fff',    border:'#fca5a5', headerBg:'#fee2e2', textColor:'#991b1b' },
                    { label:'Pending', statuses:['pending'],     bg:'#fffbeb', border:'#fde047', headerBg:'#fef9c3', textColor:'#854d0e' },
                  ].map(col => {
                    const colBets = col.label === 'Pending'
                      ? dateFilteredBets.filter(b => !b.status || b.status === 'pending')
                      : ledgerFilteredBets.filter(b => col.statuses.includes(b.status));
                    const colPnl = colBets.reduce((sum,b) => {
                      const p = b.profit_loss !== null && b.profit_loss !== undefined ? b.profit_loss : b.status==='win'||b.status==='place' ? +(b.stake||0)*(+(b.odds||0)-1) : b.status==='loss' ? -(+(b.stake||0)) : 0;
                      return sum + p;
                    }, 0);
                    return (
                      <div key={col.label} style={{ background:col.bg, border:`1px solid ${col.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'6px 12px', background:col.headerBg, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontWeight:700, fontSize:11, color:col.textColor }}>{col.label}</span>
                          <span style={{ fontSize:10, color:col.textColor }}>{colBets.length} · {colPnl>=0?'+$':'-$'}{Math.abs(colPnl).toFixed(2)}</span>
                        </div>
                        <div style={{ padding:6, display:'flex', flexDirection:'column', gap:4, maxHeight:600, overflowY:'auto' }}>
                          {colBets.length===0 && <div style={{ padding:'12px', textAlign:'center', color:'#9ca3af', fontSize:10 }}>None</div>}
                          {colBets.map(b => (
                            <div key={b.id} style={{ background:'#fff', border:`0.5px solid ${col.border}`, borderRadius:5, padding:'5px 8px' }}>
                              <div style={{ fontWeight:600, fontSize:11, color:'#111827' }}>{b.horse_name}</div>
                              <div style={{ fontSize:9, color:'#6b7280', marginTop:1 }}>
                                {(b.track||b.venue||'').toUpperCase()} R{b.race_number||b.race_num} · ${b.stake} @ ${(+(b.odds||0)).toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!loading && sortedLedgerBets.length > 0 && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', background: '#0D1C13', borderTop: '1px solid #1a3a25' }}>
                <span style={{ fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>
                  {sortedLedgerBets.length} bets · {sortedLedgerBets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched' && b.status !== 'abandoned' && b.status !== 'unresolved').length} settled · {sortedLedgerBets.filter(b => b.status === 'abandoned').length} abandoned
                </span>
                {tabStats.pnl !== null && (
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: tabStats.pnl >= 0 ? '#4ade80' : '#f87171' }}>
                    {tabStats.pnl >= 0 ? '+$' : '-$'}{Math.abs(tabStats.pnl).toFixed(2)}
                  </span>
                )}
              </div>
            )}

          </div>
        )}

        </>)}

        {mainTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Chart type pills */}
            <div style={{ flexShrink: 0, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 4, ...(isMobile ? { overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' } : { flexWrap: 'wrap' }) }}>
              {[
                ['outcome',    'Outcome Split'],
                ['cumulative', 'Cumulative P&L'],
                ['odds',       'By Odds Range'],
                ['venue',      'By Venue'],
                ['condition',  'By Condition'],
                ['rank',       'By Model Rank'],
                ['streak',     'Form Streak'],
              ].map(([v, l]) => (
                <button key={v} onClick={() => setChartType(v)}
                  style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
                    background: chartType === v ? '#00471b' : '#f3f4f6', color: chartType === v ? '#fff' : '#374151' }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Chart card + edge zone */}
            <div style={{ padding: 12, background: '#f9fafb', display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '10px 12px' }}>
                {(() => {
                  const CG = '#1D9E75', CR = '#E24B4A', CB = '#3b82f6';
                  const MIN_SAMPLE = 5;

                  if (dateResulted.length === 0) {
                    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No resulted bets to chart yet</div>;
                  }

                  const calcGroupData = arr => {
                    const settled = arr.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched');
                    const wins = settled.filter(b => b.status === 'win').length;
                    const staked = settled.reduce((s, b) => s + (b.stake || 0), 0);
                    const ret = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
                    const pnl = settled.reduce((s, b) => {
                      if (b.profit_loss !== null && b.profit_loss !== undefined) return s + b.profit_loss;
                      return s + (b.return_amt || 0) - (b.stake || 0);
                    }, 0);
                    const roi = staked > 0 ? Math.round((pnl / staked * 100) * 10) / 10 : 0;
                    return { bets: settled.length, wins, pnl: Math.round(pnl * 100) / 100, roi, staked, smallSample: settled.length < MIN_SAMPLE };
                  };

                  /* ── 1. Outcome split (doughnut) ── */
                  if (chartType === 'outcome') {
                    const wins = dateResulted.filter(b => b.status === 'win').length;
                    const places = dateResulted.filter(b => b.status === 'place').length;
                    const losses = dateResulted.filter(b => b.status === 'loss').length;
                    const data = [{ name: 'Win', value: wins, color: CG }, { name: 'Place', value: places, color: CB }, { name: 'Loss', value: losses, color: CR }].filter(d => d.value > 0);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Outcome Split</div>
                        <ResponsiveContainer width="100%" height={204}>
                          <PieChart role="img" aria-label="Bet outcome split: win, place, loss">
                            <Pie data={data} innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip formatter={(v, n) => [v, n]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                          {data.map(d => (
                            <span key={d.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                              <span style={{ color: '#111827' }}>{d.name}</span>
                              <span style={{ fontWeight: 700, color: '#111827' }}>{d.value}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 2. Cumulative P&L (line) ── */
                  if (chartType === 'cumulative') {
                    const data = heroChartData;
                    const finalPnl = data.length ? data[data.length - 1].pnl : 0;
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Cumulative P&L</div>
                        <ResponsiveContainer width="100%" height={204} role="img" aria-label="Cumulative profit and loss over time">
                          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} />
                            <Tooltip formatter={v => [`$${v}`, 'P&L']} />
                            <Line type="monotone" dataKey="pnl" stroke={finalPnl >= 0 ? CG : CR} strokeWidth={2} dot={renderHeroDot} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    );
                  }

                  /* ── 3. By odds range (bar ROI%) ── */
                  if (chartType === 'odds') {
                    const bands = [['$1–$2', 1, 2], ['$2–$4', 2, 4], ['$4–$6', 4, 6], ['$6–$8', 6, 8], ['$8+', 8, Infinity]];
                    const data = bands.map(([label, lo, hi]) => { const arr = dateResulted.filter(b => { const o = +(b.odds || 0); return o >= lo && o < hi; }); return { label, ...calcGroupData(arr) }; });
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>ROI by Odds Range</div>
                        <ResponsiveContainer width="100%" height={204} role="img" aria-label="ROI percentage by odds range">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#111827' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#374151' }}>
                          {data.filter(d => d.bets > 0).map(d => (
                            <span key={d.label}><b>{d.label}</b> {d.bets}b · {d.smallSample ? <span style={{ color: '#9ca3af' }}>small sample</span> : <span style={{ color: d.roi >= 0 ? CG : CR, fontWeight: 700 }}>{d.roi >= 0 ? '+' : ''}{d.roi}%</span>}</span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 4. By venue (bar total P&L) ── */
                  if (chartType === 'venue') {
                    const venueMap = {};
                    dateResulted.forEach(b => { const v = b.track || b.venue || 'Unknown'; if (!venueMap[v]) venueMap[v] = []; venueMap[v].push(b); });
                    const data = Object.entries(venueMap).map(([label, arr]) => ({ label, ...calcGroupData(arr) })).sort((a, b) => b.bets - a.bets);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>P&L by Venue</div>
                        <ResponsiveContainer width="100%" height={204} role="img" aria-label="Total profit and loss by venue">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#111827' }} angle={-30} textAnchor="end" interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} />
                            <Tooltip formatter={v => [`$${v}`, 'P&L']} />
                            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#374151' }}>
                          {data.filter(d => d.bets > 0).map(d => (
                            <span key={d.label}><b>{d.label}</b> {d.bets}b · {d.smallSample ? <span style={{ color: '#9ca3af' }}>small sample</span> : <span style={{ color: d.pnl >= 0 ? CG : CR, fontWeight: 700 }}>{d.pnl >= 0 ? '+$' : '-$'}{Math.abs(d.pnl).toFixed(0)}</span>}</span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 5. By condition (bar ROI%) ── */
                  if (chartType === 'condition') {
                    const condMap = {};
                    dateResulted.forEach(b => { const c = b.track_condition || 'Unknown'; if (!condMap[c]) condMap[c] = []; condMap[c].push(b); });
                    const data = Object.entries(condMap).map(([label, arr]) => ({ label, ...calcGroupData(arr) })).sort((a, b) => b.bets - a.bets);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>ROI by Track Condition</div>
                        <ResponsiveContainer width="100%" height={204} role="img" aria-label="ROI by track condition">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#111827' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#374151' }}>
                          {data.filter(d => d.bets > 0).map(d => (
                            <span key={d.label}><b>{d.label}</b> {d.bets}b · {d.smallSample ? <span style={{ color: '#9ca3af' }}>small sample</span> : <span style={{ color: d.roi >= 0 ? CG : CR, fontWeight: 700 }}>{d.roi >= 0 ? '+' : ''}{d.roi}%</span>}</span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 6. By model rank (bar ROI%) ── */
                  if (chartType === 'rank') {
                    const bands = [['R1', 1, 1], ['R2', 2, 2], ['R3', 3, 3], ['R4+', 4, 9999]];
                    const data = bands.map(([label, lo, hi]) => { const arr = dateResulted.filter(b => b.rank >= lo && b.rank <= hi); return { label, ...calcGroupData(arr) }; });
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>ROI by Model Rank</div>
                        <ResponsiveContainer width="100%" height={204} role="img" aria-label="ROI by model rank">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#111827' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#374151' }}>
                          {data.filter(d => d.bets > 0).map(d => (
                            <span key={d.label}><b>{d.label}</b> {d.bets}b · {d.smallSample ? <span style={{ color: '#9ca3af' }}>small sample</span> : <span style={{ color: d.roi >= 0 ? CG : CR, fontWeight: 700 }}>{d.roi >= 0 ? '+' : ''}{d.roi}%</span>}</span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 7. Form streak (bar, most recent 40) ── */
                  if (chartType === 'streak') {
                    const recent = [...dateResulted].sort((a, b) => {
                      if (a.date < b.date) return -1;
                      if (a.date > b.date) return 1;
                      const ta = parseRaceTime(raceTimeMap[a.id] || a.race_time);
                      const tb = parseRaceTime(raceTimeMap[b.id] || b.race_time);
                      if (ta !== tb) return ta - tb;
                      const ra = +(a.race_number ?? a.race_num ?? 99);
                      const rb = +(b.race_number ?? b.race_num ?? 99);
                      if (ra !== rb) return ra - rb;
                      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
                    }).slice(-40);
                    const data = recent.map((b, i) => ({ i: i + 1, val: b.status === 'win' ? 1 : b.status === 'place' ? 0.5 : -1, status: b.status, horse: b.horse_name }));
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Form Streak (recent {data.length} bets, oldest → newest)</div>
                        <ResponsiveContainer width="100%" height={158} role="img" aria-label="Recent form streak">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <XAxis hide />
                            <YAxis domain={[-1.1, 1.1]} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => v === 1 ? 'W' : v === 0.5 ? 'P' : v === -1 ? 'L' : ''} ticks={[-1, 0, 0.5, 1]} />
                            <Tooltip formatter={(v, n, p) => [p.payload.horse, (p.payload.status || '').toUpperCase()]} />
                            <Bar dataKey="val" radius={[2, 2, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.val === 1 ? CG : d.val === 0.5 ? CB : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#374151' }}>
                          {[['Win', CG], ['Place', CB], ['Loss', CR]].map(([l, c]) => (
                            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 8, height: 8, background: c, borderRadius: 1, display: 'inline-block' }} />{l}
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  return null;
                })()}
              </div>

              {/* Edge Zone */}
              {dateResulted.length > 0 && (() => {
                const MIN_EZ = 5;
                const calcGroupExt = arr => {
                  const settled = arr.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched');
                  const wins   = settled.filter(b => b.status === 'win').length;
                  const second = settled.filter(b => b.position === 2).length;
                  const third  = settled.filter(b => b.position === 3).length;
                  const staked = settled.reduce((s, b) => s + (b.stake || 0), 0);
                  const pnl    = settled.reduce((s, b) => {
                    if (b.profit_loss !== null && b.profit_loss !== undefined) return s + b.profit_loss;
                    return s + (b.return_amt || 0) - (b.stake || 0);
                  }, 0);
                  const roi    = staked > 0 ? Math.round((pnl / staked * 100) * 10) / 10 : null;
                  const strike = settled.length > 0 ? Math.round(wins / settled.length * 1000) / 10 : null;
                  return { bets: settled.length, wins, second, third, roi, strike, smallSample: settled.length < MIN_EZ };
                };
                let ezRows;
                if (edgeZoneTab === 'odds') {
                  const bands = [['$1–$2',1,2],['$2–$4',2,4],['$4–$6',4,6],['$6–$8',6,8],['$8+',8,Infinity]];
                  ezRows = bands.map(([label,lo,hi]) => ({ label, ...calcGroupExt(dateResulted.filter(b => { const o=+(b.odds||0); return o>=lo&&o<hi; })) }));
                } else if (edgeZoneTab === 'rank') {
                  ezRows = [['R1',1,1],['R2',2,2],['R3',3,3],['R4+',4,9999]].map(([label,lo,hi]) => ({ label, ...calcGroupExt(dateResulted.filter(b => b.rank>=lo&&b.rank<=hi)) }));
                } else if (edgeZoneTab === 'condition') {
                  const m = {}; dateResulted.forEach(b => { const c=b.track_condition||'Unknown'; if(!m[c])m[c]=[]; m[c].push(b); });
                  ezRows = Object.entries(m).map(([label,arr]) => ({ label, ...calcGroupExt(arr) })).sort((a,b)=>b.bets-a.bets);
                } else {
                  const m = {}; dateResulted.forEach(b => { const v=b.track||b.venue||'Unknown'; if(!m[v])m[v]=[]; m[v].push(b); });
                  ezRows = Object.entries(m).map(([label,arr]) => ({ label, ...calcGroupExt(arr) })).sort((a,b)=>b.bets-a.bets);
                }
                const vis = ezRows.filter(r => r.bets > 0);
                return (
                  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>Edge Zone</span>
                      <div style={{ display: 'flex', gap: 4, ...(isMobile && { overflowX: 'auto', scrollbarWidth: 'none' }) }}>
                        {[['odds','By Odds'],['rank','By Rank'],['condition','By Condition'],['venue','By Venue']].map(([v,l]) => (
                          <button key={v} onClick={() => setEdgeZoneTab(v)}
                            style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
                              background: edgeZoneTab === v ? '#374151' : '#f3f4f6', color: edgeZoneTab === v ? '#fff' : '#374151' }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {vis.length === 0 ? (
                      <div style={{ padding: '12px 0', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No data for this period</div>
                    ) : isMobile ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {vis.map(r => (
                          <div key={r.label} style={{ background: '#f9fafb', borderRadius: 6, padding: '7px 10px', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{r.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: r.smallSample ? '#9ca3af' : r.roi >= 0 ? '#059669' : '#dc2626' }}>
                                {r.smallSample ? 'low data' : r.roi !== null ? `${r.roi >= 0 ? '+' : ''}${r.roi}%` : '—'}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                              {r.bets} bets · {r.wins}W · Strike {r.strike !== null ? `${r.strike}%` : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb' }}>
                            {['Category','Bets','Wins','2nd','3rd','Strike','ROI'].map(h => (
                              <th key={h} style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', textAlign: h==='Category'?'left':'right', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vis.map((r,i) => (
                            <tr key={r.label} style={{ borderBottom: '1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
                              <td style={{ padding: '5px 8px', color: '#111827', fontWeight: 600 }}>{r.label}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#111827' }}>{r.bets}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#111827' }}>{r.wins}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#111827' }}>{r.second}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#111827' }}>{r.third}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: '#111827' }}>{r.strike !== null ? `${r.strike}%` : '—'}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: r.smallSample ? '#9ca3af' : r.roi >= 0 ? '#059669' : '#dc2626' }}>
                                {r.smallSample ? 'small sample' : r.roi !== null ? `${r.roi >= 0 ? '+' : ''}${r.roi}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })()}
              </div>
              {!isMobile && <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }} />}
            </div>
          </div>
        )}

      </main>

      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}

      {mobileMenuId !== null && (() => {
        const b = bets.find(x => x.id === mobileMenuId);
        if (!b) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={() => setMobileMenuId(null)}>
            <div style={{ background: '#fff', borderRadius: '12px 12px 0 0', width: '100%', padding: 16, boxShadow: '0 -4px 24px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>{b.horse_name || 'Bet'}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>{b.track || b.venue || ''}{(b.race_number || b.race_num) ? ` R${b.race_number || b.race_num}` : ''} · {b.date}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Stake</div>
                  <input type="number" value={editStake} onChange={e => setEditStake(e.target.value)} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Odds</div>
                  <input type="number" value={editOdds} onChange={e => setEditOdds(e.target.value)} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => { if (+editStake > 0 && +editOdds > 1) { await patchBet(mobileMenuId, { stake: +editStake, odds: +editOdds }); setBets(prev => prev.map(x => x.id === mobileMenuId ? { ...x, stake: +editStake, odds: +editOdds } : x)); } setMobileMenuId(null); }} style={{ flex: 1, padding: '10px 0', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={async () => { handleDeleteBet(mobileMenuId); setMobileMenuId(null); }} style={{ flex: 1, padding: '10px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                <button onClick={() => setMobileMenuId(null)} style={{ padding: '10px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {racePopup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setRacePopup(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 360, width: '90%', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{racePopup.venue} Race {racePopup.race_num} — {fmtDate(racePopup.date)}</span>
              <button onClick={() => setRacePopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 340 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Pos','Horse','SP'].map((h, i) => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: i === 2 ? 'right' : 'left', fontSize: 9, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {racePopupData.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
                  ) : racePopupData.map((r, i) => {
                    const pos = r.finish_pos;
                    const ffCodes = ['FF','BD','UR','PU','DNF','DISQ','NP','FELL','REF'];
                    const isFFRow = r.result_status && ffCodes.includes(r.result_status.toUpperCase());
                    const rowStyle = pos === 1
                      ? { background: '#fef9c3', color: '#854d0e' }
                      : pos === 2 ? { background: '#f3f4f6', color: '#374151' }
                      : pos === 3 ? { background: '#fef3c7', color: '#92400e' }
                      : { background: i % 2 === 0 ? '#fff' : '#fafafa', color: '#9ca3af' };
                    return (
                      <tr key={i} style={rowStyle}>
                        <td style={{ padding: '4px 6px', fontWeight: pos <= 3 ? 700 : 400 }}>{isFFRow ? (r.result_status || 'FF') : pos ? ordinal(pos) : '—'}</td>
                        <td style={{ padding: '4px 6px', fontWeight: pos <= 3 ? 600 : 400 }}>{r.horse_name || '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{r.sp ? `$${Number(r.sp).toFixed(2)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
