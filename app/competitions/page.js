'use client';

import { useState, useEffect, useMemo, memo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import useUserSettings from '@/hooks/useUserSettings';
import UpgradeModal from '@/components/UpgradeModal';
import MainTabBar from '@/components/MainTabBar';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreHorse, getDefaultWeights } from '@/lib/scoring';
import { normaliseVenue } from '@/lib/venues';
import { punterFallback } from '@/lib/punterFallback';
import { fetchDisplayNames } from '@/lib/displayNames';
import { selectBeatModelRace } from '@/lib/beatModel';
import { fetchEquippedCosmetics } from '@/lib/cosmetics';
import Avatar from '@/components/Avatar';
import NameFlair from '@/components/NameFlair';

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

const gridThStyle = (align) => ({ textAlign: align, padding: '6px 8px', color: '#374151', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap', background: '#f9fafb', border: '1px solid #d1d5db' });
const gridTdStyle = (align, opts = {}) => ({ textAlign: align, padding: '6px 8px', color: '#111827', fontFamily: opts.mono ? MONO : undefined, fontSize: opts.fs || 11, fontWeight: opts.bold ? 700 : 400, border: '1px solid #d1d5db', whiteSpace: 'nowrap', overflow: opts.ellipsis ? 'hidden' : undefined, textOverflow: opts.ellipsis ? 'ellipsis' : undefined });

// 2026-09-06 throbbing fix: this used to be defined INSIDE the page
// component's render body, which meant React saw a brand-new component
// *type* on every render -- not just a re-render, a full unmount/remount,
// tearing down and rebuilding this table (and re-firing its own mount-time
// cosmetics fetch) every single time the page re-rendered, including the
// page's old 1-second `now` tick. Moved to module scope so the component
// type is stable across renders, and wrapped in memo() so it doesn't even
// re-render (let alone remount) when its `rows` prop hasn't changed --
// which is the common case, since todayLbRows/lbRanked etc. are already
// memoized upstream.
//
// Self-contained cosmetics fetch -- this one component backs all three
// leaderboards on this page (today's Field, Beat the Model, All-time),
// so fetching here means every caller gets avatars/flair for free rather
// than each of the three call sites needing its own fetch + prop-drilling.
// Keyed off the actual clerk_ids so it only re-fetches when the visible
// entrant set changes, not on every render.
const LeaderboardTable = memo(function LeaderboardTable({ rows }) {
  const idsKey = rows.map(u => u.clerk_id).join(',');
  const [cosmeticsMap, setCosmeticsMap] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetchEquippedCosmetics(rows.map(u => u.clerk_id)).then(map => { if (!cancelled) setCosmeticsMap(map); });
    return () => { cancelled = true; };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return <div style={{ fontSize: 11, color: '#9ca3af', padding: '10px 2px' }}>No entrants yet.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={gridThStyle('left')}>#</th>
          <th style={gridThStyle('left')}>Tipster</th>
          <th style={gridThStyle('right')}>Hit%</th>
          <th style={gridThStyle('left')}>Streak</th>
          <th style={gridThStyle('right')}>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(u => {
          const cosmetics = cosmeticsMap[u.clerk_id];
          return (
            <tr key={u.clerk_id} style={{ background: u.isMe ? '#fffbea' : 'transparent' }}>
              <td style={gridTdStyle('left', { mono: true, bold: true })}>{u.rank}</td>
              <td style={gridTdStyle('left', { ellipsis: true })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar profile={{ display_name: u.username }} size={18} border={cosmetics?.border?.style} href={`/u/${u.clerk_id}`} />
                  <NameFlair name={u.username} flair={cosmetics?.flair?.style} fontSize={11} fontWeight={400} color="#111827" href={`/u/${u.clerk_id}`} />
                  {u.isMe && <span style={{ color: '#854F0B', fontWeight: 600, fontSize: 11 }}> (you)</span>}
                </div>
              </td>
              <td style={gridTdStyle('right', { mono: true })}>{u.hitPct != null ? `${u.hitPct.toFixed(0)}%` : '—'}</td>
              <td style={gridTdStyle('left')}>
                {u.streak
                  ? <span style={{ color: u.streak > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{u.streak > 0 ? `${u.streak}W` : `${Math.abs(u.streak)}L`}</span>
                  : <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
              <td style={gridTdStyle('right', { mono: true, bold: true, fs: 12 })}>{u.score}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

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

// Same bucketing as the Races page and /api/results-ranks — 'heavy'/'soft'/
// 'synthetic'/'good', matched from today_meetings' free-text condition string.
function bucketTrackCond(raw) {
  const tcl = (raw || '').toLowerCase();
  return tcl.includes('heavy') ? 'heavy'
    : tcl.includes('soft') || tcl.includes('slow') ? 'soft'
    : tcl.includes('synth') ? 'synthetic'
    : 'good';
}

function getModelRank1(race, venueTrackConds = {}) {
  const active = (race.horses || []).filter(h => !h.scratched);
  if (!active.length) return null;
  const w = getDefaultWeights();
  const trackCond = venueTrackConds[normaliseVenue(race.venue || '')] || 'good';
  let best = null, bs = -Infinity;
  for (const h of active) {
    const { total } = scoreHorse(h, trackCond, w);
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
// comp_scores.username is a snapshot taken at submission time — re-resolved
// here from live Clerk data on every read instead of trusted as-is, so a
// username set/changed after past submissions is reflected immediately
// everywhere, with no backfill of historical rows needed (clerk_id is the
// real key throughout; username has only ever been a display value).
async function fetchScores(start, end) {
  if (!SURL || !SKEY) return [];
  const params = ['select=comp_date,clerk_id,username,correct,total,score,streak'];
  if (start) params.push(`comp_date=gte.${start}`);
  if (end)   params.push(`comp_date=lte.${end}`);
  try {
    const res = await fetch(`${SURL}/rest/v1/comp_scores?${params.join('&')}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    const rows = res.ok ? await res.json() : [];
    return resolveLiveUsernames(rows);
  } catch { return []; }
}

// Overrides each row's username in place with the live-resolved
// username-or-fallback for its clerk_id — used by both comp_scores reads
// (fetchScores) and comp_picks reads (today's leaderboard, client-side).
async function resolveLiveUsernames(rows) {
  if (!rows || !rows.length) return rows || [];
  const ids = [...new Set(rows.map(r => r.clerk_id).filter(Boolean))];
  const nameMap = await fetchDisplayNames(ids);
  return rows.map(r => ({ ...r, username: nameMap[r.clerk_id] || punterFallback(r.clerk_id) }));
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
const MAIN_TABS     = [
  { id: 'today',      label: 'Today',           icon: 'ti-calendar' },
  { id: 'beat-model', label: 'Beat the Model',   icon: 'ti-trophy' },
  { id: 'alltime',    label: 'All-time',         icon: 'ti-history' },
];

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
  const [venueTrackConds, setVenueTrackConds] = useState({});
  const [allTimePoints, setAllTimePoints] = useState(null);
  const [mainTab, setMainTab]         = useState('today');
  const [now, setNow]                 = useState(Date.now());

  const [lbTab, setLbTab]           = useState('alltime');
  const [lbRows, setLbRows]         = useState([]);
  const [lbLoading, setLbLoading]   = useState(false);

  // Beat the Model — single national race, one pick per user per day.
  const [btmPick,       setBtmPick]       = useState(null);
  const [btmResolved,   setBtmResolved]   = useState(false);
  const [btmWon,        setBtmWon]        = useState(false);
  const [btmPickSaving, setBtmPickSaving] = useState(false);
  const [btmStats,      setBtmStats]      = useState({ participants: 0, correct: 0 });
  const [btmSubTab,        setBtmSubTab]        = useState('today');
  const [btmHistory,       setBtmHistory]       = useState([]);
  const [btmHistoryLoading,setBtmHistoryLoading] = useState(false);
  const [btmStreak,        setBtmStreak]        = useState(0);
  const [btmLeaderboard,   setBtmLeaderboard]   = useState([]);
  const [btmLbLoading,     setBtmLbLoading]     = useState(false);

  // Record + P&L state
  const [allCompScoresData, setAllCompScoresData]     = useState([]);
  const [userAllPicksData, setUserAllPicksData]       = useState([]);
  const [allCompResultsData, setAllCompResultsData]   = useState([]);
  const [historicalRaceSps, setHistoricalRaceSps]     = useState([]);
  const [todayRaceResultsData, setTodayRaceResultsData] = useState([]);
  const [openPickKey, setOpenPickKey]   = useState(null);
  const [selCompVenue, setSelCompVenue] = useState(null);

  const [today, setToday] = useState(() => aestISO());
  // What other users see too — never real name. fullName/firstName removed
  // from this chain entirely; Clerk's own username, or a stable fallback.
  const uname = user ? (user.username || punterFallback(user.id)) : 'Anon';

  const selVenues = useMemo(() => csvRaces ? pickMeetings(csvRaces.allRaces) : [], [csvRaces]);
  const compRaces = useMemo(() => csvRaces ? getCompRaces(csvRaces.allRaces, selVenues) : [], [csvRaces, selVenues]);

  // Deterministic given the same CSV -- every client picks the same race
  // independently, same reasoning as selVenues/compRaces above. See
  // lib/beatModel.js for the selection rules and BTM_CUTOFF_HOUR_AEST.
  const btmChallenge = useMemo(() => csvRaces ? selectBeatModelRace(csvRaces.allRaces) : null, [csvRaces]);
  const btmModelPick = useMemo(() => btmChallenge ? getModelRank1(btmChallenge.race, venueTrackConds) : null, [btmChallenge, venueTrackConds]);
  const btmActiveHorses = useMemo(
    () => btmChallenge ? (btmChallenge.race.horses || []).filter(h => !h.scratched && !scratchings.has(`${btmChallenge.venue}||${btmChallenge.raceNum}||${(h.name||'').toUpperCase()}`)) : [],
    [btmChallenge, scratchings],
  );
  // The model's own rank-1 pick is excluded from what's *selectable* --
  // it's visible elsewhere on the site (Races page), so leaving it pickable
  // here let every entrant just copy it, collapsing the competition into
  // "did the model win today" with no real leaderboard signal. Kept
  // separate from btmActiveHorses (which stays the true "still running"
  // list) rather than filtering that directly, since other logic may
  // reasonably want the real active field later.
  //
  // Exception: if the model's horse is already this user's own saved pick
  // (possible for picks made before this fix shipped, or in the edge case
  // where a user's genuine alternative happens to coincide with the
  // model's), it stays in the list so their existing selection keeps
  // rendering/highlighting normally -- this only blocks *newly choosing*
  // the model's pick, it never hides an already-locked-in one.
  const btmSelectableHorses = useMemo(() => {
    if (!btmModelPick) return btmActiveHorses;
    return btmActiveHorses.filter(h => (h.name || '').toUpperCase() !== btmModelPick.toUpperCase() || h.name === btmPick);
  }, [btmActiveHorses, btmModelPick, btmPick]);
  // True only when a horse is genuinely being hidden from someone who
  // hasn't already picked it -- drives the explanatory note so it never
  // shows when there's nothing actually excluded (e.g. no eligible model
  // pick) or when the "excluded" horse is just the user's own pick still
  // rendering per the exception above.
  const btmModelPickHidden = !!btmModelPick && btmActiveHorses.some(h => (h.name || '').toUpperCase() === btmModelPick.toUpperCase() && h.name !== btmPick);
  const btmWinnerRow = useMemo(() => {
    if (!btmChallenge) return null;
    return todayRaceResultsData.find(r =>
      normaliseVenue(r.venue || '') === btmChallenge.venue &&
      +r.race_num === btmChallenge.raceNum &&
      (r.finish_pos === 1 || r.finish_pos === '1'),
    ) || null;
  }, [btmChallenge, todayRaceResultsData]);

  const mr1Map = useMemo(() => {
    const m = {};
    compRaces.forEach(r => { m[rk(r.venue, r.num)] = getModelRank1(r, venueTrackConds); });
    return m;
  }, [compRaces, venueTrackConds]);

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
      const hitPct = decided > 0 ? (correct / decided * 100) : 0;
      return { ...entry, score, correct, decided, hitPct, isMe: entry.clerk_id === user?.id };
    });
    // Full deterministic tie-breaker chain: score, then hit rate (matches the
    // "Ties are broken by hit rate" copy on the All-time leaderboard, which
    // already did this via lbRanked's own sort -- this one didn't, which was
    // the actual bug), then clerk_id alphabetically as a final fallback so
    // equal-score-and-hit-rate entrants always land in the same order rather
    // than whatever order comp_picks happened to come back in that poll.
    entries.sort((a, b) => b.score - a.score || b.hitPct - a.hitPct || a.clerk_id.localeCompare(b.clerk_id));
    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [allPicksData, results, liveWinnerMap, compRaces, selVenues, user?.id, hiddenFromLb, todayFinishPos]);

  // Memoized on the same dependency as todayLeaderboard itself -- previously
  // rebuilt fresh (new array + new row objects) in the render body on every
  // render of this page, including the ~7 unrelated setInterval polls that
  // touch other state, so LeaderboardTable's `rows` prop changed reference
  // constantly even when the leaderboard itself hadn't. Combined with the
  // sort-order instability fixed above, that's what caused the "you" row to
  // visibly reflow every ~30s. Declared here (before the isPro===false early
  // return below) rather than down by fieldPanel, since it's a hook and must
  // run unconditionally on every render.
  const todayLbRows = useMemo(() => todayLeaderboard.map(e => ({
    clerk_id: e.clerk_id, rank: e.rank, username: e.uname,
    hitPct: e.decided > 0 ? (e.correct / e.decided * 100) : null,
    streak: null, score: e.score, isMe: e.isMe,
  })), [todayLeaderboard]);

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
    if (!SURL || !SKEY) return;
    function loadTrackConds() {
      sbFetch(`today_meetings?date=eq.${today}&select=venue,track_condition,condition_override`).then(rows => {
        if (!Array.isArray(rows)) return;
        const tc = {};
        rows.forEach(r => {
          const effectiveCond = r.condition_override || r.track_condition;
          if (effectiveCond) tc[normaliseVenue(r.venue)] = bucketTrackCond(effectiveCond);
        });
        setVenueTrackConds(tc);
      });
    }
    loadTrackConds();
    const id = setInterval(loadTrackConds, 60000);
    return () => clearInterval(id);
  }, [today]);

  useEffect(() => {
    if (!SURL || !SKEY || !isPro) return;
    function loadAll() {
      sbFetch(`comp_picks_popular?comp_date=eq.${today}&select=venue,race_num,horse_name,pick_count`)
        .then(rows => { if (Array.isArray(rows)) setPopularData(rows); });
      // order=clerk_id.asc, not score.desc -- comp_picks is a per-pick row
      // (one per race per user), it has no score column at all; score is
      // computed client-side afterwards from these rows + race results. Any
      // deterministic ORDER BY fixes the actual bug (PostgREST/Postgres row
      // order is otherwise unspecified without one), and clerk_id.asc
      // matches the final tie-breaker in the entries.sort() below for
      // consistency between the two.
      sbFetch(`comp_picks?comp_date=eq.${today}&hide_picks=eq.false&select=clerk_id,username,venue,race_num,horse_name&order=clerk_id.asc`)
        .then(rows => Array.isArray(rows) ? resolveLiveUsernames(rows) : [])
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
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#leaderboard') {
      setMainTab('alltime');
      window.history.replaceState(null, '', window.location.pathname);
    } else if (window.location.hash === '#beat-model') {
      setMainTab('beat-model');
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

  // Beat the Model — write today's selected race as a durable record via
  // /api/beat-model/challenge (service key), not a direct anon-key write --
  // btm_challenges has RLS enabled with zero policies, so the previous
  // direct sbFetch upsert had been silently rejected every single day since
  // this feature shipped (confirmed live: 0 rows in btm_challenges for any
  // date). Idempotent upsert; harmless if multiple clients race to write
  // it, since every client computes the same selection independently.
  // Includes model_pick directly now (no longer split into a second,
  // separate write -- that split only existed because the column didn't
  // exist yet; it does now).
  useEffect(() => {
    if (!btmChallenge || !isPro) return;
    fetch('/api/beat-model/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comp_date: today,
        venue: btmChallenge.venue,
        race_num: btmChallenge.raceNum,
        race_name: btmChallenge.raceName,
        prize_money: btmChallenge.prize,
        post_time: btmChallenge.postTimeISO,
        used_fallback: btmChallenge.usedFallback,
        model_pick: btmModelPick || null,
      }),
    }).catch(() => {});
  }, [btmChallenge?.venue, btmChallenge?.raceNum, today, isPro, btmModelPick]);

  // Load this user's existing pick + resolution state for today, plus the
  // day's aggregate participant/correct stats -- both come from
  // /api/beat-model/today (service key). Previously two separate anon-key
  // sbFetch calls to btm_picks, both silently broken: btm_picks has no
  // anon-role SELECT policy, so those calls always returned `200 []`
  // (confirmed live) rather than an error, meaning btmPick/btmStats could
  // never reflect a real saved pick regardless of what was actually in the
  // table. This one fetch now serves both, polled the same way the old
  // stats-only effect did (today's participant count can change as other
  // users pick throughout the day).
  useEffect(() => {
    if (!user?.id || !isPro || !btmChallenge) { setBtmPick(null); setBtmResolved(false); setBtmWon(false); return; }
    function load() {
      fetch('/api/beat-model/today')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          setBtmPick(data.pick?.horse_name || null);
          setBtmResolved(!!data.pick?.resolved);
          setBtmWon(!!data.pick?.won);
          setBtmStats(data.stats || { participants: 0, correct: 0 });
        })
        .catch(err => console.error('[BeatModel] today load failed', err));
    }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [user?.id, today, isPro, btmChallenge?.venue, btmChallenge?.raceNum]);

  // Resolve once the winner is known — client-triggered like the rest of
  // this app's point-awarding actions (no server cron exists to hook into;
  // see the "Beat the Model" plan notes). Known, accepted tradeoff: stays
  // unresolved (and the bonus unawarded) until a user with a pending pick
  // actually visits after the race jumps. Write goes through
  // /api/beat-model/resolve (service key) -- the previous direct anon-key
  // PATCH was silently blocked by RLS on btm_picks (HTTP 200, zero rows
  // actually updated, confirmed live), so this never actually resolved for
  // anyone. That route does its own resolved=eq.false idempotency check
  // (same intent as the array-length check this replaces) and awards the
  // beat_model_correct points server-side, so this effect only updates
  // local UI state now, on confirmed success.
  useEffect(() => {
    if (!user?.id || !isPro || !btmChallenge || !btmPick || btmResolved || !btmWinnerRow) return;
    const won = (btmWinnerRow.horse_name || '').toLowerCase() === btmPick.toLowerCase();
    (async () => {
      try {
        const res = await fetch('/api/beat-model/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ won }),
        });
        if (!res.ok) {
          console.error('[BeatModel] resolve failed', res.status, await res.text().catch(() => ''));
          return;
        }
        const data = await res.json();
        if (data?.updated) {
          setBtmResolved(true);
          setBtmWon(won);
        }
      } catch (err) {
        console.error('[BeatModel] resolve network error', err);
      }
    })();
  }, [user?.id, isPro, btmChallenge, btmPick, btmResolved, btmWinnerRow, today]);

  // Pick history + derived streak — lazy-loaded on the History sub-tab, and
  // refetched whenever a resolve just landed (btmResolved flipping true)
  // so the streak shown doesn't go stale right after today's reveal.
  useEffect(() => {
    if (!user?.id || !isPro || mainTab !== 'beat-model' || btmSubTab !== 'history') return;
    setBtmHistoryLoading(true);
    fetch('/api/beat-model/history')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        setBtmHistory(Array.isArray(data.history) ? data.history : []);
        setBtmStreak(data.streak || 0);
      })
      .catch(err => console.error('[BeatModel] history load failed', err))
      .finally(() => setBtmHistoryLoading(false));
  }, [user?.id, isPro, mainTab, btmSubTab, btmResolved]);

  // All-time Beat the Model leaderboard — lazy-loaded on its own sub-tab;
  // usernames resolved client-side via fetchDisplayNames, same pattern as
  // the points-based all-time leaderboard.
  useEffect(() => {
    if (!user?.id || !isPro || mainTab !== 'beat-model' || btmSubTab !== 'leaderboard') return;
    setBtmLbLoading(true);
    fetch('/api/beat-model/leaderboard')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(async data => {
        const rows = Array.isArray(data.leaderboard) ? data.leaderboard : [];
        const ids = rows.map(r => r.clerk_id);
        const nameMap = ids.length ? await fetchDisplayNames(ids) : {};
        setBtmLeaderboard(rows.map((r, i) => ({
          ...r,
          rank: i + 1,
          username: nameMap[r.clerk_id] || punterFallback(r.clerk_id),
          isMe: r.clerk_id === user.id,
        })));
      })
      .catch(err => console.error('[BeatModel] leaderboard load failed', err))
      .finally(() => setBtmLbLoading(false));
  }, [user?.id, isPro, mainTab, btmSubTab]);

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

  function isBtmLocked() {
    if (!btmChallenge?.postTimeISO) return false;
    return new Date(btmChallenge.postTimeISO).getTime() <= now;
  }

  async function saveBtmPick(horseName) {
    // Changeable up until lock, same as the regular comp's savePick --
    // awardPoints' existing max:1/day cap on beat_model_participate already
    // stops repeat picking from farming points, so no extra guard needed here.
    if (!horseName || !btmChallenge || isBtmLocked()) return;
    if (!user?.id) return;
    setBtmPickSaving(true);
    // Write goes through /api/beat-model/pick (service key) -- the previous
    // direct anon-key upsert was silently blocked by RLS on btm_picks
    // (confirmed live: 401, no INSERT policy for the anon role), so no pick
    // had ever actually persisted. State is only set here on confirmed
    // success now, not optimistically before the write -- the UI reflects
    // what's actually saved, not what was attempted.
    try {
      const res = await fetch('/api/beat-model/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horse_name: horseName }),
      });
      if (!res.ok) {
        console.error('[BeatModel] pick save failed', res.status, await res.text().catch(() => ''));
        return;
      }
      setBtmPick(horseName);
    } catch (err) {
      console.error('[BeatModel] pick save network error', err);
    } finally {
      setBtmPickSaving(false);
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

  // ─── Hero block — replaces the old header bar + footer bar entirely; PTS
  // and P&L now live in the stat strip here instead of a separate footer.
  const userLbEntry = todayLeaderboard.find(e => e.isMe);
  const userHitPct  = userLbEntry && userLbEntry.decided > 0 ? (userLbEntry.correct / userLbEntry.decided * 100) : null;
  const heroSuffix  = userRank ? ordinal(userRank).slice(String(userRank).length) : '';
  const plPositive  = todayPL >= 0;
  const plStr       = (plPositive ? '+$' : '-$') + Math.abs(todayPL).toFixed(2);

  const heroBlock = (
    <div style={{ background: '#fff', borderBottom: `0.5px solid ${CT_LINE}`, padding: '14px 16px', flexShrink: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
        {headerDateStr.toUpperCase()} · DAILY COMP · {decidedCount}/{compRaces.length || 0} DECIDED
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', fontFamily: MONO, lineHeight: 1 }}>
            {userRank ? (
              <>
                <span style={{ fontSize: 44, fontWeight: 800, color: userRank === 1 ? '#0d5f2b' : '#111827' }}>{userRank}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#854F0B', marginTop: 4 }}>{heroSuffix}</span>
              </>
            ) : (
              <span style={{ fontSize: 44, fontWeight: 800, color: '#d1d5db' }}>—</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{titleCase(uname)}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{userRank ? `of ${entrantCount} tipsters today` : 'not yet ranked'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginLeft: 'auto' }}>
          {[
            ['PTS', userScore, undefined],
            ['HIT%', userHitPct != null ? `${userHitPct.toFixed(0)}%` : '—', undefined],
            ['P&L', plStr, plPositive ? '#16a34a' : '#dc2626'],
          ].map(([label, val, color], i) => (
            <div key={label} style={{ padding: '0 16px', borderLeft: i > 0 ? '1px solid #e5e7eb' : 'none', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, color: color || '#111827' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Your Campaign table ─────────────────────────────────────────────────────
  const campaignPanel = (() => {
    const activeRaces = racesByVenue[selCompVenue] || [];
    return (
      <div style={{ background: '#fff', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>Your Campaign</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>3-2-1 scale · +3 for 4/4</span>
        </div>
        {selVenues.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {selVenues.map(v => (
              <button key={v} onClick={() => { setSelCompVenue(v); setOpenPickKey(null); }}
                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, border: `1px solid ${selCompVenue === v ? '#111827' : '#d1d5db'}`, cursor: 'pointer', fontFamily: 'inherit', background: selCompVenue === v ? '#111827' : '#fff', color: selCompVenue === v ? '#fff' : '#374151' }}>
                {v}
              </button>
            ))}
          </div>
        )}
        {csvStaleDate && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>Data from {csvStaleDate} — today&apos;s comp opens when new data loads</div>}
        {!csvRaces && !csvStaleDate && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>Loading race data…</div>}
        {csvRaces && compRaces.length === 0 && <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>No races available today</div>}
        {csvRaces && compRaces.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={gridThStyle('left')}>Race</th>
                <th style={gridThStyle('left')}>Selection</th>
                <th style={gridThStyle('right')}>Result</th>
                <th style={gridThStyle('right')}>Pts</th>
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
                const raceCode = `${normaliseVenue(race.venue || '').slice(0, 4).toUpperCase()} R${race.num}`;
                return (
                  <Fragment key={key}>
                    {isScratched ? (
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={gridTdStyle('left', { mono: true, bold: true })}>{raceCode}</td>
                        <td onClick={() => canOpen && setOpenPickKey(isOpen ? null : key)} style={{ ...gridTdStyle('left'), color: '#dc2626', fontWeight: 600, cursor: canOpen ? 'pointer' : 'default' }}>
                          <i className="ti ti-alert-triangle" style={{ fontSize: 11, marginRight: 4 }} />re-pick
                        </td>
                        <td style={gridTdStyle('right')}></td>
                        <td style={gridTdStyle('right')}></td>
                      </tr>
                    ) : (
                      <tr onClick={() => canOpen && setOpenPickKey(isOpen ? null : key)} style={{ cursor: canOpen ? 'pointer' : 'default' }}>
                        <td style={gridTdStyle('left', { mono: true, bold: true })}>{raceCode}</td>
                        <td style={gridTdStyle('left', { ellipsis: true })}>
                          {pick || (canOpen ? <span style={{ color: '#9ca3af' }}>Pick ▾</span> : <span style={{ color: '#9ca3af' }}>—</span>)}
                        </td>
                        <td style={gridTdStyle('right')}>
                          {winner ? (
                            !pick ? <span style={{ color: '#9ca3af' }}>no pick</span>
                            : pts > 0 ? <span style={{ color: '#16a34a', fontWeight: 700 }}>{finishPos ? ordinal(finishPos) : '1st'}</span>
                            : <span style={{ color: '#dc2626' }}>{finishPos ? ordinal(finishPos) : '—'}</span>
                          ) : <span style={{ color: '#9ca3af' }}>pending</span>}
                        </td>
                        <td style={gridTdStyle('right', { mono: true, bold: true })}>
                          {winner
                            ? (pts > 0 ? <span style={{ color: '#16a34a' }}>{`+${pts}`}</span> : <span style={{ color: '#9ca3af' }}>0</span>)
                            : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                      </tr>
                    )}
                    {isOpen && (
                      <tr>
                        <td colSpan={4} style={{ padding: '6px 8px', background: '#f9fafb', border: '1px solid #d1d5db' }}>
                          {activeHorses.length === 0 ? <div style={{ fontSize: 11, color: '#9ca3af' }}>No horses available</div> : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {activeHorses.map(h => (
                                <button key={h.name} onClick={(e) => { e.stopPropagation(); savePick(race, h.name); setOpenPickKey(null); }}
                                  style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', background: pick === h.name ? '#d1fae5' : '#fff', color: '#111827', border: `1px solid ${pick === h.name ? '#16a34a' : '#d1d5db'}` }}>
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
    );
  })();

  // ─── Field (Today's live leaderboard) ───────────────────────────────────────

  const fieldPanel = (
    <div style={{ background: '#fff', padding: '14px 16px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
        Field <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>· {entrantCount} entrant{entrantCount !== 1 ? 's' : ''}</span>
      </div>
      <LeaderboardTable rows={todayLbRows} />
      <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
        <button onClick={() => setMainTab('alltime')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#111827', padding: 0 }}>
          Full leaderboard →
        </button>
      </div>
    </div>
  );

  // 2026-09-06: removed the in-page "Beat the Model" banner and the Field
  // panel's bottom link -- both just called setMainTab('beat-model'), the
  // exact same action as the top-level tab. The top-level tab (Today/Beat
  // the Model/All-time) is now the single entry point.
  const todayTab = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#fff' }}>
      {heroBlock}
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
      {campaignPanel}
      {fieldPanel}
    </div>
  );

  // ─── Beat the Model tab ─────────────────────────────────────────────────────
  const BTM_SUB_TABS = [{ id: 'today', label: 'Today' }, { id: 'history', label: 'History' }, { id: 'leaderboard', label: 'Leaderboard' }];
  const btmSubTabBar = (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 14px', flexWrap: 'wrap' }}>
      {BTM_SUB_TABS.map(t => {
        const active = btmSubTab === t.id;
        return (
          <button key={t.id} onClick={() => setBtmSubTab(t.id)}
            style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, border: `0.5px solid ${active ? '#111827' : CT_LINE}`, cursor: 'pointer', fontFamily: 'inherit', background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151' }}>
            {t.label}
          </button>
        );
      })}
      {btmStreak > 0 && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#e8b84a' }}>
          🔥 {btmStreak} day{btmStreak !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );

  const btmHistoryPanel = (
    <div style={{ padding: '0 16px 16px' }}>
      {btmHistoryLoading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
      ) : !btmHistory.length ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 12 }}>No picks yet — make your first pick on the Today tab.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: 'auto', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={gridThStyle('left')}>Date</th>
                <th style={gridThStyle('left')}>Race</th>
                <th style={gridThStyle('left')}>Your pick</th>
                <th style={gridThStyle('left')}>Winner</th>
                <th style={gridThStyle('left')}>Model&apos;s pick</th>
                <th style={gridThStyle('right')}>Result</th>
              </tr>
            </thead>
            <tbody>
              {btmHistory.map(h => (
                <tr key={h.comp_date}>
                  <td style={gridTdStyle('left', { mono: true })}>{h.comp_date}</td>
                  <td style={gridTdStyle('left')}>{h.venue ? `${titleCase(h.venue)} R${h.race_num}` : '—'}</td>
                  <td style={gridTdStyle('left')}>{h.your_pick || '—'}</td>
                  <td style={gridTdStyle('left')}>{h.winner || (h.resolved ? '—' : 'Pending')}</td>
                  <td style={gridTdStyle('left')}>{h.model_pick || '—'}</td>
                  <td style={gridTdStyle('right')}>
                    {!h.resolved ? <span style={{ color: '#9ca3af' }}>—</span>
                      : h.won ? <span style={{ color: '#16a34a', fontWeight: 700 }}>Hit</span>
                      : <span style={{ color: '#dc2626', fontWeight: 700 }}>Miss</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const btmLeaderboardPanel = (
    <div style={{ padding: '0 16px 16px' }}>
      {btmLbLoading ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
      ) : (
        <>
          <LeaderboardTable rows={btmLeaderboard} />
          <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af', lineHeight: 1.6 }}>
            Ranked by current streak, then hit rate. Streak breaks on any day without a correct pick — including missed days.
          </div>
        </>
      )}
    </div>
  );

  const beatModelTodayPanel = (
    <div style={{ padding: '0 16px 16px', maxWidth: 560 }}>
      <>
        {!btmChallenge ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: '#6b7280', fontSize: 12 }}>
            {csvRaces ? 'No eligible race found for today.' : 'Loading race data…'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>
              Today&apos;s challenge{btmChallenge.usedFallback ? ' · fallback pick' : ''}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 2 }}>
              {titleCase(btmChallenge.venue)} R{btmChallenge.raceNum}{btmChallenge.raceName ? ` — ${btmChallenge.raceName}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
              ${btmChallenge.prize.toLocaleString()} · {btmChallenge.starterCount} starters
              {btmChallenge.postTimeISO && ` · ${new Date(btmChallenge.postTimeISO).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' })} AEST`}
            </div>

            {!user?.id ? (
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Sign in to make your pick.</div>
            ) : !btmResolved ? (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
                  {btmPick ? 'Your pick' : isBtmLocked() ? 'Picks are locked' : 'Pick the winner'}
                </div>
                {isBtmLocked() && !btmPick ? (
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>This race has already started.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {btmSelectableHorses.map(h => (
                        <button key={h.name} disabled={isBtmLocked() || btmPickSaving} onClick={() => saveBtmPick(h.name)}
                          style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 5, cursor: isBtmLocked() ? 'default' : 'pointer', fontFamily: 'inherit',
                            background: btmPick === h.name ? '#d1fae5' : '#fff', color: '#111827', border: `1px solid ${btmPick === h.name ? '#16a34a' : '#d1d5db'}`, opacity: isBtmLocked() ? 0.6 : 1 }}>
                          {h.name}
                        </button>
                      ))}
                    </div>
                    {btmModelPickHidden && (
                      <div style={{ marginTop: 8, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                        The model&apos;s own pick isn&apos;t available to select — beat it with a different runner.
                      </div>
                    )}
                  </>
                )}
                {btmPick && <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af' }}>Check back after the race for the reveal — your pick vs. the winner vs. the model&apos;s own pick.</div>}
              </>
            ) : (
              // ─── The reveal — the core hook: your pick vs. actual winner vs. model's rank-1 ───
              <div>
                <div style={{ padding: '14px 16px', borderRadius: 10, marginBottom: 14, background: btmWon ? '#0d2416' : '#fef2f2', border: `1px solid ${btmWon ? '#2f9e44' : '#fecaca'}` }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: btmWon ? '#e8b84a' : '#991b1b' }}>
                    {btmWon ? '🏆 You beat the model!' : '🤖 The model got this one.'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Your pick',  value: btmPick, hit: btmWon },
                    { label: 'Winner',     value: btmWinnerRow?.horse_name || '—', hit: true },
                    { label: "Model's pick", value: btmModelPick || '—', hit: btmModelPick && btmWinnerRow && btmModelPick.toLowerCase() === (btmWinnerRow.horse_name||'').toLowerCase() },
                  ].map(c => (
                    <div key={c.label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>{c.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c.hit ? '#16a34a' : '#111827' }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 14, borderTop: `0.5px solid ${CT_LINE}`, fontSize: 10, color: '#9ca3af' }}>
              {btmStats.participants} tipster{btmStats.participants !== 1 ? 's' : ''} entered today
              {btmStats.correct > 0 && ` · ${btmStats.correct} beat the model so far`}
            </div>
          </>
        )}
      </>
    </div>
  );

  const beatModelTab = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#fff' }}>
      <div style={{ padding: '16px 0 0' }}>{btmSubTabBar}</div>
      {btmSubTab === 'today' && beatModelTodayPanel}
      {btmSubTab === 'history' && btmHistoryPanel}
      {btmSubTab === 'leaderboard' && btmLeaderboardPanel}
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

  // ─── Persistent tab bar — shown above all three views (not just linked
  // one-way from Today into the others), so any view is reachable from any
  // other. Shared MainTabBar component -- same icon-tile styling as the
  // Games page's Trivia/Puzzle/Track Dash/Prizes nav, not a hand-duplicated
  // copy of it. ───────────────────────────────────────────────────────────
  const mainTabBar = <MainTabBar tabs={MAIN_TABS} activeId={mainTab} onSelect={setMainTab} />;

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      {mainTabBar}
      {mainTab === 'today' ? todayTab : mainTab === 'beat-model' ? beatModelTab : allTimeTab}
    </main>
  );
}
