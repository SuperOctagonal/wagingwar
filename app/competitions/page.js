'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import useUserSettings from '@/hooks/useUserSettings';
import UpgradeModal from '@/components/UpgradeModal';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreHorse, getDefaultWeights } from '@/lib/scoring';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const G    = '#00471b';
const MONO = 'JetBrains Mono, monospace';

const METRO_VENUES = new Set([
  'RANDWICK','ROSEHILL','ROSEHILL GARDENS','WARWICK FARM','HAWKESBURY','GOSFORD',
  'KEMBLA GRANGE','NEWCASTLE','FLEMINGTON','CAULFIELD','MOONEE VALLEY','SANDOWN',
  'SANDOWN LAKESIDE','SANDOWN-HILLSIDE','SANDOWN HILLSIDE','EAGLE FARM','DOOMBEN',
  'GOLD COAST','MORPHETTVILLE','MORPHETTVILLE PARKS','ASCOT','BELMONT','BELMONT PARK',
]);

function aestISO() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' }); }
function rk(venue, num) { return `${normaliseVenue(venue||'')}||${num}`; }

async function sbFetch(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[comp sbFetch]', opts.method || 'GET', path, res.status, body);
      return null;
    }
    const t = await res.text();
    return t ? JSON.parse(t) : true;
  } catch (err) {
    console.error('[comp sbFetch] network error:', err);
    return null;
  }
}

