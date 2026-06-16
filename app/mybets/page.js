'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';
import { parseCSV, buildRaces } from '@/lib/csvParser';

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
        <div style={{ fontWeight: 600, fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</div>
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
        {pos && <span style={{ fontSize: 8, color: '#6b7280', fontWeight: 600 }}>{ordinal(pos)}</span>}
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
      {isFirst && <span style={{ fontSize: 7, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.5px' }}>NEXT →</span>}
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
  const [showAnalysis,     setShowAnalysis]     = useState(true);
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

        {/* Stats strip */}
        {(() => {
          const at = statsRows.find(r => r.label === 'All time') || {};
          const pnl = at.pnl;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{bets.filter(b => b.status && b.status !== 'pending').length} resulted</span>
              <span>P&L <b style={{ color: pnl === null ? '#d97706' : pnl >= 0 ? '#15803d' : '#dc2626' }}>{pnl === null ? '—' : (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2)}</b></span>
              <span>Strike <b style={{ color: '#111827' }}>{at.strike || '—'}</b></span>
              <span>ROI <b style={{ color: parseFloat(at.roi) > 0 ? '#15803d' : parseFloat(at.roi) < 0 ? '#dc2626' : '#6b7280' }}>{at.roi || '—'}</b></span>
              <span>Staked <b style={{ color: '#111827' }}>{at.staked || '—'}</b></span>
              <span>Pending <b style={{ color: '#111827' }}>{pendingBets.length}</b></span>
              {matchingResults && <span style={{ color: '#d97706', fontWeight: 600 }}>Checking results…</span>}
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
                style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontWeight: 600, color: '#374151', opacity: refreshing ? 0.6 : 1 }}
              >
                {refreshing ? 'Checking…' : '🔄 Refresh Results'}
              </button>
            </div>
          );
        })()}

        {/* Single scrollable table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 2 }}>
                {['Date','Horse','Venue','R#','Type','Stake','Odds','SP','CLV','Rank','Cond','ETA / Pos','P&L','Result'].map((h, i) => (
                  <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderRight: i < 13 ? '1px solid #e5e7eb' : 'none', borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>

              {/* ── BATTLE ORDERS divider ── */}
              {(() => {
                const ifAllWin = pendingBetsSorted.reduce((sum, b) => {
                  const s = +(b.stake || 0), o = +(b.odds || 0);
                  const t = (b.bet_type || '').toLowerCase();
                  if (t.includes('each')) return sum + (s * o - s) + (s * o / 4 - s);
                  if (t === 'place') return sum + (s * o / 4 - s);
                  return sum + (s * o - s);
                }, 0);
                const totalStaked = pendingBetsSorted.reduce((s, b) => s + +(b.stake || 0), 0);
                return (
                  <tr style={{ background: '#fff7ed', borderTop: '1px solid #fed7aa', borderBottom: '1px solid #fed7aa' }}>
                    <td colSpan={14} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#c2410c', borderRight: 'none' }}>
                      ⚔️ BATTLE ORDERS — {pendingBetsSorted.length} pending · ${totalStaked.toFixed(0)} staked · if all win: +${ifAllWin.toFixed(2)}
                    </td>
                  </tr>
                );
              })()}

              {/* ── Pending bet rows ── */}
              {pendingBetsSorted.length === 0 ? (
                <tr><td colSpan={14} style={{ padding: '10px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No pending bets</td></tr>
              ) : pendingBetsSorted.map((b, idx) => {
                const rn = b.race_number ?? b.race_num;
                const vn = b.track || b.venue;
                const pill = typePillCfg(b.bet_type);
                const rank = b.rank;
                const rankBg = rank === 1 ? '#15803d' : rank === 2 ? '#16a34a' : rank === 3 ? '#ca8a04' : rank ? '#6b7280' : null;
                const td = i => ({ padding: '3px 8px', borderBottom: '1px solid #f3f4f6', borderRight: i < 13 ? '1px solid #f3f4f6' : 'none', whiteSpace: 'nowrap', verticalAlign: 'middle' });
                return (
                  <tr key={b.id} style={{ background: '#fff', borderLeft: '3px solid #f97316' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                    <td style={{ ...td(0), color: '#9ca3af' }}>{fmtDate(b.date)}</td>
                    <td style={{ ...td(1), fontWeight: 600, color: '#111827', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.horse_name || '—'}</td>
                    <td style={{ ...td(2), fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{vn || '—'}</td>
                    <td style={{ ...td(3), fontSize: 10 }}>{rn ? `R${rn}` : '—'}</td>
                    <td style={td(4)}><span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: pill.bg, color: '#fff' }}>{pill.label}</span></td>
                    <td style={{ ...td(5), fontFamily: 'monospace' }}>${(b.stake || 0).toFixed(0)}</td>
                    <td style={{ ...td(6), fontFamily: 'monospace' }}>${Number(b.odds || 0).toFixed(2)}</td>
                    <td style={{ ...td(7), color: '#9ca3af' }}>—</td>
                    <td style={{ ...td(8), color: '#9ca3af' }}>—</td>
                    <td style={td(9)}>{rankBg ? <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: rankBg, color: '#fff' }}>R{rank}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ ...td(10), color: '#9ca3af' }}>—</td>
                    <td style={td(11)}><BetCountdown bet={b} isFirst={idx === 0} /></td>
                    <td style={{ ...td(12), color: '#9ca3af' }}>—</td>
                    <td style={{ ...td(13), display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#f3f4f6', color: '#6b7280' }}>Pending</span>
                      <button onClick={() => handleDeleteBet(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 11, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </td>
                  </tr>
                );
              })}

              {/* ── WAR RECORD filter tabs row ── */}
              <tr style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                <td colSpan={14} style={{ padding: '4px 8px', borderRight: 'none' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['All','Win','Place','Loss','Today','This Week'].map(t => {
                      const key = t.toLowerCase();
                      return (
                        <button key={t} onClick={() => setActiveTab(key)}
                          style={{ padding: '2px 8px', fontSize: 10, fontWeight: activeTab === key ? 700 : 400, color: activeTab === key ? '#fff' : '#6b7280', background: activeTab === key ? '#00471b' : '#e5e7eb', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>

              {/* ── WAR RECORD divider ── */}
              {(() => {
                const at = statsRows.find(r => r.label === 'All time') || {};
                return (
                  <tr style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0', borderBottom: '1px solid #bbf7d0' }}>
                    <td colSpan={14} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#15803d', borderRight: 'none' }}>
                      📊 WAR RECORD — {resultedBets.length} resulted · P&L {at.pnl !== null && at.pnl !== undefined ? (at.pnl >= 0 ? '+$' : '-$') + Math.abs(at.pnl).toFixed(2) : '—'} · Strike {at.strike || '—'} · ROI {at.roi || '—'}
                    </td>
                  </tr>
                );
              })()}

              {/* ── Resulted bet rows ── */}
              {loading ? (
                <tr><td colSpan={14} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              ) : filteredResulted.length === 0 ? (
                <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No resulted bets yet</td></tr>
              ) : filteredResulted.map(b => {
                const stake = b.stake || 0;
                const isEW = (b.bet_type || '').toLowerCase().includes('each');
                const hasPnl = b.profit_loss !== null && b.profit_loss !== undefined;
                const pnl = hasPnl ? b.profit_loss : (b.return_amt || 0) - (isEW ? stake * 2 : stake);
                const status = b.status || '';
                const pos = b.position;
                const raceNum = b.race_number ?? b.race_num;
                const venue = b.track || b.venue;
                const sp = resultSpMap[b.id];
                const pill = typePillCfg(b.bet_type);
                const rank = b.rank;
                const rankBg = rank === 1 ? '#15803d' : rank === 2 ? '#16a34a' : rank === 3 ? '#ca8a04' : rank ? '#6b7280' : null;
                const rowBg = status === 'win' ? '#f0fdf4' : status === 'loss' ? '#fef2f2' : status === 'place' ? '#eff6ff' : '#fff';
                const hoverBg = status === 'win' ? '#dcfce7' : status === 'loss' ? '#fee2e2' : status === 'place' ? '#dbeafe' : '#f9fafb';
                const leftBorder = status === 'win' ? '#22c55e' : status === 'loss' ? '#ef4444' : status === 'place' ? '#3b82f6' : '#e5e7eb';
                const badge = { win: { bg: '#16a34a', label: 'WIN' }, place: { bg: '#2563eb', label: 'PLACE' }, loss: { bg: '#dc2626', label: 'LOSS' }, scratched: { bg: '#6b7280', label: 'SCRATCHED' } }[status] || { bg: '#9ca3af', label: 'PENDING' };
                const posBadge = pos === 1 ? { bg: '#fef9c3', color: '#854d0e' } : pos === 2 ? { bg: '#f3f4f6', color: '#374151' } : pos === 3 ? { bg: '#fef3c7', color: '#92400e' } : { bg: 'transparent', color: '#9ca3af' };
                const tdS = i => ({ padding: '3px 8px', borderBottom: '1px solid #f3f4f6', borderRight: i < 13 ? '1px solid #f3f4f6' : 'none', whiteSpace: 'nowrap', verticalAlign: 'middle' });
                return (
                  <tr key={b.id} style={{ background: rowBg, borderLeft: `3px solid ${leftBorder}` }}
                    onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                    <td style={{ ...tdS(0), color: '#9ca3af' }}>{fmtDate(b.date)}</td>
                    <td style={{ ...tdS(1), fontWeight: 600, color: '#111827', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.horse_name || '—'}</td>
                    <td style={{ ...tdS(2), fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{venue || '—'}</td>
                    <td style={{ ...tdS(3), fontSize: 10, cursor: raceNum ? 'pointer' : 'default', textDecoration: raceNum ? 'underline' : 'none' }} onClick={() => raceNum && setRacePopup({ venue: venue, race_num: raceNum, date: b.date })}>{raceNum ? `R${raceNum}` : '—'}</td>
                    <td style={tdS(4)}><span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: pill.bg, color: '#fff' }}>{pill.label}</span></td>
                    <td style={{ ...tdS(5), fontFamily: 'monospace' }}>${stake.toFixed(0)}</td>
                    <td style={{ ...tdS(6), fontFamily: 'monospace' }}>${Number(b.odds || 0).toFixed(2)}</td>
                    <td style={{ ...tdS(7), fontFamily: 'monospace', color: '#6b7280' }}>{sp ? `$${Number(sp).toFixed(2)}` : '—'}</td>
                    <td style={{ ...tdS(8), color: '#9ca3af' }}>—</td>
                    <td style={tdS(9)}>{rankBg ? <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: rankBg, color: '#fff' }}>R{rank}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ ...tdS(10), color: '#6b7280' }}>{b.condition || '—'}</td>
                    <td style={tdS(11)}>{pos ? <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: posBadge.bg, color: posBadge.color }}>{ordinal(pos)}</span> : '—'}</td>
                    <td style={{ ...tdS(12), fontFamily: 'monospace', fontWeight: 700, color: hasPnl ? (pnl >= 0 ? '#15803d' : '#dc2626') : '#9ca3af' }}>{hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—'}</td>
                    <td style={{ ...tdS(13), display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: badge.bg, color: '#fff' }}>{badge.label}</span>
                      {status === 'scratched' && <button onClick={() => handleDeleteBet(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 11, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>}
                    </td>
                  </tr>
                );
              })}

              {/* ── ANALYSIS divider — collapsible ── */}
              <tr style={{ background: '#f3f4f6', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }} onClick={() => setShowAnalysis(v => !v)}>
                <td colSpan={14} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, color: '#6b7280', borderRight: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>📈 ANALYSIS — by venue / odds range / track condition / rank</span>
                    <span>{showAnalysis ? '▾ hide' : '▸ show'}</span>
                  </div>
                </td>
              </tr>

              {/* ── Analysis rows ── */}
              {showAnalysis && (() => {
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
                const colStyle = (_span, last) => ({ padding: '4px 8px', verticalAlign: 'top', borderRight: last ? 'none' : '1px solid #e5e7eb', fontSize: 10, lineHeight: 1.8 });
                const roiColor = roi => parseFloat(roi) > 0 ? '#15803d' : parseFloat(roi) < 0 ? '#dc2626' : '#6b7280';

                const venueGroups = {};
                resultedBets.forEach(b => { const v = b.track || b.venue || 'Unknown'; if (!venueGroups[v]) venueGroups[v] = []; venueGroups[v].push(b); });
                const oddsGroups = { '$1–$2': [], '$2–$4': [], '$4–$8': [], '$8+': [] };
                resultedBets.forEach(b => { const o = +(b.odds || 0); if (o < 2) oddsGroups['$1–$2'].push(b); else if (o < 4) oddsGroups['$2–$4'].push(b); else if (o < 8) oddsGroups['$4–$8'].push(b); else oddsGroups['$8+'].push(b); });
                const condGroups = {};
                resultedBets.forEach(b => { const c = b.condition || 'Unknown'; if (!condGroups[c]) condGroups[c] = []; condGroups[c].push(b); });
                const rankGroups = { R1: [], R2: [], R3: [], 'R4+': [] };
                resultedBets.forEach(b => { const r = b.rank; if (r === 1) rankGroups.R1.push(b); else if (r === 2) rankGroups.R2.push(b); else if (r === 3) rankGroups.R3.push(b); else if (r) rankGroups['R4+'].push(b); });

                return (
                  <>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                      <td colSpan={4} style={{ ...colStyle(4, false), fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', background: '#f9fafb' }}>By Venue</td>
                      <td colSpan={3} style={{ ...colStyle(3, false), fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', background: '#f9fafb' }}>By Odds Range</td>
                      <td colSpan={4} style={{ ...colStyle(4, false), fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', background: '#f9fafb' }}>By Track Condition</td>
                      <td colSpan={3} style={{ ...colStyle(3, true), fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', background: '#f9fafb' }}>By Rank</td>
                    </tr>
                    <tr style={{ background: '#fff', borderBottom: '2px solid #e5e7eb' }}>
                      <td colSpan={4} style={colStyle(4, false)}>
                        {Object.keys(venueGroups).length === 0 ? <span style={{ color: '#9ca3af' }}>—</span> :
                          Object.entries(venueGroups).map(([v, arr]) => { const c = calcGroup(arr); return <div key={v}><b>{v}</b>: {arr.length} · {c.strike} · <span style={{ color: roiColor(c.roi), fontWeight: 600 }}>ROI {c.roi}</span></div>; })}
                      </td>
                      <td colSpan={3} style={colStyle(3, false)}>
                        {Object.entries(oddsGroups).map(([range, arr]) => { const c = calcGroup(arr); return arr.length > 0 ? <div key={range}><b>{range}</b>: {arr.length} · {c.strike} · <span style={{ color: roiColor(c.roi), fontWeight: 600 }}>ROI {c.roi}</span></div> : null; })}
                      </td>
                      <td colSpan={4} style={colStyle(4, false)}>
                        {Object.keys(condGroups).length === 0 ? <span style={{ color: '#9ca3af' }}>—</span> :
                          Object.entries(condGroups).map(([cond, arr]) => { const c = calcGroup(arr); return <div key={cond}><b>{cond}</b>: {arr.length} · {c.strike} · <span style={{ color: roiColor(c.roi), fontWeight: 600 }}>ROI {c.roi}</span></div>; })}
                      </td>
                      <td colSpan={3} style={colStyle(3, true)}>
                        {Object.entries(rankGroups).map(([r, arr]) => { const c = calcGroup(arr); return arr.length > 0 ? <div key={r}><b>{r}</b>: {arr.length} · {c.strike} · <span style={{ color: roiColor(c.roi), fontWeight: 600 }}>ROI {c.roi}</span></div> : null; })}
                      </td>
                    </tr>
                  </>
                );
              })()}

            </tbody>
          </table>
        </div>

      </main>
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
                      <th key={h} style={{ padding: '5px 10px', textAlign: i === 2 ? 'right' : 'left', fontSize: 9, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
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
                        <td style={{ padding: '4px 10px', fontWeight: pos <= 3 ? 700 : 400 }}>{pos ? ordinal(pos) : '—'}</td>
                        <td style={{ padding: '4px 10px', fontWeight: pos <= 3 ? 600 : 400 }}>{r.horse_name || '—'}</td>
                        <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{r.sp ? `$${Number(r.sp).toFixed(2)}` : '—'}</td>
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
