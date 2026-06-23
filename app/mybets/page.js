'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

const BET_VENUE_NORMALISE = {
  'BELMONT PARK':                  'BELMONT',
  'SANDOWN-HILLSIDE':              'SANDOWN',
  'SANDOWN HILLSIDE':              'SANDOWN',
  'ROSEHILL GARDENS':              'ROSEHILL GARDENS',
  'ROSEHILL GARDENS RACECOURSE':   'ROSEHILL GARDENS',
  'AQUIS PARK GOLD COAST':         'GOLD COAST',
  'THOMAS FARMS RC MURRAY BRIDGE': 'MURRAY BRIDGE',
  'THOMAS FARMS MURRAY BRIDGE':    'MURRAY BRIDGE',
  'RC MURRAY BRIDGE':              'MURRAY BRIDGE',
  'SPORTSBET SANDOWN HILLSIDE':    'SANDOWN',
};
function normVenueName(v) {
  const upper = (v || '').toUpperCase().trim();
  return BET_VENUE_NORMALISE[upper] || upper;
}

function ordinal(n) { if (!n) return ''; const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function typePillCfg(betType) {
  const bt = (betType || '').toLowerCase();
  if (bt.includes('each')) return { bg: '#7c3aed', label: 'E/W' };
  if (bt === 'place') return { bg: '#2563eb', label: 'Place' };
  return { bg: '#16a34a', label: 'Win' };
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

    const betVenue = normName(normVenueName(bet.track || bet.venue || ''));
    const betRaceNum = +(bet.race_number ?? bet.race_num ?? 0);
    const betHorse = normName(bet.horse_name || '');

    const row = rows.find(r => {
      const rVenue = normName(normVenueName(r.venue));
      const rRace  = +r.race_num;
      const rHorse = normName(r.horse_name);
      const rHorseStripped = normName(r.horse_name.replace(/\s*\([A-Z]+\)\s*$/i, ''));
      return rVenue === betVenue && rRace === betRaceNum && (rHorse === betHorse || rHorseStripped === betHorse);
    });

    if (!row) continue;

    const stake = +(bet.stake || 0);
    const odds  = +(bet.odds  || 0);
    const sp    = +(row.sp    || 0);
    const pos   = row.finish_pos;
    const type  = (bet.bet_type || '').toLowerCase();
    const useOdds = sp > 1 ? sp : odds;
    const isEW = type === 'each-way' || type === 'each way';

    let status, returnAmt, profitLoss;
    if (isEW) {
      if (pos === 1) {
        status     = 'win';
        profitLoss = (stake * useOdds) - stake + (stake * (useOdds / 4)) - stake;
      } else if (pos <= 3) {
        status     = 'place';
        profitLoss = -stake + (stake * (useOdds / 4)) - stake;
      } else {
        status = 'loss'; profitLoss = -(2 * stake);
      }
      returnAmt = profitLoss + 2 * stake;
    } else if (type === 'place') {
      if (pos <= 3) {
        status     = 'place';
        returnAmt  = stake * (useOdds / 4);
        profitLoss = returnAmt - stake;
      } else {
        status = 'loss'; returnAmt = 0; profitLoss = -stake;
      }
    } else {
      if (pos === 1) {
        status     = 'win';
        returnAmt  = stake * useOdds;
        profitLoss = returnAmt - stake;
      } else {
        status = 'loss'; returnAmt = 0; profitLoss = -stake;
      }
    }

    spMap[bet.id] = sp || null;

    const fields = {
      status,
      result:      status,
      return_amt:  Math.round((returnAmt  || 0) * 100) / 100,
      position:    pos,
      profit_loss: Math.round((profitLoss || 0) * 100) / 100,
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

function periodFilter(period, todayISO) {
  const today = new Date(todayISO + 'T00:00:00');
  const dow = today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === 'Today') return b => b.date === todayISO;
  if (period === 'This week') return b => b.date >= isoDate(weekStart);
  if (period === 'This month') return b => b.date >= isoDate(monthStart);
  return () => true;
}

function calcRow(bets) {
  const settled = bets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched');
  const wins = settled.filter(b => b.status === 'win').length;
  const totalStaked = settled.reduce((s, b) => s + (b.stake || 0), 0);
  const totalRet = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
  const pnl = totalRet - totalStaked;
  return {
    bets: settled.length, wins,
    strike: bets.length > 0 ? (wins / bets.length * 100).toFixed(0) + '%' : '—',
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

  const [upgradeOpen,      setUpgradeOpen]      = useState(false);
  const [bets,             setBets]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [activeTab,        setActiveTab]        = useState('all');
  const [matchingResults,  setMatchingResults]  = useState(false);
  const [resultSpMap,      setResultSpMap]      = useState({});

  const [betView,          setBetView]          = useState('table');
  const [mainTab,          setMainTab]          = useState('ledger');
  const [chartType,        setChartType]        = useState('outcome');
  const [refreshing,       setRefreshing]       = useState(false);
  const [racePopup,        setRacePopup]        = useState(null);
  const [racePopupData,    setRacePopupData]    = useState([]);

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
  const [raceDate,    setRaceDate]    = useState(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadBets(user.id).then(async loaded => {
      setBets(loaded);
      setLoading(false);

      // Seed SP map from race_results for all already-resulted bets
      const resultedLoaded = loaded.filter(b => b.status && b.status !== 'pending');
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

      const pending = loaded.filter(b => !b.status || b.status === 'pending');
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

  // Fetch full race result when user clicks R# in War Record
  useEffect(() => {
    if (!racePopup) { setRacePopupData([]); return; }
    sbFetch(
      `race_results?venue=eq.${encodeURIComponent(racePopup.venue)}&race_num=eq.${racePopup.race_num}&date=eq.${racePopup.date}&order=finish_pos.asc&select=horse_name,finish_pos,sp`
    ).then(data => setRacePopupData(Array.isArray(data) ? data : []));
  }, [racePopup]);

  // Fetch race date from today_meetings so Quick Log uses the correct betting date
  useEffect(() => {
    sbFetch('today_meetings?select=date&limit=1').then(data => {
      if (Array.isArray(data) && data.length > 0 && data[0].date) {
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

  const handleQuickLog = useCallback(async () => {
    if (!qlHorse.trim() || !qlStake || isNaN(+qlStake) || +qlStake <= 0) return;
    if (!qlOdds || isNaN(+qlOdds) || +qlOdds <= 1) return;
    if (!user?.id || !SURL || !SKEY) return;
    setQlSaving(true);

    const QL_VENUE_NORMALISE = {
      'SANDOWN-HILLSIDE': 'SANDOWN', 'SANDOWN HILLSIDE': 'SANDOWN',
      'ROSEHILL GARDENS': 'ROSEHILL', 'ROSEHILL GARDENS RACECOURSE': 'ROSEHILL',
      'AQUIS PARK GOLD COAST': 'GOLD COAST', 'AQUIS PARK GOLD COAST POLY': 'GOLD COAST POLY',
      'THOMAS FARMS RC MURRAY BRIDGE': 'MURRAY BRIDGE', 'THOMAS FARMS MURRAY BRIDGE': 'MURRAY BRIDGE',
      'RC MURRAY BRIDGE': 'MURRAY BRIDGE', 'SPORTSBET SANDOWN HILLSIDE': 'SANDOWN',
    };
    const normVenue = QL_VENUE_NORMALISE[(qlMeeting || '').toUpperCase()] || qlMeeting || null;

    const insertBody = {
      clerk_id:    user.id,
      date:        raceDate || todayISO,
      horse_name:  qlHorse.trim(),
      track:       normVenue,
      venue:       normVenue,
      race_number: qlRace     ? +qlRace : null,
      bet_type:    qlBetType,
      stake:       +qlStake,
      odds:        +qlOdds,
      bookmaker:   qlBookmaker || null,
      race_time:   qlRaceTime  || null,
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
        awardPoints(user.id, 'bet_logged', qlHorse.trim()).catch(() => {});
        setQlHorse(''); setQlStake(''); setQlOdds('');
      }
    } catch (err) {
      console.error('[QuickLog] Network error:', err);
    }

    setQlToast(ok ? 'success' : 'error');
    setQlSaving(false);
    setTimeout(() => setQlToast(null), 2500);
  }, [user?.id, todayISO, raceDate, qlHorse, qlMeeting, qlRace, qlBetType, qlStake, qlOdds, qlRaceTime, qlBookmaker]);

  const handleDeleteBet = useCallback(async (id) => {
    if (!confirm('Remove this bet?')) return;
    await removeBet(id);
    setBets(prev => prev.filter(b => b.id !== id));
  }, []);

  const statsRows = useMemo(() => (
    ['Today', 'This week', 'This month', 'All time'].map(p => ({ label: p, ...calcRow(bets.filter(periodFilter(p, todayISO))) }))
  ), [bets, todayISO]);

  const resultedBets     = useMemo(() => bets.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched'), [bets]);
  const filteredResulted = useMemo(() => {
    if (activeTab === 'all') return resultedBets;
    if (activeTab === 'win') return resultedBets.filter(b => b.status === 'win');
    if (activeTab === 'place') return resultedBets.filter(b => b.status === 'place');
    if (activeTab === 'loss') return resultedBets.filter(b => b.status === 'loss');
    if (activeTab === 'today') return resultedBets.filter(b => b.date === todayISO);
    if (activeTab === 'this week') {
      const today = new Date(todayISO + 'T00:00:00');
      const dow = today.getDay();
      const ws = new Date(today);
      ws.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      return resultedBets.filter(b => b.date >= isoDate(ws));
    }
    return resultedBets;
  }, [resultedBets, activeTab, todayISO]);

  const pendingBets = useMemo(() => bets.filter(b => !b.status || b.status === 'pending'), [bets]);

  const filteredBets = useMemo(() => {
    const base = bets.filter(b => b.status !== 'scratched');
    if (activeTab === 'all') return base;
    if (activeTab === 'win') return base.filter(b => b.status === 'win');
    if (activeTab === 'place') return base.filter(b => b.status === 'place');
    if (activeTab === 'loss') return base.filter(b => b.status === 'loss');
    if (activeTab === 'today') return base.filter(b => b.date === todayISO);
    if (activeTab === 'this week') {
      const today = new Date(todayISO + 'T00:00:00');
      const dow = today.getDay();
      const ws = new Date(today);
      ws.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      return base.filter(b => b.date >= isoDate(ws));
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

  return (
    <div className="mob-page" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail>
        {!isMobile && (
          <div style={{ borderTop: '2px solid #059669' }}>
            <div style={{ padding: '10px 12px 6px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>⚡ Log a Bet</span>
            </div>
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>

              {csvMeetings.length === 0 && (
                <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.4 }}>
                  Load a CSV on the Races page to enable meeting/horse selection.
                </div>
              )}

              {csvMeetings.length > 0 ? (
                <select value={qlMeeting} onChange={e => { setQlMeeting(e.target.value); setQlRace(''); setQlHorse(''); setQlOdds(''); }} style={inp}>
                  <option value="">Meeting…</option>
                  {csvMeetings.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={qlMeeting} onChange={e => setQlMeeting(e.target.value)} placeholder="Track (e.g. Flemington)" style={inp} />
              )}

              <select value={qlRace} onChange={e => { setQlRace(e.target.value); setQlHorse(''); setQlOdds(''); }} style={inp}>
                <option value="">Race #…</option>
                {csvRaceOptions.length > 0
                  ? csvRaceOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)
                  : Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>R{n}</option>)
                }
              </select>

              {csvHorses.length > 0 ? (
                <select value={qlHorse} onChange={e => { const h = csvHorses.find(x => x.name === e.target.value); setQlHorse(e.target.value); if (h?.odds) setQlOdds(h.odds.toFixed(2)); }} style={inp}>
                  <option value="">Select horse…</option>
                  {csvHorses.map(h => (
                    <option key={h.name} value={h.name}>
                      {h.tab ? `${h.tab}. ` : ''}{h.name}{h.odds ? ` ($${h.odds.toFixed(1)})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={qlHorse} onChange={e => setQlHorse(e.target.value)} placeholder="Horse name *" style={inp} />
              )}

              <select value={qlBetType} onChange={e => setQlBetType(e.target.value)} style={inp}>
                <option value="win">Win</option>
                <option value="place">Place</option>
                <option value="each-way">Each Way</option>
              </select>

              <div style={{ display: 'flex', gap: 4 }}>
                <input value={qlStake} onChange={e => setQlStake(e.target.value)} type="number" placeholder="Stake $" min="0.01" step="0.01" style={{ ...inp, flex: 1, minWidth: 0 }} />
                <input value={qlOdds} onChange={e => setQlOdds(e.target.value)} type="number" placeholder="Odds $" min="1.01" step="0.01" style={{ ...inp, flex: 1, minWidth: 0 }} />
              </div>

              <input value={qlRaceTime} onChange={e => setQlRaceTime(e.target.value)} type="time" placeholder="Race Time" style={inp} />

              <select value={qlBookmaker} onChange={e => setQlBookmaker(e.target.value)} style={inp}>
                {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleQuickLog}
                  disabled={qlSaving || !qlHorse.trim() || !qlStake || !qlOdds}
                  style={{ flex: 1, padding: '7px', background: '#059669', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (qlSaving || !qlHorse.trim() || !qlStake || !qlOdds) ? 0.5 : 1 }}
                >
                  {qlSaving ? 'Saving…' : 'Save Bet'}
                </button>
                <button
                  onClick={() => { setQlMeeting(''); setQlRace(''); setQlHorse(''); setQlBetType('win'); setQlStake(''); setQlOdds(''); setQlRaceTime(''); setQlBookmaker('Sportsbet'); setQlToast(null); }}
                  style={{ flex: 1, padding: '7px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>

              {qlToast && (
                <div style={{ fontSize: 10, fontWeight: 600, color: qlToast === 'success' ? '#059669' : '#dc2626', textAlign: 'center' }}>
                  {qlToast === 'success' ? '✓ Bet logged! +5pts' : '✗ Failed — check console for details'}
                </div>
              )}
            </div>
          </div>
        )}
      </ProfileRail>

      {/* ── Main content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f3f4f6' }}>

        {/* Top-level tabs: Ledger | Charts */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0, gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['ledger', 'Ledger'], ['charts', 'Charts']].map(([v, l]) => (
              <button key={v} onClick={() => setMainTab(v)}
                style={{ padding: '4px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: mainTab === v ? '#00471b' : '#f3f4f6', color: mainTab === v ? '#fff' : '#374151' }}>
                {l}
              </button>
            ))}
          </div>
          {mainTab === 'ledger' && (
            <div style={{ display: 'flex', gap: 4 }}>
              {[['table', 'Table'], ['terminal', 'Terminal'], ['sessions', 'Sessions'], ['kanban', 'Kanban']].map(([v, l]) => (
                <button key={v} onClick={() => setBetView(v)}
                  style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: betView === v ? '#374151' : '#f3f4f6', color: betView === v ? '#fff' : '#6b7280' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {mainTab === 'ledger' && (<>

        {/* ── Hybrid table view ── */}
        {betView === 'table' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1.5fr 1fr' }}>

          {/* ── LEFT: Performance Hero + War Ledger ── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #1a3a25' }}>

            {/* Performance hero */}
            {(() => {
              const at = statsRows.find(r => r.label === 'All time') || {};
              const pnl = at.pnl;
              const pnlColor = pnl === null ? '#9ca3af' : pnl >= 0 ? '#059669' : '#dc2626';
              const sorted = [...resultedBets].sort((a, b) => (a.date < b.date ? -1 : 1));
              let cum = 0;
              const pts = sorted.map(b => { cum += (b.profit_loss || 0); return cum; });
              const W = 110, H = 32;
              let polyline = '';
              if (pts.length > 1) {
                const minV = Math.min(0, ...pts), maxV = Math.max(0, ...pts);
                const range = maxV - minV || 1;
                polyline = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - minV) / range) * H}`).join(' ');
              }
              return (
                <div style={{ flexShrink: 0, background: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>All-Time P&L</div>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'monospace', color: pnlColor, lineHeight: 1 }}>
                      {pnl === null ? '—' : (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { label: 'ROI', value: at.roi || '—', color: parseFloat(at.roi) > 0 ? '#059669' : parseFloat(at.roi) < 0 ? '#dc2626' : '#6b7280' },
                      { label: 'Strike', value: at.strike || '—', color: '#374151' },
                      { label: 'Bets', value: resultedBets.length || 0, color: '#374151' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {pts.length > 1 && (
                    <div style={{ marginLeft: 'auto' }}>
                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
                        <polyline points={polyline} fill="none" stroke={pnl >= 0 ? '#059669' : '#dc2626'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* War Ledger */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0B1F14' }}>

              {/* Filter tabs */}
              <div style={{ flexShrink: 0, padding: '5px 10px', borderBottom: '1px solid #1a3a25', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['All','Win','Place','Loss','Today','This Week'].map(t => {
                  const key = t.toLowerCase();
                  return (
                    <button key={t} onClick={() => setActiveTab(key)}
                      style={{ padding: '2px 7px', fontSize: 9, fontWeight: activeTab === key ? 700 : 400, color: activeTab === key ? '#0B1F14' : '#4b6858', background: activeTab === key ? '#4ade80' : 'transparent', border: activeTab === key ? 'none' : '1px solid #1a3a25', borderRadius: 3, cursor: 'pointer' }}>
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Scrollable ledger rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>

                {/* Battle Orders header */}
                {pendingBetsSorted.length > 0 && (() => {
                  const ifAllWin = pendingBetsSorted.reduce((sum, b) => {
                    const s = +(b.stake || 0), o = +(b.odds || 0);
                    const t = (b.bet_type || '').toLowerCase();
                    if (t.includes('each')) return sum + (s * o - s) + (s * o / 4 - s);
                    if (t === 'place') return sum + (s * o / 4 - s);
                    return sum + (s * o - s);
                  }, 0);
                  const totalStaked = pendingBetsSorted.reduce((s, b) => s + +(b.stake || 0), 0);
                  return (
                    <div style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, color: '#fb923c', borderBottom: '1px solid #1a3a25', fontFamily: 'monospace', letterSpacing: '.03em' }}>
                      ⚔ BATTLE ORDERS — {pendingBetsSorted.length} pending · ${totalStaked.toFixed(0)} staked · if all win: +${ifAllWin.toFixed(2)}
                    </div>
                  );
                })()}

                {/* Pending rows */}
                {pendingBetsSorted.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 9, color: '#4b6858', fontFamily: 'monospace' }}>No pending bets</div>
                )}
                {pendingBetsSorted.map((b, idx) => {
                  const rn = b.race_number ?? b.race_num;
                  const vn = b.track || b.venue;
                  const pill = typePillCfg(b.bet_type);
                  const rank = b.rank;
                  return (
                    <div key={b.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #0f2918', borderLeft: '2px solid #f97316', fontFamily: 'monospace', background: 'transparent', cursor: 'default' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1a3a25'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.horse_name || '—'}{rank ? <span style={{ marginLeft: 5, fontSize: 8, color: rank === 1 ? '#fbbf24' : '#4b6858' }}>R{rank}</span> : null}
                        </div>
                        <div style={{ fontSize: 9, color: '#4b6858', marginTop: 1 }}>
                          {[vn, rn ? `R${rn}` : null, b.date?.slice(5).replace('-', '/')].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: pill.bg, color: '#fff', flexShrink: 0 }}>{pill.label}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>${(b.stake || 0).toFixed(0)} @ ${Number(b.odds || 0).toFixed(2)}</span>
                      <BetCountdown bet={b} isFirst={idx === 0} />
                      <button onClick={() => handleDeleteBet(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b6858', fontSize: 11, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </div>
                  );
                })}

                {/* War Record header */}
                {(() => {
                  const at = statsRows.find(r => r.label === 'All time') || {};
                  return (
                    <div style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, color: '#4ade80', borderBottom: '1px solid #1a3a25', borderTop: pendingBetsSorted.length > 0 ? '1px solid #1a3a25' : 'none', fontFamily: 'monospace', letterSpacing: '.03em' }}>
                      ◆ WAR RECORD — {resultedBets.length} resulted · {at.pnl !== null && at.pnl !== undefined ? (at.pnl >= 0 ? '+$' : '-$') + Math.abs(at.pnl).toFixed(2) : '—'} · {at.strike || '—'} strike · ROI {at.roi || '—'}
                    </div>
                  );
                })()}

                {/* Resulted rows */}
                {loading ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#4b6858', fontSize: 10 }}>Loading…</div>
                ) : filteredResulted.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#4b6858', fontSize: 10 }}>No resulted bets yet</div>
                ) : filteredResulted.map(b => {
                  const stake = b.stake || 0;
                  const isEW = (b.bet_type || '').toLowerCase().includes('each');
                  const hasPnl = b.profit_loss !== null && b.profit_loss !== undefined;
                  const pnl = hasPnl ? b.profit_loss : (b.return_amt || 0) - (isEW ? stake * 2 : stake);
                  const status = b.status || '';
                  const pos = b.position;
                  const raceNum = b.race_number ?? b.race_num;
                  const venue = b.track || b.venue;
                  const pill = typePillCfg(b.bet_type);
                  const rank = b.rank;
                  const leftBorder = status === 'win' ? '#22c55e' : status === 'loss' ? '#ef4444' : status === 'place' ? '#3b82f6' : '#475569';
                  const pnlColor = !hasPnl ? '#6b7280' : pnl >= 0 ? '#4ade80' : '#f87171';
                  return (
                    <div key={b.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #0f2918', borderLeft: `2px solid ${leftBorder}`, fontFamily: 'monospace', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1a3a25'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.horse_name || '—'}{rank ? <span style={{ marginLeft: 5, fontSize: 8, color: rank === 1 ? '#fbbf24' : '#4b6858' }}>R{rank}</span> : null}
                        </div>
                        <div style={{ fontSize: 9, color: '#4b6858', marginTop: 1 }}>
                          {[venue, raceNum ? `R${raceNum}` : null, b.date?.slice(5).replace('-', '/')].filter(Boolean).join(' · ')}
                          {pos ? <span style={{ marginLeft: 4, color: pos === 1 ? '#fbbf24' : '#6b7280' }}>{ordinal(pos)}</span> : null}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: pill.bg, color: '#fff', flexShrink: 0 }}>{pill.label}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>${stake.toFixed(0)} @ ${Number(b.odds || 0).toFixed(2)}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: pnlColor, width: 60, textAlign: 'right', flexShrink: 0 }}>
                        {hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Insights panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9fafb' }}>

            {/* Edge zone */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Edge Zone</div>
              {(() => {
                const calcGroup = arr => {
                  const settled = arr.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched');
                  const wins = settled.filter(b => b.status === 'win').length;
                  const staked = settled.reduce((s, b) => s + (b.stake || 0), 0);
                  const ret = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
                  const pnl = ret - staked;
                  const roi = staked > 0 ? (pnl / staked * 100).toFixed(0) + '%' : '—';
                  const strike = settled.length > 0 ? (wins / settled.length * 100).toFixed(0) + '%' : '—';
                  return { bets: settled.length, wins, strike, roi, pnl, staked };
                };
                const roiColor = roi => parseFloat(roi) > 0 ? '#15803d' : parseFloat(roi) < 0 ? '#dc2626' : '#6b7280';
                const oddsGroups = { '$1–$2': [], '$2–$4': [], '$4–$8': [], '$8+': [] };
                resultedBets.forEach(b => { const o = +(b.odds || 0); if (o < 2) oddsGroups['$1–$2'].push(b); else if (o < 4) oddsGroups['$2–$4'].push(b); else if (o < 8) oddsGroups['$4–$8'].push(b); else oddsGroups['$8+'].push(b); });
                const rankGroups = { R1: [], R2: [], R3: [], 'R4+': [] };
                resultedBets.forEach(b => { const r = b.rank; if (r === 1) rankGroups.R1.push(b); else if (r === 2) rankGroups.R2.push(b); else if (r === 3) rankGroups.R3.push(b); else if (r) rankGroups['R4+'].push(b); });
                const condGroups = {};
                resultedBets.forEach(b => { const c = b.condition || 'Unknown'; if (!condGroups[c]) condGroups[c] = []; condGroups[c].push(b); });
                const venueGroups = {};
                resultedBets.forEach(b => { const v = b.track || b.venue || 'Unknown'; if (!venueGroups[v]) venueGroups[v] = []; venueGroups[v].push(b); });

                if (resultedBets.length === 0) {
                  return <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No resulted bets to analyse</div>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'By Odds Range', groups: oddsGroups },
                      { label: 'By Model Rank', groups: rankGroups },
                      { label: 'By Track Condition', groups: condGroups },
                      { label: 'By Venue', groups: venueGroups },
                    ].map(({ label, groups }) => (
                      <div key={label}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
                        {Object.entries(groups).map(([grp, arr]) => {
                          const c = calcGroup(arr);
                          if (c.bets === 0) return null;
                          return (
                            <div key={grp} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: '#374151', width: 72, flexShrink: 0 }}>{grp}</span>
                              <span style={{ fontSize: 9, color: '#9ca3af', width: 24, flexShrink: 0 }}>{c.bets}b</span>
                              <span style={{ fontSize: 9, color: '#9ca3af', width: 34, flexShrink: 0 }}>{c.strike}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: roiColor(c.roi) }}>ROI {c.roi}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        )}

        {betView === 'terminal' && (
          <div style={{ flex:1, overflowY:'auto', background:'#0f1117', padding:12 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                  {['Date','Horse','Venue · R#','Rank','Odds','Stake','P&L','Result'].map(h => (
                    <th key={h} style={{ padding:'4px 8px', fontSize:9, fontWeight:700, color:'#475569', textAlign: h==='P&L'||h==='Odds'||h==='Stake' ? 'right' : h==='Rank'||h==='Result' ? 'center' : 'left', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBets.map(b => {
                  const pnl = b.status==='win' ? +(b.stake||0)*(+(b.odds||0)-1) : b.status==='place' ? +(b.stake||0)*(+(b.odds||0)-1) : -(+(b.stake||0));
                  const isWin = b.status==='win'||b.status==='place';
                  return (
                    <tr key={b.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', borderLeft:`3px solid ${isWin?'#22c55e':'#ef4444'}` }}>
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
        )}

        {betView === 'sessions' && (
          <div style={{ flex:1, overflowY:'auto', padding:12, background:'#f3f4f6' }}>
            {(() => {
              const byDate = {};
              filteredBets.forEach(b => { if (!byDate[b.date]) byDate[b.date] = []; byDate[b.date].push(b); });
              return Object.entries(byDate).sort(([a],[b]) => b.localeCompare(a)).map(([date, betsOnDay]) => {
                const dayPnl = betsOnDay.reduce((sum,b) => {
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
                          const pnl = b.status==='win'||b.status==='place' ? +(b.stake||0)*(+(b.odds||0)-1) : -(+(b.stake||0));
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
        )}

        {betView === 'kanban' && (
          <div style={{ flex:1, overflowY:'auto', padding:12, background:'#f3f4f6' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[
                { label:'Wins',    statuses:['win','place'], bg:'#f0fdf4', border:'#86efac', headerBg:'#dcfce7', textColor:'#166534' },
                { label:'Losses',  statuses:['loss'],        bg:'#fff',    border:'#fca5a5', headerBg:'#fee2e2', textColor:'#991b1b' },
                { label:'Pending', statuses:['pending'],     bg:'#fffbeb', border:'#fde047', headerBg:'#fef9c3', textColor:'#854d0e' },
              ].map(col => {
                const colBets = col.label === 'Pending'
                  ? pendingBets
                  : filteredBets.filter(b => col.statuses.includes(b.status));
                const colPnl = colBets.reduce((sum,b) => {
                  if (b.status==='win'||b.status==='place') return sum + +(b.stake||0)*(+(b.odds||0)-1);
                  if (b.status==='loss') return sum - +(b.stake||0);
                  return sum;
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

        </>)}

        {mainTab === 'charts' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Chart type pills */}
            <div style={{ flexShrink: 0, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                  style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: chartType === v ? '#00471b' : '#f3f4f6', color: chartType === v ? '#fff' : '#6b7280' }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Chart card */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f9fafb', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', width: '100%', maxWidth: 720 }}>
                {(() => {
                  const CG = '#1D9E75', CR = '#E24B4A', CB = '#3b82f6';
                  const MIN_SAMPLE = 5;

                  if (resultedBets.length === 0) {
                    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No resulted bets to chart yet</div>;
                  }

                  const calcGroupData = arr => {
                    const settled = arr.filter(b => b.status && b.status !== 'pending' && b.status !== 'scratched');
                    const wins = settled.filter(b => b.status === 'win').length;
                    const staked = settled.reduce((s, b) => s + (b.stake || 0), 0);
                    const ret = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
                    const pnl = ret - staked;
                    const roi = staked > 0 ? Math.round((pnl / staked * 100) * 10) / 10 : 0;
                    return { bets: settled.length, wins, pnl: Math.round(pnl * 100) / 100, roi, staked, smallSample: settled.length < MIN_SAMPLE };
                  };

                  /* ── 1. Outcome split (doughnut) ── */
                  if (chartType === 'outcome') {
                    const wins = resultedBets.filter(b => b.status === 'win').length;
                    const places = resultedBets.filter(b => b.status === 'place').length;
                    const losses = resultedBets.filter(b => b.status === 'loss').length;
                    const data = [{ name: 'Win', value: wins, color: CG }, { name: 'Place', value: places, color: CB }, { name: 'Loss', value: losses, color: CR }].filter(d => d.value > 0);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Outcome Split</div>
                        <ResponsiveContainer width="100%" height={220}>
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
                              <span style={{ color: '#374151' }}>{d.name}</span>
                              <span style={{ fontWeight: 700, color: '#111827' }}>{d.value}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 2. Cumulative P&L (line) ── */
                  if (chartType === 'cumulative') {
                    const sorted = [...resultedBets].sort((a, b) => a.date < b.date ? -1 : 1);
                    let cum = 0;
                    const data = sorted.map((b, i) => { cum += (b.profit_loss || 0); return { i: i + 1, pnl: Math.round(cum * 100) / 100, label: b.date?.slice(5).replace('-', '/') }; });
                    const finalPnl = data.length ? data[data.length - 1].pnl : 0;
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Cumulative P&L</div>
                        <ResponsiveContainer width="100%" height={220} role="img" aria-label="Cumulative profit and loss over time">
                          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} />
                            <Tooltip formatter={v => [`$${v}`, 'P&L']} />
                            <Line type="monotone" dataKey="pnl" stroke={finalPnl >= 0 ? CG : CR} strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    );
                  }

                  /* ── 3. By odds range (bar ROI%) ── */
                  if (chartType === 'odds') {
                    const bands = [['$1–$2', 1, 2], ['$2–$4', 2, 4], ['$4–$8', 4, 8], ['$8+', 8, Infinity]];
                    const data = bands.map(([label, lo, hi]) => { const arr = resultedBets.filter(b => { const o = +(b.odds || 0); return o >= lo && o < hi; }); return { label, ...calcGroupData(arr) }; });
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>ROI by Odds Range</div>
                        <ResponsiveContainer width="100%" height={220} role="img" aria-label="ROI percentage by odds range">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#6b7280' }}>
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
                    resultedBets.forEach(b => { const v = b.track || b.venue || 'Unknown'; if (!venueMap[v]) venueMap[v] = []; venueMap[v].push(b); });
                    const data = Object.entries(venueMap).map(([label, arr]) => ({ label, ...calcGroupData(arr) })).sort((a, b) => b.bets - a.bets);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>P&L by Venue</div>
                        <ResponsiveContainer width="100%" height={220} role="img" aria-label="Total profit and loss by venue">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6b7280' }} angle={-30} textAnchor="end" interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'P&L'] : [`$${v}`, 'P&L']} />
                            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.pnl >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#6b7280' }}>
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
                    resultedBets.forEach(b => { const c = b.condition || 'Unknown'; if (!condMap[c]) condMap[c] = []; condMap[c].push(b); });
                    const data = Object.entries(condMap).map(([label, arr]) => ({ label, ...calcGroupData(arr) })).sort((a, b) => b.bets - a.bets);
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>ROI by Track Condition</div>
                        <ResponsiveContainer width="100%" height={220} role="img" aria-label="ROI by track condition">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#6b7280' }}>
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
                    const data = bands.map(([label, lo, hi]) => { const arr = resultedBets.filter(b => b.rank >= lo && b.rank <= hi); return { label, ...calcGroupData(arr) }; });
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>ROI by Model Rank</div>
                        <ResponsiveContainer width="100%" height={220} role="img" aria-label="ROI by model rank">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                            <Tooltip formatter={(v, n, p) => p.payload.smallSample ? ['< 5 bets', 'Small sample'] : [`${v}%`, 'ROI']} />
                            <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.smallSample ? '#d1d5db' : d.roi >= 0 ? CG : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10, color: '#6b7280' }}>
                          {data.filter(d => d.bets > 0).map(d => (
                            <span key={d.label}><b>{d.label}</b> {d.bets}b · {d.smallSample ? <span style={{ color: '#9ca3af' }}>small sample</span> : <span style={{ color: d.roi >= 0 ? CG : CR, fontWeight: 700 }}>{d.roi >= 0 ? '+' : ''}{d.roi}%</span>}</span>
                          ))}
                        </div>
                      </>
                    );
                  }

                  /* ── 7. Form streak (bar, most recent 40) ── */
                  if (chartType === 'streak') {
                    const recent = [...resultedBets].sort((a, b) => b.date < a.date ? -1 : 1).slice(0, 40).reverse();
                    const data = recent.map((b, i) => ({ i: i + 1, val: b.status === 'win' ? 1 : b.status === 'place' ? 0.5 : -1, status: b.status, horse: b.horse_name }));
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Form Streak (recent {data.length} bets, oldest → newest)</div>
                        <ResponsiveContainer width="100%" height={180} role="img" aria-label="Recent form streak">
                          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <XAxis hide />
                            <YAxis domain={[-1.1, 1.1]} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => v === 1 ? 'W' : v === 0.5 ? 'P' : v === -1 ? 'L' : ''} ticks={[-1, 0, 0.5, 1]} />
                            <Tooltip formatter={(v, n, p) => [p.payload.horse, (p.payload.status || '').toUpperCase()]} />
                            <Bar dataKey="val" radius={[2, 2, 0, 0]}>
                              {data.map((d, i) => <Cell key={i} fill={d.val === 1 ? CG : d.val === 0.5 ? CB : CR} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#6b7280' }}>
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
            </div>
          </div>
        )}

      </main>

      {/* Stats right rail */}
      {(() => {
        const at = statsRows.find(r => r.label === 'All time') || {};
        const pnl = at.pnl;
        return (
          <div style={{ width: 160, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e5e7eb', padding: '10px 8px', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            {[
              { label: 'Resulted', value: bets.filter(b => b.status && b.status !== 'pending').length, color: '#111827' },
              { label: 'P&L', value: pnl === null ? '—' : (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2), color: pnl === null ? '#d97706' : pnl >= 0 ? '#15803d' : '#dc2626' },
              { label: 'Strike', value: at.strike || '—', color: '#111827' },
              { label: 'ROI', value: at.roi || '—', color: parseFloat(at.roi) > 0 ? '#15803d' : parseFloat(at.roi) < 0 ? '#dc2626' : '#6b7280' },
              { label: 'Staked', value: at.staked || '—', color: '#111827' },
              { label: 'Pending', value: pendingBets.length, color: '#111827' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ color: '#9ca3af', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 1 }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: 11 }}>{value}</div>
              </div>
            ))}
            {matchingResults && <div style={{ color: '#d97706', fontWeight: 600, fontSize: 9 }}>Checking results…</div>}
            <div style={{ marginTop: 'auto' }}>
              <button
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  const pending = bets.filter(b => !b.status || b.status === 'pending');
                  const { spMap, anyUpdated } = await matchAndUpdateBets(pending);
                  if (Object.keys(spMap).length > 0) setResultSpMap(spMap);
                  if (anyUpdated) {
                    const fresh = await loadBets(user.id);
                    setBets(fresh);
                  }
                  setRefreshing(false);
                }}
                style={{ width: '100%', fontSize: 10, padding: '5px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontWeight: 600, color: '#374151', opacity: refreshing ? 0.6 : 1 }}
              >
                {refreshing ? 'Checking…' : '🔄 Refresh'}
              </button>
            </div>
          </div>
        );
      })()}

      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}

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
                    const rowStyle = pos === 1
                      ? { background: '#fef9c3', color: '#854d0e' }
                      : pos === 2 ? { background: '#f3f4f6', color: '#374151' }
                      : pos === 3 ? { background: '#fef3c7', color: '#92400e' }
                      : { background: i % 2 === 0 ? '#fff' : '#fafafa', color: '#9ca3af' };
                    return (
                      <tr key={i} style={rowStyle}>
                        <td style={{ padding: '4px 6px', fontWeight: pos <= 3 ? 700 : 400 }}>{pos ? ordinal(pos) : '—'}</td>
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