function jumpDate(timeStr, dateStr) {
  if (!timeStr) return null;
  const t = timeStr.trim().replace(/\./g, ':');
  let h, m;
  const ap = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ap) {
    h = parseInt(ap[1]); m = parseInt(ap[2]);
    if (/pm/i.test(ap[3]) && h !== 12) h += 12;
    if (/am/i.test(ap[3]) && h === 12) h = 0;
  } else {
    const pl = t.match(/^(\d{1,2}):(\d{2})/);
    if (!pl) return null;
    h = parseInt(pl[1]); m = parseInt(pl[2]);
  }
  const parts = (dateStr || '').split('/');
  const iso = parts.length === 3 && parts[2].length === 4
    ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    : /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? dateStr : aestISO();
  return new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+10:00`);
}

function fmtMs(ms) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  return min < 60 ? `${min}m ${s % 60}s` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

function pickMeetings(allRaces) {
  const pv = {};
  Object.values(allRaces).forEach(race => {
    const v = normaliseVenue(race.venue||'');
    if (!v || v === 'UNKNOWN') return;
    const p = parseFloat((race.prize || '0').replace(/[^0-9.]/g, '')) || 0;
    pv[v] = (pv[v] || 0) + p;
  });
  const vs = Object.keys(pv);
  const metro = vs.filter(v => METRO_VENUES.has(v)).sort((a, b) => pv[b] - pv[a]);
  const reg = vs.filter(v => !METRO_VENUES.has(v)).sort((a, b) => pv[b] - pv[a]);
  return [...metro, ...reg].slice(0, 3);
}

function getCompRaces(allRaces, selV) {
  const set = new Set(selV);
  const byV = {};
  Object.values(allRaces).forEach(race => {
    const v = normaliseVenue(race.venue||'');
    if (!set.has(v)) return;
    if (!byV[v]) byV[v] = [];
    byV[v].push(race);
  });
  const out = [];
  for (const v of selV) {
    const sorted = (byV[v] || []).sort((a, b) => +a.num - +b.num);
    out.push(...sorted.slice(-4));
  }
  return out;
}

function getModelRank1(race) {
  const active = (race.horses || []).filter(h => !h.scratched);
  if (!active.length) return null;
  const w = getDefaultWeights();
  let best = null, bs = -Infinity;
  for (const h of active) {
    const { total } = scoreHorse(h, 'good', w);
    if (total > bs) { bs = total; best = h.name; }
  }
  return best;
}

function titleCase(str) {
  return (str || '').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
}

// Shared scoring: Win=3pts, 2nd=2pts, 3rd=1pt, else 0. finish_pos may be a string; coerce before compare.
function scorePick(finishPos) {
  const p = typeof finishPos === 'string' ? parseInt(finishPos, 10) : +finishPos;
  return p === 1 ? 3 : p === 2 ? 2 : p === 3 ? 1 : 0;
}

// Correct ordinals: 1st, 2nd, 3rd, 4th... 11th, 12th, 13th... 21st, 22nd, 23rd...
function ordinal(n) {
  const num = Math.abs(+n);
  const mod100 = num % 100;
  const mod10  = num % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  if (mod10 === 1) return `${num}st`;
  if (mod10 === 2) return `${num}nd`;
  if (mod10 === 3) return `${num}rd`;
  return `${num}th`;
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────
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

function dateMinusDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv-SE');
}

function getLbDateRange(tab) {
  const today = aestISO();
  const y = today.slice(0, 4);
  const m = today.slice(0, 7);
  switch (tab) {
    case 'yearly':  return { start: `${y}-01-01`, end: today };
    case 'monthly': return { start: `${m}-01`,    end: today };
    case 'weekly':  return { start: dateMinusDays(today, 6), end: today };
    default:        return { start: null, end: today };
  }
}

function aggregateLb(rows) {
  const byUser = {};
  for (const r of rows) {
    if (!byUser[r.clerk_id]) {
      byUser[r.clerk_id] = { username: r.username || 'User', score: 0, correct: 0, total: 0, streak: 0, latestDate: '' };
    }
    const u = byUser[r.clerk_id];
    u.score   += r.score;
    u.correct += r.correct;
    u.total   += r.total;
    if (r.comp_date > u.latestDate) { u.latestDate = r.comp_date; u.streak = r.streak; }
  }
  return Object.entries(byUser)
    .map(([clerk_id, u]) => ({ clerk_id, ...u, hitPct: u.total > 0 ? (u.correct / u.total * 100) : 0 }))
    .sort((a, b) => b.score - a.score || b.hitPct - a.hitPct);
}

function applyLbRanks(sorted) {
  let r = 1;
  return sorted.map((u, i) => {
    if (i > 0) {
      const p = sorted[i - 1];
      if (u.score < p.score || (u.score === p.score && u.hitPct < p.hitPct)) r = i + 1;
    }
    return { ...u, rank: r };
  });
}

const LB_TABS      = [{ id: 'alltime', label: 'All-time' }, { id: 'yearly', label: 'Yearly' }, { id: 'monthly', label: 'Monthly' }, { id: 'weekly', label: 'Weekly' }];

export default function CompetitionsPage() {
  const { user, isLoaded } = useUser();
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const router = useRouter();
  const { settings } = useUserSettings();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [lockVisible, setLockVisible] = useState(true);
  const [hiddenFromLb, setHiddenFromLb] = useState(new Set());

  const [csvRaces, setCsvRaces]       = useState(null);
  const [csvStaleDate, setCsvStaleDate] = useState(null);
  const [picks, setPicks]             = useState({});
  const [savingKey, setSavingKey]     = useState(null);
  const [popularData, setPopularData] = useState([]);
  const [allPicksData, setAllPicksData] = useState([]);
  const [results, setResults]         = useState({});
  const [scratchings, setScratchings] = useState(new Set());
  const [allTimePoints, setAllTimePoints] = useState(null);
  const [mainTab, setMainTab]         = useState('today');
  const [now, setNow]                 = useState(Date.now());
  const [submitting, setSubmitting]   = useState(false);
  const [submitToast, setSubmitToast] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [lbTab, setLbTab]           = useState('alltime');
  const [lbRows, setLbRows]         = useState([]);
  const [lbLoading, setLbLoading]   = useState(false);

  // Record + P&L state
  const [allCompScoresData, setAllCompScoresData]     = useState([]);
  const [userAllPicksData, setUserAllPicksData]       = useState([]);
  const [allCompResultsData, setAllCompResultsData]   = useState([]);
  const [historicalRaceSps, setHistoricalRaceSps]     = useState([]);
  const [todayRaceResultsData, setTodayRaceResultsData] = useState([]);
  const [openPickKey, setOpenPickKey]   = useState(null);
  const [selCompVenue, setSelCompVenue] = useState(null);

  const [today, setToday] = useState(() => aestISO());
  const uname = user ? (user.fullName || user.username || user.firstName || 'Anon') : 'Anon';

  const selVenues = useMemo(() => csvRaces ? pickMeetings(csvRaces.allRaces) : [], [csvRaces]);
  const compRaces = useMemo(() => csvRaces ? getCompRaces(csvRaces.allRaces, selVenues) : [], [csvRaces, selVenues]);

  const mr1Map = useMemo(() => {
    const m = {};
    compRaces.forEach(r => { m[rk(r.venue, r.num)] = getModelRank1(r); });
    return m;
  }, [compRaces]);

  // Primary winner source: race_results (finish_pos=1), polled every 60s via loadTodayRR
  const liveWinnerMap = useMemo(() => {
    const m = {};
    todayRaceResultsData.forEach(r => {
      if (r.finish_pos === 1 || r.finish_pos === '1') m[rk(r.venue, r.race_num)] = r.horse_name;
    });
    return m;
  }, [todayRaceResultsData]);

  const popularPicks = useMemo(() => {
    const grouped = {};
    popularData.forEach(r => {
      const key = rk(r.venue, r.race_num);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ horse: r.horse_name, count: +r.pick_count });
    });
    const out = {};
    for (const [key, entries] of Object.entries(grouped)) {
      const total = entries.reduce((s, e) => s + e.count, 0);
      out[key] = entries
        .map(e => ({ horse: e.horse, count: e.count, pct: Math.round(e.count / total * 100), total }))
        .sort((a, b) => b.count - a.count);
    }
    return out;
  }, [popularData]);

  // Today finish positions + SP (polled live for result pills)
  const todayFinishPos = useMemo(() => {
    const m = {};
    todayRaceResultsData.forEach(r => {
      m[`${normaliseVenue(r.venue||'')}||${r.race_num}||${(r.horse_name||'').toUpperCase()}`] = { pos: r.finish_pos, sp: r.sp };
    });
    return m;
  }, [todayRaceResultsData]);

  const todayLeaderboard = useMemo(() => {
    const um = {};
    for (const r of allPicksData) {
      if (hiddenFromLb.has(r.clerk_id)) continue;
      if (!um[r.clerk_id]) um[r.clerk_id] = { clerk_id: r.clerk_id, uname: r.username || 'User', picks: {} };
      um[r.clerk_id].picks[rk(r.venue, r.race_num)] = r.horse_name;
    }
    const entries = Object.values(um).map(entry => {
      let score = 0, correct = 0, decided = 0;
      for (const [key, horse] of Object.entries(entry.picks)) {
        const winner = liveWinnerMap[key] || results[key];
        if (winner) {
          decided++;
          if (winner.toLowerCase() === horse.toLowerCase()) correct++;
          const [vn, rn] = key.split('||');
          const rr = todayFinishPos[`${vn}||${rn}||${horse.toUpperCase()}`];
          score += rr?.pos != null ? scorePick(rr.pos) : (winner.toLowerCase() === horse.toLowerCase() ? 3 : 0);
        }
      }
      for (const v of selVenues) {
        const mRaces = compRaces.filter(r => normaliseVenue(r.venue||'') === v);
        if (mRaces.length < 4) continue;
        const allWon = mRaces.every(r => {
          const k = rk(r.venue, r.num);
          const w = liveWinnerMap[k] || results[k];
          return w && entry.picks[k] && w.toLowerCase() === entry.picks[k].toLowerCase();
        });
        if (allWon) score += 3;
      }
      return { ...entry, score, correct, decided, isMe: entry.clerk_id === user?.id };
    });
    entries.sort((a, b) => b.score - a.score);
    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [allPicksData, results, liveWinnerMap, compRaces, selVenues, user?.id, hiddenFromLb, todayFinishPos]);

  const userScore = useMemo(() => {
    let s = 0;
    for (const [key, horse] of Object.entries(picks)) {
      const winner = liveWinnerMap[key] || results[key];
      if (winner) {
        const [vn, rn] = key.split('||');
        const rr = todayFinishPos[`${vn}||${rn}||${horse.toUpperCase()}`];
        s += rr?.pos != null ? scorePick(rr.pos) : (winner.toLowerCase() === horse.toLowerCase() ? 3 : 0);
      }
    }
    for (const v of selVenues) {
      const mRaces = compRaces.filter(r => normaliseVenue(r.venue||'') === v);
      if (mRaces.length < 4) continue;
      if (mRaces.every(r => { const k = rk(r.venue, r.num); const w = liveWinnerMap[k] || results[k]; return w && picks[k] && w.toLowerCase() === picks[k].toLowerCase(); })) s += 3;
    }
    return s;
  }, [picks, results, liveWinnerMap, compRaces, selVenues, todayFinishPos]);

  const userRank     = useMemo(() => todayLeaderboard.find(e => e.isMe)?.rank ?? null, [todayLeaderboard]);
  const entrantCount = useMemo(() => new Set(allPicksData.map(r => r.clerk_id)).size, [allPicksData]);
  const pickedCount  = useMemo(() => compRaces.filter(r => picks[rk(r.venue, r.num)]).length, [compRaces, picks]);

  const decidedCount = useMemo(() => compRaces.filter(r => {
    const k = rk(r.venue, r.num); return liveWinnerMap[k] || results[k];
  }).length, [compRaces, liveWinnerMap, results]);

  const lbRanked      = useMemo(() => applyLbRanks(aggregateLb(lbRows.filter(r => !hiddenFromLb.has(r.clerk_id)))),     [lbRows, hiddenFromLb]);

  const scratchAlerts = useMemo(() => compRaces.filter(r => {
    const key = rk(r.venue, r.num);
    const pick = picks[key];
    return pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
  }), [compRaces, picks, scratchings]);

  const racesByVenue = useMemo(() => {
    const m = {};
    for (const v of selVenues) m[v] = compRaces.filter(r => normaliseVenue(r.venue||'') === v);
    return m;
  }, [compRaces, selVenues]);

  // ─── Record + P&L memos ───────────────────────────────────────────────────────

  // Rank ALL users per comp_date, find this user's daily placement
  const userRecord = useMemo(() => {
    if (!user?.id || !allCompScoresData.length) return null;
    const byDate = {};
    allCompScoresData.forEach(r => {
      if (!byDate[r.comp_date]) byDate[r.comp_date] = [];
      byDate[r.comp_date].push(r);
    });
    let comps = 0, wins = 0, seconds = 0, thirds = 0;
    const form = [];
    for (const dateKey of Object.keys(byDate).sort()) {
      const ranked = applyLbRanks(aggregateLb(byDate[dateKey]));
      const me = ranked.find(u => u.clerk_id === user.id);
      if (!me) continue;
      comps++;
      if (me.rank === 1) wins++;
      else if (me.rank === 2) seconds++;
      else if (me.rank === 3) thirds++;
      form.push(me.rank);
    }
    return { comps, wins, seconds, thirds, form: form.slice(-10) };
  }, [allCompScoresData, user?.id]);

  const bestStreak = useMemo(() => {
    if (!user?.id || !allCompScoresData.length) return 0;
    return Math.max(0, ...allCompScoresData.filter(r => r.clerk_id === user.id).map(r => r.streak || 0));
  }, [allCompScoresData, user?.id]);

  const hitRate = useMemo(() => {
    if (!userAllPicksData.length) return null;
    const winnerMap = {};
    allCompResultsData.forEach(r => {
      winnerMap[`${r.comp_date}||${normaliseVenue(r.venue||'')}||${r.race_num}`] = r.winner;
    });
    let settled = 0, correct = 0;
    userAllPicksData.forEach(p => {
      const winner = winnerMap[`${p.comp_date}||${normaliseVenue(p.venue||'')}||${p.race_num}`];
      if (!winner) return;
      settled++;
      if (winner.toLowerCase() === (p.horse_name || '').toLowerCase()) correct++;
    });
    return settled > 0 ? correct / settled * 100 : null;
  }, [userAllPicksData, allCompResultsData]);

  // Winning pick with no SP is excluded from P&L entirely (not counted as profit or loss)
  const allTimePL = useMemo(() => {
    if (!userAllPicksData.length) return null;
    const winnerMap = {};
    allCompResultsData.forEach(r => {
      winnerMap[`${r.comp_date}||${normaliseVenue(r.venue||'')}||${r.race_num}`] = (r.winner || '').toLowerCase();
    });
    const spMap = {};
    historicalRaceSps.forEach(r => {
      spMap[`${r.date}||${normaliseVenue(r.venue||'')}||${r.race_num}||${(r.horse_name||'').toUpperCase()}`] = r.sp;
    });
    let pl = 0;
    for (const p of userAllPicksData) {
      const winner = winnerMap[`${p.comp_date}||${normaliseVenue(p.venue||'')}||${p.race_num}`];
      if (winner === undefined) continue; // unsettled race
      const isWin = winner === (p.horse_name || '').toLowerCase();
      if (isWin) {
        const sp = spMap[`${p.comp_date}||${normaliseVenue(p.venue||'')}||${p.race_num}||${(p.horse_name||'').toUpperCase()}`];
        if (sp != null) pl += sp - 1; // no SP → exclude entirely
      } else {
        pl -= 1;
      }
    }
    return Math.round(pl * 100) / 100;
  }, [userAllPicksData, allCompResultsData, historicalRaceSps]);

  // Today P&L for bottom bar (same SP-exclusion rule as allTimePL)
  const todayPL = useMemo(() => {
    let pl = 0;
    for (const [key, horse] of Object.entries(picks)) {
      const winner = liveWinnerMap[key] || results[key];
      if (!winner) continue;
      const isWin = winner.toLowerCase() === horse.toLowerCase();
      if (isWin) {
        const [vn, rn] = key.split('||');
        const rr = todayFinishPos[`${vn}||${rn}||${horse.toUpperCase()}`];
        if (rr?.sp != null) pl += rr.sp - 1;
      } else {
        pl -= 1;
      }
    }
    return Math.round(pl * 100) / 100;
  }, [picks, results, liveWinnerMap, todayFinishPos]);

  function isLocked(race) {
    const jt = jumpDate(race.time, race.date);
    return jt ? jt.getTime() <= now : false;
  }

  // ─── Existing useEffects ──────────────────────────────────────────────────────

  // Update today at midnight without needing a page refresh
  useEffect(() => {
    const id = setInterval(() => {
      setToday(prev => { const d = aestISO(); return d !== prev ? d : prev; });
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ww_csv');
      if (!saved) return;
      const parsed = parseCSV(saved);
      const built  = buildRaces(parsed);
      const races  = Object.values(built.allRaces);
      if (races.length > 0) {
        const sample = races[0].date || '';
        const parts  = sample.split('/');
        const csvISO = parts.length === 3 && parts[2].length === 4
          ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          : /^\d{4}-\d{2}-\d{2}$/.test(sample) ? sample : null;
        if (csvISO && csvISO !== aestISO()) { setCsvStaleDate(csvISO); return; }
      }
      setCsvRaces(built);
    } catch { }
  }, []);

  useEffect(() => {
    if (!user?.id || !isPro || !SURL || !SKEY) return;
    sbFetch(`comp_picks?clerk_id=eq.${encodeURIComponent(user.id)}&comp_date=eq.${today}&select=venue,race_num,horse_name`)
      .then(rows => {
        if (!Array.isArray(rows)) return;
        const p = {};
        rows.forEach(r => { p[rk(r.venue, r.race_num)] = r.horse_name; });
        setPicks(p);
        if (rows.length > 0) setHasSubmitted(true);
      });
  }, [user?.id, today]);

  // Auto-enter: fill any unlocked races with model rank-1 horse when compAutoEnter is enabled
  useEffect(() => {
    if (!settings.compAutoEnter) return;
    if (!user?.id || !isPro) return;
    if (compRaces.length === 0 || Object.keys(mr1Map).length === 0) return;
    compRaces.forEach(race => {
      if (isLocked(race)) return;
      const key = rk(race.venue, race.num);
      if (picks[key]) return; // already has a pick
      const horse = mr1Map[key];
      if (horse) savePick(race, horse);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.compAutoEnter, compRaces.length, Object.keys(mr1Map).length, user?.id, isPro]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function load() {
      sbFetch(`comp_results?comp_date=eq.${today}&select=venue,race_num,winner`)
        .then(rows => {
          if (!Array.isArray(rows)) return;
          const m = {};
          rows.forEach(r => { m[rk(r.venue, r.race_num)] = r.winner; });
          setResults(m);
        });
    }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [today, isPro]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function loadScr() {
      sbFetch(`scratchings?date=eq.${today}&select=venue,race_num,horse_name`).then(rows => {
        if (!Array.isArray(rows)) return;
        const s = new Set();
        rows.forEach(r => { s.add(`${rk(r.venue, r.race_num)}||${(r.horse_name || '').toUpperCase()}`); });
        setScratchings(s);
      });
    }
    loadScr();
    const id = setInterval(loadScr, 60000);
    return () => clearInterval(id);
  }, [today, isPro]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function loadAll() {
      sbFetch(`comp_picks_popular?comp_date=eq.${today}&select=venue,race_num,horse_name,pick_count`)
        .then(rows => { if (Array.isArray(rows)) setPopularData(rows); });
      sbFetch(`comp_picks?comp_date=eq.${today}&hide_picks=eq.false&select=clerk_id,username,venue,race_num,horse_name`)
        .then(rows => { if (Array.isArray(rows)) setAllPicksData(rows); });
    }
    loadAll();
    const id = setInterval(loadAll, 30000);
    return () => clearInterval(id);
  }, [today, isPro]);

  useEffect(() => {
    if (!user?.id || !isPro || !SURL || !SKEY) return;
    function loadPoints() {
      sbFetch(`points_log?clerk_id=eq.${encodeURIComponent(user.id)}&select=points`)
        .then(rows => {
          if (!Array.isArray(rows)) return;
          setAllTimePoints(rows.reduce((s, r) => s + (r.points || 0), 0));
        });
    }
    loadPoints();
    const id = setInterval(loadPoints, 60000);
    return () => clearInterval(id);
  }, [user?.id]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#leaderboard') {
      setMainTab('alltime');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (mainTab !== 'alltime' || !isPro) return;
    let cancelled = false;
    function loadLb() {
      const { start, end } = getLbDateRange(lbTab);
      fetchScores(start, end).then(cur => {
        if (!cancelled) { setLbRows(cur); setLbLoading(false); }
      });
    }
    setLbLoading(true);
    loadLb();
    const id = setInterval(loadLb, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mainTab, lbTab]);

  // ─── New useEffects for record + P&L data ────────────────────────────────────
  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function loadCompScores() {
      sbFetch('comp_scores?select=comp_date,clerk_id,username,correct,total,score,streak')
        .then(rows => { if (Array.isArray(rows)) setAllCompScoresData(rows); });
    }
    loadCompScores();
    const id = setInterval(loadCompScores, 60000);
    return () => clearInterval(id);
  }, [isPro]);

  useEffect(() => {
    if (!user?.id || !isPro || !SURL || !SKEY) return;
    sbFetch(`comp_picks?clerk_id=eq.${encodeURIComponent(user.id)}&select=comp_date,venue,race_num,horse_name`)
      .then(rows => { if (Array.isArray(rows)) setUserAllPicksData(rows); });
  }, [user?.id]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    sbFetch('comp_results?select=comp_date,venue,race_num,winner')
      .then(rows => { if (Array.isArray(rows)) setAllCompResultsData(rows); });
  }, []);

  // Two-phase: fires after userAllPicksData resolves; fetches SP + finish_pos for all pick dates
  useEffect(() => {
    if (!userAllPicksData.length || !SURL || !SKEY || !isPro) return;
    const dates = [...new Set(userAllPicksData.map(p => p.comp_date))];
    if (!dates.length) return;
    sbFetch(`race_results?date=in.(${dates.join(',')})&select=date,venue,race_num,horse_name,sp,finish_pos`)
      .then(rows => { if (Array.isArray(rows)) setHistoricalRaceSps(rows); });
  }, [userAllPicksData]);

  // Today race_results polled for live finish positions in result pills
  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function loadTodayRR() {
      sbFetch(`race_results?date=eq.${today}&select=venue,race_num,horse_name,sp,finish_pos`)
        .then(rows => { if (Array.isArray(rows)) setTodayRaceResultsData(rows); });
    }
    loadTodayRR();
    const id = setInterval(loadTodayRR, 60000);
    return () => clearInterval(id);
  }, [today, isPro]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    fetch(`${SURL}/rest/v1/user_profiles?hide_from_lb=eq.true&select=clerk_id`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => { if (Array.isArray(rows)) setHiddenFromLb(new Set(rows.map(r => r.clerk_id))); })
      .catch(() => {});
  }, [user?.id]);

  // Auto-select first venue tab when selVenues changes
  useEffect(() => {
    if (selVenues.length > 0) setSelCompVenue(sv => !sv || !selVenues.includes(sv) ? selVenues[0] : sv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selVenues.length, selVenues[0]]);

  async function savePick(race, horseName) {
    if (!horseName) return;
    const key = rk(race.venue, race.num);
    if (isLocked(race) && !scratchAlerts.some(r => rk(r.venue, r.num) === key)) return;
    setPicks(p => ({ ...p, [key]: horseName }));
    if (!user?.id || !SURL || !SKEY) return;
    setSavingKey(key);
    await sbFetch('comp_picks?on_conflict=clerk_id,comp_date,venue,race_num', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { clerk_id: user.id, comp_date: today, venue: normaliseVenue(race.venue||''), race_num: +race.num, horse_name: horseName, username: uname, hide_picks: settings.compShowPicks === false },
    });
    setSavingKey(null);
  }

  async function submitAllPicks() {
    if (!user?.id || !SURL || !SKEY || pickedCount === 0) return;
    setSubmitting(true);
    let allOk = true;
    for (const race of compRaces) {
      const key = rk(race.venue, race.num);
      const horse = picks[key];
      if (!horse) continue;
      const res = await sbFetch('comp_picks?on_conflict=clerk_id,comp_date,venue,race_num', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { clerk_id: user.id, comp_date: today, venue: normaliseVenue(race.venue||''), race_num: +race.num, horse_name: horse, username: uname, hide_picks: settings.compShowPicks === false },
      });
      if (res === null) allOk = false;
    }
    const rows = await sbFetch(`comp_picks?comp_date=eq.${today}&select=clerk_id,username,venue,race_num,horse_name`);
    if (Array.isArray(rows)) setAllPicksData(rows);
    setSubmitting(false);
    if (allOk) {
      setHasSubmitted(true);
      setSubmitToast('success');
      setTimeout(() => setSubmitToast(null), 4000);
    } else {
      setSubmitToast('error');
      setTimeout(() => setSubmitToast(null), 4000);
    }
  }

  // ─── Loading gate ─────────────────────────────────────────────────────────────
  if (!isLoaded) return null;

  // ─── Free-tier preview ───────────────────────────────────────────────────────
  if (isPro === false) {
    return (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
        {/* Static fake preview blurred underneath */}
        <div style={{ opacity: 0.18, filter: 'blur(2px)', pointerEvents: 'none', userSelect: 'none', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ background: '#0D1C13', borderBottom: '1px solid #1a3a25', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>Sat 12 Jul</div>
            <div style={{ fontSize: 9, color: '#6b7280', display: 'flex', gap: 6 }}>
              <span>47 entrants</span><span style={{ opacity: 0.4 }}>·</span>
              <span>First jump <span style={{ color: '#fbbf24', fontWeight: 600 }}>10:32 AEST</span></span><span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: '#4ade80' }}>4/4 picked</span>
            </div>
          </div>
          <div style={{ background: '#0D1C13', borderBottom: '1px solid #1a3a25', display: 'flex', flexShrink: 0 }}>
            {[['Your points','9','of 3 decided'],['Rank','#3','of 47'],['$1 P&L','+$2.00','3 settled'],['Next race','Flemington R4','In 8m']].map(([label, main, sub], i) => (
              <div key={i} style={{ flex: 1, padding: '7px 12px', borderRight: '1px solid #1a3a25' }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: label === '$1 P&L' ? '#4ade80' : '#e2e8f0', lineHeight: 1 }}>{main}</div>
                <div style={{ fontSize: 8, color: label === 'Next race' ? '#fbbf24' : '#6b7280', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#0B1F14', borderBottom: '1px solid #1a3a25', padding: '5px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 4 }}>
              {['#4ade80','#4ade80','#f87171','#fbbf24'].map((bg, i) => (
                <div key={i} style={{ flex: 1, background: bg, borderRadius: 1 }} />
              ))}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'ui-monospace,monospace' }}>
              <span style={{ color: '#4ade80', fontWeight: 700 }}>2W</span>
              <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
              <span style={{ color: '#f87171', fontWeight: 700 }}>1L</span>
              <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>1 racing</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: 160, flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', padding: '8px 10px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#00471b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>Y</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>You</div>
                  <div style={{ fontSize: 9, color: '#00471b', fontWeight: 600 }}>#3 today</div>
                </div>
              </div>
              <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Career record</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: '#111827', lineHeight: 1, marginBottom: 6 }}>12: 3-4-2</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[['$1 P&L','+$38.20','#16a34a'],['Hit %','34.1%','#111827'],['All-time pts','142','#111827'],['Best streak','4','#111827']].map(([l,v,c]) => (
                  <div key={l} style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 5px' }}>
                    <div style={{ fontSize: 7, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Last 10</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {['#e5e7eb','#e5e7eb','#fbbf24','#9ca3af','#fbbf24','#e5e7eb','#fbbf24','#e5e7eb','#9ca3af','#fbbf24'].map((bg, i) => (
                  <div key={i} style={{ width: 11, height: 11, borderRadius: 2, background: bg }} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {[['RACE',85],['YOUR PICK',130],['WINNER',110],['FINISH',60],['PTS',50]].map(([h,w],i) => (
                      <th key={h} style={{ padding: '4px 7px', fontSize: 9, fontWeight: 700, color: '#6b7280', textAlign: i >= 3 ? 'center' : 'left', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #e5e7eb', borderRight: i < 4 ? '1px solid #e5e7eb' : 'none', minWidth: w }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={5} style={{ background: '#f0fdf4', borderTop: '2px solid #d1fae5', borderBottom: '1px solid #e5e7eb', padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#00471b', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Flemington</td></tr>
                  {[
                    ['R1  10:45','Sunfire Prince','Sunfire Prince','1st','3'],
                    ['R2  11:10','Storm King','Rapid River','4th','0'],
                    ['R3  11:40','Golden Arrow','','',''],
                    ['R4  12:15','Misty Belle','','',''],
                  ].map(([race, pick, winner, finish, pts], idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 7px', fontSize: 10, color: '#374151', borderRight: '1px solid #e5e7eb' }}>{race}</td>
                      <td style={{ padding: '5px 7px', fontSize: 10, fontWeight: 600, color: '#111827', borderRight: '1px solid #e5e7eb' }}>{pick}</td>
                      <td style={{ padding: '5px 7px', fontSize: 10, color: winner ? '#111827' : '#9ca3af', borderRight: '1px solid #e5e7eb' }}>{winner || (idx === 2 ? '🔴 Racing' : '—')}</td>
                      <td style={{ padding: '5px 7px', fontSize: 10, textAlign: 'center', color: '#374151', borderRight: '1px solid #e5e7eb' }}>{finish || '—'}</td>
                      <td style={{ padding: '5px 7px', fontSize: 11, fontWeight: 800, textAlign: 'center', color: pts === '3' ? '#00471b' : pts === '0' ? '#dc2626' : '#9ca3af' }}>{pts || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ width: 168, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e5e7eb', padding: '6px 8px', overflowY: 'auto' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#111827', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Today&apos;s leaderboard</div>
              {[['1','racing_punter','12','3/3',false],['2','formguide99','10','3/3',false],['3','You','9','2/3',true],['4','BetKing','8','2/3',false],['5','punter_dan','7','2/3',false]].map(([rank,name,score,correct,isMe]) => (
                <div key={rank} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px', borderRadius: 4, marginBottom: 1, background: isMe ? '#eff6ff' : 'transparent', border: isMe ? '1px solid #bfdbfe' : '1px solid transparent' }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', width: 14, textAlign: 'center' }}>#{rank}</span>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: isMe ? '#1d4ed8' : '#00471b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: '#fff' }}>{name[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: isMe ? 700 : 500, color: isMe ? '#1d4ed8' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 7, color: '#9ca3af' }}>{correct} correct</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: isMe ? '#1d4ed8' : '#00471b' }}>{score}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#f3f4f6', margin: '5px 0' }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: '#111827', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Scoring</div>
              {[['Win','+3 pts'],['2nd place','+2 pts'],['3rd place','+1 pt'],['All 4 winners','+3 bonus']].map(([label,val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 8, color: '#6b7280', lineHeight: 1.3 }}>{label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#00471b', marginLeft: 4 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Overlay */}
        {lockVisible && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 40px', textAlign: 'center', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', position: 'relative' }}>
              <button onClick={() => setLockVisible(false)} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🏆</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 8 }}>Daily Competition</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>Pick the winner of each race and climb the daily leaderboard. Pro members only.</div>
              <button onClick={() => setUpgradeOpen(true)} style={{ background: G, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }}>Upgrade to Pro</button>
            </div>
          </div>
        )}
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </main>
    );
  }

  const CT_LINE = '#e5e7eb';

  // Bold date + "daily comp · X/Y picks decided" — full month name, no comma,
  // matching the results/blackbook/my-bets header convention.
  const headerDateStr = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Australia/Brisbane' }).replace(',', '');

  // Shared hairline-table cell styles, lifted from results/page.js's
  // MetricTable (thStyle/tdStyle) — 0.5px borders, #111827 body text, 9px
  // uppercase #6b7280 headers, JetBrains Mono for numeric columns.
  const thStyle = (align) => ({ textAlign: align, padding: '5px 8px', color: '#6b7280', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap', borderBottom: `0.5px solid ${CT_LINE}` });
  const tdStyle = (align, opts = {}) => ({ textAlign: align, padding: '6px 8px', color: '#111827', fontFamily: opts.mono ? MONO : undefined, fontSize: opts.fs || 11, fontWeight: opts.bold ? 700 : 400, whiteSpace: 'nowrap', overflow: opts.ellipsis ? 'hidden' : undefined, textOverflow: opts.ellipsis ? 'ellipsis' : undefined });

  // ─── Leaderboard table — one shared component for both the live Today tab
  // and the historical All-time tab. Today has no real streak data (streak is
  // a comp_scores column only populated once a day settles server-side), so
  // those rows pass streak: null and get a plain "—" rather than a fabricated
  // value. User's own row: pale gold background + "(you)" — no other styling.
  function LeaderboardTable({ rows }) {
    if (!rows.length) return <div style={{ fontSize: 11, color: '#9ca3af', padding: '10px 2px' }}>No entrants yet.</div>;
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={thStyle('left')}>#</th>
            <th style={thStyle('left')}>Tipster</th>
            <th style={thStyle('right')}>Hit%</th>
            <th style={thStyle('left')}>Streak</th>
            <th style={thStyle('right')}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.clerk_id} style={{ borderBottom: '0.5px solid #f3f4f6', background: u.isMe ? '#fffbea' : 'transparent' }}>
              <td style={tdStyle('left', { bold: true })}>{u.rank}</td>
              <td style={tdStyle('left', { ellipsis: true })}>
                {u.username}{u.isMe && <span style={{ color: '#6b7280', fontWeight: 400 }}> (you)</span>}
              </td>
              <td style={tdStyle('right')}>{u.hitPct != null ? `${u.hitPct.toFixed(0)}%` : '—'}</td>
              <td style={tdStyle('left')}>
                {u.streak
                  ? <span style={{ color: u.streak > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{u.streak > 0 ? `${u.streak}W` : `${Math.abs(u.streak)}L`}</span>
                  : <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
              <td style={tdStyle('right', { mono: true, bold: true, fs: 12 })}>{u.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ─── Header bar ──────────────────────────────────────────────────────────────
  const headerBar = (
    <div style={{ background: '#f9fafb', borderBottom: `0.5px solid ${CT_LINE}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#374151' }}>
        <b style={{ color: '#111827' }}>{headerDateStr}</b> daily comp · {decidedCount}/{compRaces.length || 0} picks decided
      </span>
      {userRank === 1 ? (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#fbbf24', color: '#412402' }}>Leading</span>
      ) : userRank ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>#{userRank} of {entrantCount}</span>
      ) : null}
    </div>
  );

  // ─── Footer bar ──────────────────────────────────────────────────────────────
  function FooterBar({ compact }) {
    const plPositive = todayPL >= 0;
    const plStr = (plPositive ? '+$' : '-$') + Math.abs(todayPL).toFixed(2);
    const allLocked = compRaces.length > 0 && compRaces.every(r => isLocked(r));
    let btnBg, btnColor, btnLabel, btnDisabled;
    if (allLocked)                      { btnBg = '#e5e7eb'; btnColor = '#9ca3af'; btnLabel = 'Picks locked';           btnDisabled = true; }
    else if (submitting)                { btnBg = '#e5e7eb'; btnColor = '#6b7280'; btnLabel = 'Saving…';                btnDisabled = true; }
    else if (submitToast === 'success') { btnBg = '#d1fae5'; btnColor = '#065f46'; btnLabel = `✓ ${pickedCount} saved`; btnDisabled = true; }
    else if (submitToast === 'error')   { btnBg = '#fee2e2'; btnColor = '#dc2626'; btnLabel = '✗ Save failed — retry';  btnDisabled = false; }
    else if (hasSubmitted)              { btnBg = '#d1fae5'; btnColor = '#065f46'; btnLabel = 'Submitted ✓';            btnDisabled = false; }
    else if (pickedCount > 0)           { btnBg = '#111827'; btnColor = '#fff';    btnLabel = 'Submit picks';           btnDisabled = false; }
    else                                 { btnBg = '#e5e7eb'; btnColor = '#9ca3af'; btnLabel = 'Submit picks';           btnDisabled = true; }
    return (
      <div style={{ background: '#f9fafb', borderTop: `0.5px solid ${CT_LINE}`, padding: compact ? '8px 12px' : '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#374151' }}>
          {decidedCount} of {compRaces.length} decided · <span style={{ fontWeight: 700, color: '#111827' }}>+{userScore} pts</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: plPositive ? '#16a34a' : '#dc2626', fontFamily: MONO }}>{plStr}</span>
          <button
            onClick={btnDisabled || allLocked ? undefined : submitAllPicks}
            disabled={btnDisabled}
            style={{ padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: 'none', cursor: btnDisabled ? 'default' : 'pointer', background: btnBg, color: btnColor, whiteSpace: 'nowrap' }}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    );
  }

  // ─── Your Picks table ────────────────────────────────────────────────────────
  const picksPanel = (() => {
    const activeRaces = racesByVenue[selCompVenue] || [];
    return (
      <div style={{ background: '#fff', display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden', flex: isMobile ? undefined : 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 6px', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>Your Picks</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>3-2-1 pts scale · +3 bonus for 4/4</span>
        </div>
        {selVenues.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {selVenues.map(v => (
              <button key={v} onClick={() => { setSelCompVenue(v); setOpenPickKey(null); }}
                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, border: `0.5px solid ${selCompVenue === v ? '#111827' : CT_LINE}`, cursor: 'pointer', fontFamily: 'inherit', background: selCompVenue === v ? '#111827' : '#fff', color: selCompVenue === v ? '#fff' : '#374151' }}>
                {v}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: isMobile ? undefined : 1, overflowY: isMobile ? 'visible' : 'auto', padding: '0 16px' }}>
          {csvStaleDate && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>Data from {csvStaleDate} — today&apos;s comp opens when new data loads</div>}
          {!csvRaces && !csvStaleDate && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>Loading race data…</div>}
          {csvRaces && compRaces.length === 0 && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>No races available today</div>}
          {csvRaces && compRaces.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={thStyle('left')}>Race</th>
                  <th style={thStyle('left')}>Selection</th>
                  <th style={thStyle('right')}>Result</th>
                </tr>
              </thead>
              <tbody>
                {activeRaces.map(race => {
                  const key = rk(race.venue, race.num);
                  const locked = isLocked(race);
                  const pick = picks[key];
                  const winner = liveWinnerMap[key] || results[key];
                  const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
                  const canOpen = !locked || !!isScratched;
                  const isOpen = openPickKey === key;
                  const activeHorses = (race.horses || []).filter(h => !h.scratched && !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`));
                  let pts = null, finishPos = null;
                  if (winner && pick) {
                    const rr = todayFinishPos[`${key}||${pick.toUpperCase()}`];
                    finishPos = rr?.pos ?? null;
                    pts = finishPos != null ? scorePick(finishPos) : (winner.toLowerCase() === pick.toLowerCase() ? 3 : 0);
                  }
                  return (
                    <Fragment key={key}>
                      {isScratched ? (
                        <tr style={{ background: '#fef2f2', borderBottom: '0.5px solid #f3f4f6' }}>
                          <td style={tdStyle('left', { mono: true, bold: true })}>R{race.num}</td>
                          <td colSpan={2} onClick={() => canOpen && setOpenPickKey(isOpen ? null : key)} style={{ padding: '6px 8px', fontSize: 11, color: '#dc2626', fontWeight: 600, cursor: canOpen ? 'pointer' : 'default' }}>
                            <i className="ti ti-alert-triangle" style={{ fontSize: 11, marginRight: 4 }} />
                            {pick} scratched — please re-pick
                          </td>
                        </tr>
                      ) : (
                        <tr onClick={() => canOpen && setOpenPickKey(isOpen ? null : key)} style={{ borderBottom: '0.5px solid #f3f4f6', cursor: canOpen ? 'pointer' : 'default' }}>
                          <td style={tdStyle('left', { mono: true, bold: true })}>R{race.num}</td>
                          <td style={tdStyle('left', { ellipsis: true })}>
                            {pick || (canOpen ? <span style={{ color: '#9ca3af' }}>Pick ▾</span> : <span style={{ color: '#9ca3af' }}>—</span>)}
                          </td>
                          <td style={tdStyle('right')}>
                            {winner ? (
                              !pick ? <span style={{ color: '#9ca3af' }}>no pick</span>
                              : pts > 0 ? <span style={{ color: '#16a34a', fontWeight: 700 }}>{finishPos ? `${ordinal(finishPos)} · +${pts}` : `Won · +${pts}`}</span>
                              : <span style={{ color: '#dc2626', fontWeight: 700 }}>{finishPos ? `${ordinal(finishPos)} · 0` : '0'}</span>
                            ) : <span style={{ color: '#9ca3af' }}>pending</span>}
                          </td>
                        </tr>
                      )}
                      {isOpen && (
                        <tr>
                          <td colSpan={3} style={{ padding: '6px 8px', background: '#f9fafb' }}>
                            {activeHorses.length === 0 ? <div style={{ fontSize: 11, color: '#9ca3af' }}>No horses available</div> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {activeHorses.map(h => (
                                  <button key={h.name} onClick={(e) => { e.stopPropagation(); savePick(race, h.name); setOpenPickKey(null); }}
                                    style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', background: pick === h.name ? '#d1fae5' : '#fff', color: '#111827', border: `0.5px solid ${pick === h.name ? '#16a34a' : CT_LINE}` }}>
                                    {h.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <FooterBar compact={isMobile} />
      </div>
    );
  })();

  // ─── Today tab ───────────────────────────────────────────────────────────────
  const todayLbRows = todayLeaderboard.map(e => ({
    clerk_id: e.clerk_id, rank: e.rank, username: e.uname,
    hitPct: e.decided > 0 ? (e.correct / e.decided * 100) : null,
    streak: null, score: e.score, isMe: e.isMe,
  }));

  const leaderboardCard = (
    <div style={{ background: '#fff', padding: '14px 16px', overflowY: isMobile ? 'visible' : 'auto' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
        Leaderboard <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>· {entrantCount} entrant{entrantCount !== 1 ? 's' : ''}</span>
      </div>
      <LeaderboardTable rows={todayLbRows} />
      <button onClick={() => setMainTab('alltime')} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#111827', padding: 0 }}>
        Full leaderboard →
      </button>
    </div>
  );

  const todayTab = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'auto' : 'hidden', background: '#fff' }}>
      {headerBar}
      {scratchAlerts.length > 0 && (
        <div style={{ background: '#fef2f2', borderBottom: '0.5px solid #fecaca', padding: '6px 16px', flexShrink: 0 }}>
          {scratchAlerts.map(race => (
            <div key={rk(race.venue, race.num)} style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 11, marginRight: 4 }} />
              {picks[rk(race.venue, race.num)]} scratched in {titleCase(race.venue)} R{race.num} — re-pick below
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, display: isMobile ? 'flex' : 'grid', flexDirection: isMobile ? 'column' : undefined, gridTemplateColumns: isMobile ? undefined : '38fr 62fr', overflow: isMobile ? 'visible' : 'hidden' }}>
        <div style={{ borderRight: isMobile ? 'none' : `0.5px solid ${CT_LINE}`, borderBottom: isMobile ? `0.5px solid ${CT_LINE}` : 'none' }}>
          {leaderboardCard}
        </div>
        {picksPanel}
      </div>
    </div>
  );

  // ─── All-time tab ────────────────────────────────────────────────────────────
  const lbAllRows = lbRanked.map(u => ({
    clerk_id: u.clerk_id, rank: u.rank, username: u.username,
    hitPct: u.hitPct, streak: u.streak, score: u.score, isMe: u.clerk_id === user?.id,
  }));

  const allTimeTab = (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ background: '#f9fafb', borderBottom: `0.5px solid ${CT_LINE}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setMainTab('today')} style={{ background: 'none', border: 'none', color: '#111827', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          ← Today
        </button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LB_TABS.map(t => {
            const active = lbTab === t.id;
            return (
              <button key={t.id} onClick={() => setLbTab(t.id)}
                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, border: `0.5px solid ${active ? '#111827' : CT_LINE}`, cursor: 'pointer', fontFamily: 'inherit', background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151' }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {lbLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 12 }}>Loading…</div>}
        {!lbLoading && lbRanked.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 12 }}>No competition data yet. Scores are computed after each race day.</div>
        )}
        {!lbLoading && lbRanked.length > 0 && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Leaderboard</div>
            <LeaderboardTable rows={lbAllRows} />
            <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af', lineHeight: 1.6 }}>
              Ties are broken by hit rate. Scores recalculate after each race day.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      {mainTab === 'today' ? todayTab : allTimeTab}
    </main>
  );
}
