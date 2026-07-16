'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
const MEDAL_BG     = ['#fef9c3', '#f1f5f9', '#fdf4ff'];
const MEDAL_BORDER = ['#fbbf24', '#94a3b8', '#c084fc'];
const MEDAL_ICON   = ['🥇', '🥈', '🥉'];
const RANK_COLOR   = ['#d97706', '#6b7280', '#7c3aed'];

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
  const [lbPrevRows, setLbPrevRows] = useState([]);
  const [lbLoading, setLbLoading]   = useState(false);

  // Record + P&L state
  const [allCompScoresData, setAllCompScoresData]     = useState([]);
  const [userAllPicksData, setUserAllPicksData]       = useState([]);
  const [allCompResultsData, setAllCompResultsData]   = useState([]);
  const [historicalRaceSps, setHistoricalRaceSps]     = useState([]);
  const [todayRaceResultsData, setTodayRaceResultsData] = useState([]);
  const [prevTodayLbRanks, setPrevTodayLbRanks] = useState({});
  const prevTodayLbRanksRef = useRef({});
  const [openPickKey, setOpenPickKey]   = useState(null);
  const [selCompVenue, setSelCompVenue] = useState(null);

  const [today, setToday] = useState(() => aestISO());
  const uname = user ? (user.fullName || user.username || user.firstName || 'Anon') : 'Anon';
  const initials = user
    ? (((user.firstName?.[0] || '') + (user.lastName?.[0] || '')) || uname[0] || '?').toUpperCase()
    : '?';

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

  const nextRace = useMemo(() => compRaces
    .filter(r => { const jt = jumpDate(r.time, r.date); return jt && jt.getTime() > now; })
    .sort((a, b) => (jumpDate(a.time, a.date)?.getTime() || 0) - (jumpDate(b.time, b.date)?.getTime() || 0))[0] || null
  , [compRaces, now]);

  const raceStatuses = useMemo(() => compRaces.map(r => {
    const k = rk(r.venue, r.num);
    const winner = liveWinnerMap[k] || results[k];
    const pick = picks[k];
    if (winner) return !pick ? 'nopick' : winner.toLowerCase() === pick.toLowerCase() ? 'won' : 'lost';
    const s = getStatus(r);
    return s === 'racing' ? 'racing' : 'upcoming';
  }), [compRaces, picks, results, liveWinnerMap, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const lbRanked      = useMemo(() => applyLbRanks(aggregateLb(lbRows.filter(r => !hiddenFromLb.has(r.clerk_id)))),     [lbRows, hiddenFromLb]);
  const lbPrevRanked  = useMemo(() => applyLbRanks(aggregateLb(lbPrevRows)), [lbPrevRows]);
  const lbPrevRankMap = useMemo(() => {
    const m = {};
    lbPrevRanked.forEach(u => { m[u.clerk_id] = u.rank; });
    return m;
  }, [lbPrevRanked]);

  // Per-user last-10 form strips for leaderboard table
  const lbUserForms = useMemo(() => {
    if (!lbRows.length) return {};
    const byDate = {};
    lbRows.forEach(r => {
      if (!byDate[r.comp_date]) byDate[r.comp_date] = [];
      byDate[r.comp_date].push(r);
    });
    const forms = {};
    for (const dateKey of Object.keys(byDate).sort()) {
      const ranked = applyLbRanks(aggregateLb(byDate[dateKey]));
      ranked.forEach(u => {
        if (!forms[u.clerk_id]) forms[u.clerk_id] = [];
        forms[u.clerk_id].push(u.rank);
      });
    }
    for (const k of Object.keys(forms)) forms[k] = forms[k].slice(-10);
    return forms;
  }, [lbRows]);

  const scratchAlerts = useMemo(() => compRaces.filter(r => {
    const key = rk(r.venue, r.num);
    const pick = picks[key];
    return pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
  }), [compRaces, picks, scratchings]);

  const meetingPrize = useMemo(() => {
    const m = {};
    if (!csvRaces) return m;
    Object.values(csvRaces.allRaces).forEach(race => {
      const v = normaliseVenue(race.venue||'');
      if (!selVenues.includes(v)) return;
      const p = parseFloat((race.prize || '0').replace(/[^0-9.]/g, '')) || 0;
      m[v] = (m[v] || 0) + p;
    });
    return m;
  }, [csvRaces, selVenues]);

  const closingTime = useMemo(() => {
    if (!compRaces.length) return null;
    const sorted = [...compRaces].sort((a, b) => {
      const at = jumpDate(a.time, a.date), bt = jumpDate(b.time, b.date);
      return (at?.getTime() || 0) - (bt?.getTime() || 0);
    });
    return sorted[0]?.time || null;
  }, [compRaces]);

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

  function getStatus(race) {
    const key = rk(race.venue, race.num);
    const winner = liveWinnerMap[key] || results[key];
    if (winner) {
      const pick = picks[key];
      if (!pick) return 'nopick';
      return winner.toLowerCase() === pick.toLowerCase() ? 'won' : 'lost';
    }
    const jt = jumpDate(race.time, race.date);
    if (!jt) return 'pending';
    if (jt.getTime() > now) return 'pending';
    return (now - jt.getTime()) > 3 * 60 * 60 * 1000 ? 'result_pending' : 'racing';
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
      sbFetch(`comp_picks?comp_date=eq.${today}&select=clerk_id,username,venue,race_num,horse_name`)
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
      const prevEnd = dateMinusDays(end, 7);
      Promise.all([fetchScores(start, end), fetchScores(start, prevEnd)])
        .then(([cur, prev]) => {
          if (!cancelled) { setLbRows(cur); setLbPrevRows(prev); setLbLoading(false); }
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

  // Snapshot today's lb ranks before each change for ▲/▼ movement display
  useEffect(() => {
    if (!todayLeaderboard.length) return;
    const prev = prevTodayLbRanksRef.current;
    if (Object.keys(prev).length) setPrevTodayLbRanks(prev);
    const snap = {};
    todayLeaderboard.forEach(e => { snap[e.clerk_id] = e.rank; });
    prevTodayLbRanksRef.current = snap;
  }, [todayLeaderboard]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    fetch(`${SURL}/rest/v1/user_profiles?hide_from_lb=eq.true&select=clerk_id`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => { if (Array.isArray(rows)) setHiddenFromLb(new Set(rows.map(r => r.clerk_id))); })
      .catch(() => {});
  }, []);

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

  const DK_BG   = '#0B1F14';
  const DK_HDR  = '#0D1C13';
  const DK_LINE = '#1a3a25';
  const DK_TEXT = '#e2e8f0';
  const DK_MUT  = '#6b7280';
  const CT_LINE = '#e5e7eb';
  const CT_MUT  = '#6b7280';
  const CELL  = { borderBottom: `1px solid ${CT_LINE}`, borderRight: `1px solid ${CT_LINE}`, verticalAlign: 'middle', padding: '3px 7px' };
  const DCELL = { borderBottom: `1px solid ${DK_LINE}`, borderRight: `1px solid ${DK_LINE}`, verticalAlign: 'middle', padding: '3px 7px' };

  const headerDateStr = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Brisbane' });

  // ─── Race row renderer ────────────────────────────────────────────────────────
  function renderRaceRow(race) {
    const key = rk(race.venue, race.num);
    const locked = isLocked(race);
    const status = getStatus(race);
    const pick = picks[key];
    const winner = liveWinnerMap[key] || results[key];
    const jt = jumpDate(race.time, race.date);
    const msToJump = jt ? jt.getTime() - now : null;
    const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
    const activeHorses = (race.horses || []).filter(h => !h.scratched && !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`));

    let rowBg = DK_BG;
    if (winner) {
      if (pick && winner.toLowerCase() === pick.toLowerCase()) rowBg = '#052e16';
      else if (pick) rowBg = '#1c0a0a';
    } else if (status === 'racing') {
      rowBg = '#1a1200';
    }

    // JUMP cell: countdown / race status / pick finish
    let jumpCell;
    if (winner) {
      if (pick && winner.toLowerCase() === pick.toLowerCase()) {
        jumpCell = <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80' }}>WIN ✓</span>;
      } else if (pick) {
        const [vn, rn] = key.split('||');
        const rr = todayFinishPos[`${vn}||${rn}||${pick.toUpperCase()}`];
        jumpCell = rr?.pos
          ? <span style={{ fontSize: 10, color: '#6b7280', fontFamily: MONO }}>{ordinal(rr.pos)}</span>
          : <span style={{ fontSize: 9, color: '#4b5563' }}>Done</span>;
      } else {
        jumpCell = <span style={{ fontSize: 9, color: '#4b5563' }}>Done</span>;
      }
    } else if (status === 'racing') {
      jumpCell = <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706' }}>Racing</span>;
    } else if (status === 'result_pending') {
      jumpCell = <span style={{ fontSize: 9, color: DK_MUT }}>Pending</span>;
    } else if (msToJump !== null && msToJump > 0) {
      const underTen = msToJump < 600000;
      jumpCell = <span style={{ fontSize: 10, fontWeight: underTen ? 700 : 400, color: underTen ? '#fbbf24' : DK_MUT, fontFamily: MONO }}>{fmtMs(msToJump) || race.time}</span>;
    } else {
      jumpCell = <span style={{ fontSize: 9, color: '#374151' }}>—</span>;
    }

    // WINNER cell
    const winnerCell = winner
      ? <span style={{ fontSize: 10, fontWeight: 600, color: DK_TEXT }}>{winner}</span>
      : <span style={{ fontSize: 9, color: '#374151' }}>—</span>;

    // PTS cell
    let ptsCell;
    if (winner) {
      let pts = 0;
      if (pick) {
        const [vn, rn] = key.split('||');
        const rr = todayFinishPos[`${vn}||${rn}||${pick.toUpperCase()}`];
        pts = rr?.pos != null ? scorePick(rr.pos) : (winner.toLowerCase() === pick.toLowerCase() ? 3 : 0);
      }
      const ptsColor = pts === 3 ? '#4ade80' : pts === 2 ? '#86efac' : pts === 1 ? '#9ca3af' : '#4b5563';
      ptsCell = <span style={{ fontSize: 11, fontWeight: 700, color: ptsColor, fontFamily: MONO }}>{pts > 0 ? `+${pts}` : '0'}</span>;
    } else {
      ptsCell = <span style={{ fontSize: 10, color: '#374151' }}>·</span>;
    }

    return (
      <>
        {isScratched && (
          <tr key={`${key}-alert`}>
            <td colSpan={5} style={{ padding: '3px 10px', background: '#2d0a0a', borderBottom: `1px solid ${DK_LINE}` }}>
              <span style={{ fontSize: 9, color: '#f87171', fontWeight: 700 }}>⚠ {pick} scratched — please re-pick below</span>
            </td>
          </tr>
        )}
        <tr key={key} style={{ background: rowBg }}>
          <td style={{ ...DCELL, minWidth: 70 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DK_TEXT, fontFamily: MONO, whiteSpace: 'nowrap' }}>
              R{race.num}
            </div>
          </td>
          <td style={{ ...DCELL, minWidth: 80 }}>
            {jumpCell}
          </td>
          <td style={{ ...DCELL, minWidth: 130 }}>
            {locked && !isScratched ? (
              <span style={{ fontSize: 10, fontWeight: 600, color: pick ? '#4ade80' : DK_MUT }}>
                {pick || <span style={{ color: DK_MUT }}>No pick</span>}
              </span>
            ) : (
              <div>
                <select
                  value={pick || ''}
                  onChange={e => savePick(race, e.target.value)}
                  style={{
                    fontSize: 10, padding: '3px 5px', borderRadius: 4, width: '100%', maxWidth: 145,
                    border: `1px solid ${isScratched ? '#dc2626' : pick ? '#16a34a' : DK_LINE}`,
                    background: '#0a1a0f',
                    color: isScratched ? '#f87171' : pick ? '#4ade80' : '#9ca3af',
                    cursor: 'pointer', boxSizing: 'border-box', outline: 'none',
                  }}
                >
                  <option value="">PICK ▾</option>
                  {activeHorses.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                </select>
                {savingKey === key && <div style={{ fontSize: 8, color: DK_MUT, marginTop: 1 }}>Saving…</div>}
              </div>
            )}
          </td>
          <td style={{ ...DCELL, minWidth: 110 }}>
            {winnerCell}
          </td>
          <td style={{ ...DCELL, borderRight: 'none', minWidth: 50, textAlign: 'center' }}>
            {ptsCell}
          </td>
        </tr>
      </>
    );
  }

  // ─── Bottom status bar ────────────────────────────────────────────────────────
  function SubmitFooter({ compact }) {
    const allLocked = compRaces.length > 0 && compRaces.every(r => isLocked(r));
    const plStr = (todayPL >= 0 ? '+$' : '-$') + Math.abs(todayPL).toFixed(2);
    const plColor = todayPL >= 0 ? '#4ade80' : '#f87171';

    let btnBg, btnColor, btnLabel, btnDisabled;
    if (allLocked) {
      btnBg = DK_LINE; btnColor = '#374151'; btnLabel = 'Picks locked'; btnDisabled = true;
    } else if (submitting) {
      btnBg = DK_LINE; btnColor = '#9ca3af'; btnLabel = 'Saving…'; btnDisabled = true;
    } else if (submitToast === 'success') {
      btnBg = '#166534'; btnColor = '#4ade80'; btnLabel = `✓ ${pickedCount} picks locked in`; btnDisabled = true;
    } else if (submitToast === 'error') {
      btnBg = '#7f1d1d'; btnColor = '#f87171'; btnLabel = '✗ Save failed — retry'; btnDisabled = false;
    } else if (hasSubmitted) {
      btnBg = '#14532d'; btnColor = '#86efac'; btnLabel = 'Picks submitted ✓'; btnDisabled = false;
    } else if (pickedCount > 0) {
      btnBg = '#16a34a'; btnColor = '#fff'; btnLabel = 'Submit picks'; btnDisabled = false;
    } else {
      btnBg = DK_LINE; btnColor = '#374151'; btnLabel = 'Submit picks'; btnDisabled = true;
    }

    return (
      <div style={{ background: DK_HDR, borderTop: `1px solid ${DK_LINE}`, padding: compact ? '5px 12px' : '6px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1, fontSize: 10, color: DK_TEXT, fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span>Running score: {decidedCount}/{compRaces.length} decided</span>
          <span style={{ margin: '0 5px', opacity: 0.4 }}>·</span>
          <span style={{ color: '#4ade80', fontWeight: 700 }}>+{userScore} pts</span>
          <span style={{ margin: '0 5px', opacity: 0.4 }}>·</span>
          <span>$1 P&amp;L today: <span style={{ color: plColor, fontWeight: 700 }}>{plStr}</span></span>
        </div>
        <button
          onClick={btnDisabled || allLocked ? undefined : submitAllPicks}
          disabled={btnDisabled}
          style={{
            padding: compact ? '5px 10px' : '6px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
            border: 'none', flexShrink: 0,
            cursor: btnDisabled ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            background: btnBg, color: btnColor,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {btnLabel}
        </button>
      </div>
    );
  }

  // ─── Gold Status Band ────────────────────────────────────────────────────────
  const statusBand = (() => {
    const d = new Date();
    const dateLabel = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Australia/Brisbane' })
      .toUpperCase().replace(',', '') + ' DAILY COMP';
    const nrMs  = nextRace ? ((jumpDate(nextRace.time, nextRace.date)?.getTime() || 0) - now) : null;
    const nrCd  = nrMs !== null && nrMs > 0 ? fmtMs(nrMs) : null;
    const nrLabel = nextRace
      ? `⏱ NEXT: ${titleCase(normaliseVenue(nextRace.venue || ''))} R${nextRace.num}${nrCd ? ` · ${nrCd}` : ''}`
      : null;
    const total = compRaces.length;
    const picksLabel = pickedCount === total && total > 0
      ? `PICKS: ${pickedCount}/${total} ✓`
      : `${pickedCount}/${total || '?'} — ${total - pickedCount > 0 ? total - pickedCount : total} TO PICK`;
    let statusLabel;
    if (pickedCount === 0) statusLabel = "ENTER TODAY'S COMP →";
    else if (userRank === 1) statusLabel = "👑 YOU'RE LEADING";
    else if (userRank) statusLabel = `YOU: ${ordinal(userRank).toUpperCase()} · ${userScore} PTS`;
    else statusLabel = `${userScore} PTS`;
    return (
      <div style={{ background: '#fbbf24', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#78350f', whiteSpace: 'nowrap' }}>{dateLabel}</span>
        {nrLabel && <span style={{ fontSize: 16, fontWeight: 800, color: '#78350f', fontFamily: MONO, whiteSpace: 'nowrap' }}>{nrLabel}</span>}
        <span style={{ fontSize: 13, fontWeight: 800, color: '#78350f', whiteSpace: 'nowrap' }}>{picksLabel}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: '#78350f', whiteSpace: 'nowrap' }}>{statusLabel}</span>
      </div>
    );
  })();

  // ─── Today leaderboard — left panel ──────────────────────────────────────────
  const lbLeaderScore = todayLeaderboard[0]?.score || 1;
  const lbUserIdx     = todayLeaderboard.findIndex(e => e.isMe);
  const lbUserEntry   = todayLeaderboard.find(e => e.isMe);
  const lbGapMsg = (() => {
    if (!lbUserEntry || lbUserEntry.rank <= 3) return '';
    const r3 = todayLeaderboard.find(e => e.rank === 3);
    if (!r3) return 'chasing the podium';
    const gap = r3.score - lbUserEntry.score;
    return gap <= 3 ? `${gap} pt${gap !== 1 ? 's' : ''} off podium ↑` : 'chasing the podium';
  })();
  let lbDisplayRows = [];
  let lbEllipsis    = false;
  if (todayLeaderboard.length > 0) {
    if (lbUserIdx === -1) {
      lbDisplayRows = todayLeaderboard.slice(0, Math.min(6, todayLeaderboard.length));
    } else if (lbUserIdx <= 5) {
      lbDisplayRows = todayLeaderboard.slice(0, Math.min(todayLeaderboard.length, lbUserIdx + 2));
    } else {
      lbEllipsis = true;
      const ws = Math.max(3, lbUserIdx - 1);
      const we = Math.min(todayLeaderboard.length, lbUserIdx + 2);
      lbDisplayRows = [...todayLeaderboard.slice(0, 3), ...todayLeaderboard.slice(ws, we)];
    }
  }
  const renderLbEntry = (e) => {
    const r = e.rank;
    if (e.isMe) {
      return (
        <div key={e.clerk_id} style={{ background: '#fbbf24', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: '#78350f', width: 26, flexShrink: 0 }}>#{r}</span>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: '#78350f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ► YOU ({titleCase(uname)}){lbGapMsg ? ` · ${lbGapMsg}` : ''}
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: '#78350f', flexShrink: 0 }}>{e.score}</span>
        </div>
      );
    }
    if (r === 1) {
      const barPct = lbLeaderScore > 0 ? Math.round(e.score / lbLeaderScore * 100) : 100;
      return (
        <div key={e.clerk_id} style={{ background: '#0a4d23', border: '2px solid #fbbf24', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#78350f', fontFamily: MONO }}>1</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.uname}</div>
            <div style={{ height: 9, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: '#fbbf24', borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ fontSize: 28, fontWeight: 900, fontFamily: MONO, color: '#fbbf24', flexShrink: 0 }}>{e.score}</span>
        </div>
      );
    }
    const mBg   = r === 2 ? '#e5e7eb' : '#f59e0b';
    const mTxt  = r === 2 ? '#374151' : '#ffffff';
    const bFill = r === 2 ? '#e5e7eb' : '#f59e0b';
    const pts   = r === 2 ? 23 : 23;
    const barPct = lbLeaderScore > 0 ? Math.round(e.score / lbLeaderScore * 100) : 0;
    if (r === 2 || r === 3) {
      return (
        <div key={e.clerk_id} style={{ background: '#0a4d23', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: mBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: mTxt, fontFamily: MONO }}>{r}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.uname}</div>
            <div style={{ height: 9, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: bFill, borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ fontSize: pts, fontWeight: 900, fontFamily: MONO, color: '#ffffff', flexShrink: 0 }}>{e.score}</span>
        </div>
      );
    }
    return (
      <div key={e.clerk_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontFamily: MONO, width: 28, flexShrink: 0 }}>#{r}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.uname}</span>
        <span style={{ fontSize: 17, fontWeight: 800, fontFamily: MONO, color: '#ffffff', flexShrink: 0 }}>{e.score}</span>
      </div>
    );
  };

  const newLeftPanel = (
    <div style={{ background: '#0d5f2b', padding: '18px 22px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1 }}>🏆 TODAY&apos;S LEADERBOARD</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#7CFC9B' }}>● LIVE · {entrantCount} PUNTER{entrantCount !== 1 ? 'S' : ''}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {todayLeaderboard.length === 0 ? (
          <>
            {pickedCount > 0 && (
              <div style={{ background: '#fbbf24', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: '#78350f', width: 26, flexShrink: 0 }}>#1</span>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: '#78350f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>► YOU ({titleCase(uname)})</span>
                <span style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: '#78350f', flexShrink: 0 }}>{userScore}</span>
              </div>
            )}
            <div style={{ padding: '8px 4px', fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.4)' }}>
              Invite punters — be here when they arrive
            </div>
          </>
        ) : (
          <>
            {lbDisplayRows.slice(0, lbEllipsis ? 3 : lbDisplayRows.length).map(e => renderLbEntry(e))}
            {lbEllipsis && (
              <div key="ellipsis" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '4px 0 6px' }}>···</div>
            )}
            {lbEllipsis && lbDisplayRows.slice(3).map(e => renderLbEntry(e))}
            {todayLeaderboard.length <= 1 && (
              <div style={{ padding: '8px 4px', fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.4)' }}>
                Invite punters — be here when they arrive
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 8 }}>
        <button onClick={() => setMainTab('alltime')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 900, color: '#fbbf24' }}>
          FULL LEADERBOARD →
        </button>
      </div>
    </div>
  );

  // ─── Picker — right panel ─────────────────────────────────────────────────────
  const newRightPanel = (() => {
    const activeRaces = racesByVenue[selCompVenue] || [];
    const plSign = todayPL >= 0 ? '+$' : '-$';
    const plStr  = plSign + Math.abs(todayPL).toFixed(2);
    const allLocked   = compRaces.length > 0 && compRaces.every(r => isLocked(r));
    let btnBg, btnColor, btnLabel, btnDisabled;
    if (allLocked)                          { btnBg = '#374151'; btnColor = '#6b7280'; btnLabel = 'Picks locked';               btnDisabled = true; }
    else if (submitting)                    { btnBg = '#374151'; btnColor = '#9ca3af'; btnLabel = 'Saving…';                    btnDisabled = true; }
    else if (submitToast === 'success')     { btnBg = '#16a34a'; btnColor = '#fff';    btnLabel = `✓ ${pickedCount} picks in`; btnDisabled = true; }
    else if (submitToast === 'error')       { btnBg = '#7f1d1d'; btnColor = '#f87171'; btnLabel = '✗ Save failed — retry';      btnDisabled = false; }
    else if (hasSubmitted)                  { btnBg = '#16a34a'; btnColor = '#fff';    btnLabel = 'PICKS SUBMITTED ✓';          btnDisabled = false; }
    else if (pickedCount > 0)               { btnBg = '#fbbf24'; btnColor = '#78350f'; btnLabel = 'SUBMIT PICKS';               btnDisabled = false; }
    else                                    { btnBg = '#374151'; btnColor = '#6b7280'; btnLabel = 'SUBMIT PICKS';               btnDisabled = true; }
    return (
      <div style={{ background: '#ffffff', padding: '18px 22px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#00471b', textTransform: 'uppercase', letterSpacing: 0.5 }}>YOUR PICKS</span>
          <span style={{ fontSize: 12, color: '#374151' }}>3-2-1 pts · +3 bonus for 4/4</span>
        </div>
        {/* Venue tabs */}
        {selVenues.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexShrink: 0, flexWrap: 'wrap' }}>
            {selVenues.map(v => (
              <button key={v} onClick={() => { setSelCompVenue(v); setOpenPickKey(null); }}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: selCompVenue === v ? '#00471b' : '#e5e7eb', color: selCompVenue === v ? '#fff' : '#374151' }}>
                {v}
              </button>
            ))}
          </div>
        )}
        {/* Race list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {csvStaleDate && (
            <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 13 }}>
              Data from {csvStaleDate} — today&apos;s comp opens when new data loads
            </div>
          )}
          {!csvRaces && !csvStaleDate && (
            <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 13 }}>Loading race data…</div>
          )}
          {csvRaces && compRaces.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 13 }}>No races available today</div>
          )}
          {csvRaces && compRaces.length > 0 && activeRaces.map(race => {
            const key         = rk(race.venue, race.num);
            const locked      = isLocked(race);
            const pick        = picks[key];
            const winner      = liveWinnerMap[key] || results[key];
            const jt          = jumpDate(race.time, race.date);
            const msToJump    = jt ? jt.getTime() - now : null;
            const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
            const canOpen     = !locked || !!isScratched;
            const isOpen      = openPickKey === key;
            const activeHorses = (race.horses || []).filter(h => {
              if (h.scratched) return false;
              return !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`);
            });
            let pts = null;
            if (winner && pick) {
              const rr = todayFinishPos[`${key}||${pick.toUpperCase()}`];
              pts = rr?.pos != null ? scorePick(rr.pos) : (winner.toLowerCase() === pick.toLowerCase() ? 3 : 0);
            }
            return (
              <div key={key}>
                {isScratched && (
                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, padding: '4px 0 2px' }}>⚠ {pick} scratched — please re-pick</div>
                )}
                <div
                  onClick={() => canOpen && setOpenPickKey(isOpen ? null : key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1.5px solid #e5e7eb', cursor: canOpen ? 'pointer' : 'default' }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#00471b', flexShrink: 0 }}>R{race.num}</span>
                  {!winner && msToJump !== null && msToJump > 0 && (
                    <span style={{ fontSize: 13, fontFamily: MONO, color: '#6b7280', flexShrink: 0 }}>{fmtMs(msToJump)}</span>
                  )}
                  {winner ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick || '—'}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: pts > 0 ? '#16a34a' : '#9ca3af', flexShrink: 0 }}>
                        {pts === null ? `W: ${winner}` : pts > 0 ? `WON +${pts}` : `${winner} · 0 pts`}
                      </span>
                    </div>
                  ) : (
                    <span style={{ flex: 1, fontSize: 15, fontWeight: pick ? 700 : 400, color: pick ? '#111827' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pick || ''}
                    </span>
                  )}
                  {!winner && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: (locked && !isScratched) ? '#16a34a' : '#dc2626', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {(locked && !isScratched) ? 'LOCKED ✓ · change ▾' : 'PICK ▾'}
                    </span>
                  )}
                </div>
                {isOpen && (
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', margin: '6px 0 10px' }}>
                    {activeHorses.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#9ca3af', padding: '6px 0' }}>No horses available</div>
                    ) : activeHorses.map(h => (
                      <button key={h.name}
                        onClick={() => { savePick(race, h.name); setOpenPickKey(null); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 15, fontWeight: 600, color: '#111827', background: pick === h.name ? '#d1fae5' : 'transparent', border: pick === h.name ? '1px solid #16a34a' : '1px solid transparent', borderRadius: 6, cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit' }}>
                        {h.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Footer bar */}
        <div style={{ background: '#111827', borderRadius: 8, padding: '10px 14px', marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 13, fontFamily: MONO, color: '#7CFC9B', lineHeight: 1.3 }}>
            {decidedCount}/{compRaces.length} DECIDED · +{userScore} PTS · P&amp;L {plStr}
          </span>
          <button
            onClick={btnDisabled || allLocked ? undefined : submitAllPicks}
            disabled={btnDisabled}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 800, border: 'none', cursor: btnDisabled ? 'default' : 'pointer', background: btnBg, color: btnColor, flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {btnLabel}
          </button>
        </div>
      </div>
    );
  })();

  // ─── Historical leaderboard panel ───────────────────────────────────────────
  function lbMvmt(u) {
    const prev = lbPrevRankMap[u.clerk_id];
    if (prev == null) return null;
    return prev - u.rank;
  }

  const allTimePanel = (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0d5f2b' }}>
      {/* Nav: back + tab pills */}
      <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setMainTab('today')}
          style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: 13, fontWeight: 900, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          ← Today
        </button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LB_TABS.map(t => {
            const active = lbTab === t.id;
            return (
              <button key={t.id} onClick={() => setLbTab(t.id)}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active ? '#fbbf24' : 'rgba(255,255,255,0.15)', color: active ? '#78350f' : '#ffffff' }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '16px 20px 24px' }}>
        {lbLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#7CFC9B', fontSize: 13 }}>Loading…</div>
        )}
        {!lbLoading && lbRanked.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>No competition data yet</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', maxWidth: 300 }}>Scores are computed after each race day. Check back tomorrow.</div>
          </div>
        )}
        {!lbLoading && lbRanked.length > 0 && (() => {
          const lbMe     = lbRanked.find(u => u.clerk_id === user?.id);
          const lbAllTop = lbRanked.slice(0, Math.min(3, lbRanked.length));
          const lscore   = lbRanked[0]?.score || 1;
          return (
            <div style={{ maxWidth: 780, width: '100%' }}>
              {/* Your rank strip */}
              {lbMe && (
                <div style={{ background: '#fbbf24', borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#78350f', width: 28, flexShrink: 0, fontFamily: MONO }}>#{lbMe.rank}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#78350f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>► YOU ({titleCase(uname)})</div>
                    <div style={{ fontSize: 12, color: '#78350f', opacity: 0.7 }}>Rank {lbMe.rank} of {lbRanked.length} tipster{lbRanked.length !== 1 ? 's' : ''} · {lbMe.hitPct.toFixed(1)}% hit</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: MONO, color: '#78350f', flexShrink: 0 }}>{lbMe.score} pts</div>
                </div>
              )}
              {/* Top-3 medallion cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {lbAllTop.map((u, i) => {
                  const isMe   = u.clerk_id === user?.id;
                  const form   = lbUserForms[u.clerk_id] || [];
                  const padded = Array(Math.max(0, 10 - form.length)).fill(null).concat(form);
                  const mBg    = i === 0 ? '#fbbf24' : i === 1 ? '#e5e7eb' : '#f59e0b';
                  const mTxt   = i === 0 ? '#78350f' : i === 1 ? '#374151' : '#ffffff';
                  const ptsC   = i === 0 ? '#fbbf24' : '#ffffff';
                  const ptsS   = i === 0 ? 28 : 23;
                  const mSize  = i === 0 ? 46 : 40;
                  const nSize  = i === 0 ? 22 : 18;
                  const nFont  = i === 0 ? 17 : 15;
                  const bFill  = i === 0 ? '#fbbf24' : i === 1 ? '#e5e7eb' : '#f59e0b';
                  const barPct = lscore > 0 ? Math.round(u.score / lscore * 100) : 0;
                  return (
                    <div key={u.clerk_id} style={{ background: '#0a4d23', border: i === 0 ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: i === 0 ? '12px 16px' : '10px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: mSize, height: mSize, borderRadius: '50%', background: mBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: nSize, fontWeight: 900, color: mTxt, fontFamily: MONO }}>{i + 1}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: nFont, fontWeight: 700, color: '#ffffff', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.username}{isMe && <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', marginLeft: 8, background: 'rgba(251,191,36,0.2)', padding: '1px 6px', borderRadius: 3 }}>YOU</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 9, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${barPct}%`, height: '100%', background: bFill, borderRadius: 4 }} />
                          </div>
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            {padded.map((r, j) => (
                              <div key={j} style={{ width: 9, height: 9, borderRadius: 1, background: r === null ? 'rgba(255,255,255,0.15)' : r === 1 ? '#fbbf24' : r <= 3 ? '#9ca3af' : 'rgba(255,255,255,0.35)' }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 12, fontFamily: MONO, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>{u.hitPct.toFixed(1)}%</span>
                          <span style={{ fontSize: 12, fontFamily: MONO, color: u.streak > 0 ? '#7CFC9B' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{u.streak > 0 ? `${u.streak}🔥` : '—'}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: ptsS, fontWeight: 900, fontFamily: MONO, color: ptsC, flexShrink: 0 }}>{u.score}</span>
                    </div>
                  );
                })}
              </div>
              {/* Full table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.1)' }}>
                      {[
                        { h: '#',       w: 32,  align: 'center' },
                        { h: 'Tipster', w: null, align: 'left'  },
                        { h: 'Pts',     w: 54,  align: 'right'  },
                        { h: 'Hit%',    w: 54,  align: 'right'  },
                        { h: 'Streak',  w: 60,  align: 'left'   },
                        { h: '7-day',   w: 60,  align: 'left'   },
                        { h: 'Last 10', w: 116, align: 'left'   },
                      ].map(({ h, w, align }) => (
                        <th key={h} style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#ffffff', textAlign: align, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', width: w || undefined }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lbRanked.map(u => {
                      const isMe   = u.clerk_id === user?.id;
                      const mv     = lbMvmt(u);
                      const form   = lbUserForms[u.clerk_id] || [];
                      const padded = Array(Math.max(0, 10 - form.length)).fill(null).concat(form);
                      return (
                        <tr key={u.clerk_id} style={{ background: isMe ? '#fbbf24' : 'rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: isMe ? '#78350f' : u.rank <= 3 ? '#fbbf24' : '#ffffff' }}>{u.rank}</span>
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 13, fontWeight: isMe ? 800 : 500, color: isMe ? '#78350f' : '#ffffff' }}>{u.username}</span>
                            {isMe && <span style={{ fontSize: 10, fontWeight: 800, color: '#78350f', marginLeft: 6, background: 'rgba(120,53,15,0.15)', padding: '1px 4px', borderRadius: 3 }}>YOU</span>}
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 13, color: isMe ? '#78350f' : '#fbbf24', textAlign: 'right' }}>{u.score}</td>
                          <td style={{ padding: '6px 10px', fontFamily: MONO, fontSize: 12, color: isMe ? '#78350f' : '#7CFC9B', textAlign: 'right' }}>{u.hitPct.toFixed(1)}%</td>
                          <td style={{ padding: '6px 10px', fontFamily: MONO, fontSize: 12, color: isMe ? '#78350f' : (u.streak > 0 ? '#7CFC9B' : '#ffffff') }}>{u.streak > 0 ? `${u.streak}🔥` : '—'}</td>
                          <td style={{ padding: '6px 10px', fontSize: 12, fontFamily: MONO, color: isMe ? '#78350f' : '#ffffff' }}>
                            {mv === null ? <span style={{ opacity: 0.4 }}>—</span>
                              : mv > 0 ? <span style={{ color: isMe ? '#78350f' : '#7CFC9B', fontWeight: 700 }}>▲{mv}</span>
                              : mv < 0 ? <span style={{ color: isMe ? '#78350f' : '#f87171', fontWeight: 700 }}>▼{Math.abs(mv)}</span>
                              : <span style={{ opacity: 0.4 }}>—</span>}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <div style={{ display: 'flex', gap: 2 }}>
                              {padded.map((r, j) => (
                                <div key={j} style={{ width: 9, height: 9, borderRadius: 1, background: r === null ? 'rgba(255,255,255,0.15)' : r === 1 ? '#fbbf24' : r <= 3 ? '#9ca3af' : 'rgba(255,255,255,0.35)' }} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'transparent', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>—</span></td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>⚡ SP-fav benchmark</span>
                        <span title="Tracks the starting-price favourite as a model-performance proxy. Data accumulates from today forward." style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 6, cursor: 'help', textDecoration: 'underline dotted' }}>what&apos;s this?</span>
                      </td>
                      <td colSpan={5} style={{ padding: '6px 10px', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>Tracking starts from today — accumulates over coming race days</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                Ties are broken by hit rate. Scores recalculate after each race day. SP-fav benchmark tracks what picking the favourite in every race would score, for comparison.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  // ─── Mobile today view ────────────────────────────────────────────────────────
  // These slice variables are used inside mobileTodayPanel's inline leaderboard
  const top5        = todayLeaderboard.slice(0, 5);
  const userEntry   = todayLeaderboard.find(e => e.isMe);
  const showUserSep = !!(userEntry && !top5.some(e => e.isMe));

  const mobileTodayPanel = (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ background: DK_HDR, borderBottom: `1px solid ${DK_LINE}`, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DK_TEXT }}>{uname}</div>
          <div style={{ fontSize: 9, color: DK_MUT }}>
            <b style={{ color: '#4ade80' }}>{userScore} pts</b>
            {userRank ? ` · #${userRank}` : ''}
            {userRecord ? ` · ${userRecord.wins}-${userRecord.seconds}-${userRecord.thirds}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 9, color: DK_MUT }}>{entrantCount} entrants</div>
        <button onClick={() => setMainTab('alltime')} style={{ fontSize: 9, color: DK_MUT, background: 'none', border: `1px solid ${DK_LINE}`, borderRadius: 4, padding: '3px 7px', cursor: 'pointer' }}>Board</button>
      </div>
      {scratchAlerts.length > 0 && (
        <div style={{ background: '#fff5f5', borderBottom: '1px solid #fecaca', padding: '5px 12px' }}>
          {scratchAlerts.map(race => (
            <div key={rk(race.venue, race.num)} style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
              ⚠ {picks[rk(race.venue, race.num)]} scratched in {titleCase(race.venue)} R{race.num} — re-pick below
            </div>
          ))}
        </div>
      )}
      {csvStaleDate && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Showing data from a previous day</div>
          <div style={{ fontSize: 10, color: CT_MUT, marginTop: 4, lineHeight: 1.6 }}>The most recent data available is from {csvStaleDate}. Today&apos;s competition will be available once new data loads.</div>
        </div>
      )}
      {!csvRaces && !csvStaleDate && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>No data yet</div>
          <div style={{ fontSize: 10, color: CT_MUT, marginTop: 4 }}>Today&apos;s data hasn&apos;t loaded yet. Check back shortly.</div>
        </div>
      )}
      {csvRaces && selVenues.map(v => (
        <div key={v}>
          <div style={{ background: '#f0fdf4', borderTop: '2px solid #d1fae5', borderBottom: `1px solid ${CT_LINE}`, padding: '4px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00471b', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {v}
            </span>
          </div>
          {(racesByVenue[v] || []).map(race => {
            const key = rk(race.venue, race.num);
            const locked = isLocked(race);
            const status = getStatus(race);
            const pick = picks[key];
            const winner = liveWinnerMap[key] || results[key];
            const jt = jumpDate(race.time, race.date);
            const msToJump = jt ? jt.getTime() - now : null;
            const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
            const activeHorses = (race.horses || []).filter(h => !h.scratched && !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`));
            const underTen = msToJump !== null && msToJump < 600000 && !winner && status !== 'racing';

            // Row tint
            let rowBg = '#fff';
            if (winner) {
              if (pick && winner.toLowerCase() === pick.toLowerCase()) rowBg = '#f0fdf4';
              else if (pick) rowBg = '#fff1f2';
            } else if (status === 'racing') rowBg = '#fffbeb';

            // Points for this pick
            let pts = null;
            if (winner && pick) {
              const [vn, rn] = key.split('||');
              const rr = todayFinishPos[`${vn}||${rn}||${pick.toUpperCase()}`];
              pts = rr?.pos != null ? scorePick(rr.pos) : (winner.toLowerCase() === pick.toLowerCase() ? 3 : 0);
            }

            return (
              <div key={key} style={{ padding: '5px 12px', borderBottom: `1px solid ${CT_LINE}`, background: rowBg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#111827' }}>
                    R{race.num} <span style={{ fontWeight: 400, fontSize: 10, color: CT_MUT }}>{race.time}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {winner && (
                      <span style={{ fontSize: 9, color: '#374151' }}>
                        W: <b>{winner}</b>
                      </span>
                    )}
                    {winner && pick && winner.toLowerCase() !== pick.toLowerCase() && (() => {
                      const [vn, rn] = key.split('||');
                      const rr = todayFinishPos[`${vn}||${rn}||${pick.toUpperCase()}`];
                      return rr?.pos ? <span style={{ fontSize: 9, color: '#6b7280' }}>{ordinal(rr.pos)}</span> : null;
                    })()}
                    {pts !== null && (
                      <span style={{ fontSize: 10, fontWeight: 800, fontFamily: MONO, color: pts === 3 ? '#15803d' : pts === 2 ? '#166534' : pts === 1 ? '#4b5563' : '#9ca3af' }}>
                        {pts > 0 ? `+${pts}` : '0'}
                      </span>
                    )}
                    {!winner && status === 'racing' && <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706' }}>Racing</span>}
                    {!winner && status === 'result_pending' && <span style={{ fontSize: 9, color: CT_MUT }}>Result pending</span>}
                    {!winner && status === 'pending' && msToJump !== null && (
                      <span style={{ fontSize: 9, fontWeight: underTen ? 700 : 400, color: underTen ? '#d97706' : CT_MUT, fontFamily: 'monospace' }}>
                        {fmtMs(msToJump) || 'Now'}
                      </span>
                    )}
                  </div>
                </div>
                {isScratched && <div style={{ fontSize: 9, color: '#dc2626', fontWeight: 600, marginBottom: 3 }}>⚠ {pick} scratched — re-pick</div>}
                {locked && !isScratched ? (
                  <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, border: `1px solid ${CT_LINE}`, color: '#111827', background: '#f9fafb' }}>
                    {pick || <span style={{ color: CT_MUT }}>No pick</span>}
                  </div>
                ) : (
                  <select value={pick || ''} onChange={e => savePick(race, e.target.value)}
                    style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 5, border: `1px solid ${isScratched ? '#dc2626' : pick ? '#16a34a' : CT_LINE}`, background: '#fff', color: isScratched ? '#dc2626' : pick ? '#16a34a' : '#374151', outline: 'none' }}>
                    <option value="">Pick horse…</option>
                    {activeHorses.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {todayLeaderboard.length > 0 && (
        <div style={{ background: '#fff', margin: '8px 0 0', padding: '8px 12px', borderTop: `1px solid ${CT_LINE}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leaderboard</div>
          {[...top5, ...(showUserSep ? [userEntry] : [])].map(e => (
            <div key={e.clerk_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: `1px solid ${CT_LINE}` }}>
              <span style={{ fontSize: 9, color: CT_MUT, width: 18 }}>#{e.rank}</span>
              <span style={{ fontSize: 10, flex: 1, fontWeight: e.isMe ? 700 : 400, color: e.isMe ? '#1d4ed8' : '#374151' }}>{e.uname}</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: MONO, color: e.isMe ? '#1d4ed8' : G }}>{e.score}</span>
            </div>
          ))}
        </div>
      )}
      <SubmitFooter compact={true} />
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d5f2b' }}>
      {mainTab === 'today' && !isMobile && statusBand}
      {mainTab === 'today' && (
        isMobile
          ? mobileTodayPanel
          : (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '52fr 5px 48fr', overflow: 'hidden' }}>
              {newLeftPanel}
              <div style={{ background: '#fbbf24' }} />
              {newRightPanel}
            </div>
          )
      )}
      {mainTab === 'alltime' && allTimePanel}
    </main>
  );
}
