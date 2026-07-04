'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { scoreHorse, getDefaultWeights } from '@/lib/scoring';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const G = '#00471b';

const METRO_VENUES = new Set([
  'RANDWICK','ROSEHILL','ROSEHILL GARDENS','WARWICK FARM','HAWKESBURY','GOSFORD',
  'KEMBLA GRANGE','NEWCASTLE','FLEMINGTON','CAULFIELD','MOONEE VALLEY','SANDOWN',
  'SANDOWN LAKESIDE','SANDOWN-HILLSIDE','SANDOWN HILLSIDE','EAGLE FARM','DOOMBEN',
  'GOLD COAST','MORPHETTVILLE','MORPHETTVILLE PARKS','ASCOT','BELMONT','BELMONT PARK',
]);

const VENUE_NORM = {
  'SANDOWN-HILLSIDE':'SANDOWN','SANDOWN HILLSIDE':'SANDOWN',
  'ROSEHILL GARDENS':'ROSEHILL GARDENS','ROSEHILL GARDENS RACECOURSE':'ROSEHILL GARDENS',
  'AQUIS PARK GOLD COAST':'GOLD COAST','AQUIS PARK GOLD COAST POLY':'GOLD COAST POLY',
  'THOMAS FARMS RC MURRAY BRIDGE':'MURRAY BRIDGE','THOMAS FARMS MURRAY BRIDGE':'MURRAY BRIDGE',
  'RC MURRAY BRIDGE':'MURRAY BRIDGE','SPORTSBET SANDOWN HILLSIDE':'SANDOWN',
  'BELMONT PARK':'BELMONT','BALLARAT SYN':'BALLARAT SYNTHETIC',
};

function nv(v) { const u = (v || '').toUpperCase().trim(); return VENUE_NORM[u] || u; }
function aestISO() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' }); }
function rk(venue, num) { return `${nv(venue)}||${num}`; }

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
    const v = (race.venue || '').toUpperCase().trim();
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
    const v = (race.venue || '').toUpperCase().trim();
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

export default function CompetitionsPage() {
  const { user } = useUser();
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [csvRaces, setCsvRaces] = useState(null);
  const [picks, setPicks] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [popularData, setPopularData] = useState([]);   // rows from comp_picks_popular view
  const [allPicksData, setAllPicksData] = useState([]); // raw rows for leaderboard
  const [results, setResults] = useState({});
  const [scratchings, setScratchings] = useState(new Set());
  const [allTimePoints, setAllTimePoints] = useState(null);
  const [mainTab, setMainTab] = useState('today');
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [submitToast, setSubmitToast] = useState(null);

  const today = useMemo(() => aestISO(), []);
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

  // Built from comp_picks_popular aggregate view — no client-side counting
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

  const todayLeaderboard = useMemo(() => {
    const um = {};
    for (const r of allPicksData) {
      if (!um[r.clerk_id]) um[r.clerk_id] = { clerk_id: r.clerk_id, uname: r.username || 'User', picks: {} };
      um[r.clerk_id].picks[rk(r.venue, r.race_num)] = r.horse_name;
    }
    const entries = Object.values(um).map(entry => {
      let score = 0;
      for (const [key, horse] of Object.entries(entry.picks)) {
        if (results[key] && results[key].toLowerCase() === horse.toLowerCase()) score += 1;
      }
      for (const v of selVenues) {
        const mRaces = compRaces.filter(r => (r.venue || '').toUpperCase().trim() === v);
        if (mRaces.length < 4) continue;
        const allOk = mRaces.every(r => {
          const k = rk(r.venue, r.num);
          return results[k] && entry.picks[k] && results[k].toLowerCase() === entry.picks[k].toLowerCase();
        });
        if (allOk) score += 3;
      }
      return { ...entry, score, isMe: entry.clerk_id === user?.id };
    });
    entries.sort((a, b) => b.score - a.score);
    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [allPicksData, results, compRaces, selVenues, user?.id]);

  const userScore = useMemo(() => {
    let s = 0;
    for (const [key, horse] of Object.entries(picks)) {
      if (results[key] && results[key].toLowerCase() === horse.toLowerCase()) s += 1;
    }
    for (const v of selVenues) {
      const mRaces = compRaces.filter(r => (r.venue || '').toUpperCase().trim() === v);
      if (mRaces.length < 4) continue;
      if (mRaces.every(r => { const k = rk(r.venue, r.num); return results[k] && picks[k] && results[k].toLowerCase() === picks[k].toLowerCase(); })) s += 3;
    }
    return s;
  }, [picks, results, compRaces, selVenues]);

  const userRank = useMemo(() => todayLeaderboard.find(e => e.isMe)?.rank ?? null, [todayLeaderboard]);
  const entrantCount = useMemo(() => new Set(allPicksData.map(r => r.clerk_id)).size, [allPicksData]);
  const pickedCount = useMemo(() => compRaces.filter(r => picks[rk(r.venue, r.num)]).length, [compRaces, picks]);
  const leaderScore = useMemo(() => todayLeaderboard[0]?.score ?? 0, [todayLeaderboard]);

  const scratchAlerts = useMemo(() => compRaces.filter(r => {
    const key = rk(r.venue, r.num);
    const pick = picks[key];
    return pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
  }), [compRaces, picks, scratchings]);

  const meetingPrize = useMemo(() => {
    const m = {};
    if (!csvRaces) return m;
    Object.values(csvRaces.allRaces).forEach(race => {
      const v = (race.venue || '').toUpperCase().trim();
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
    for (const v of selVenues) m[v] = compRaces.filter(r => (r.venue || '').toUpperCase().trim() === v);
    return m;
  }, [compRaces, selVenues]);

  // AEST day of week 0=Mon..6=Sun
  const todayDayIdx = useMemo(() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
    return (d.getDay() + 6) % 7;
  }, []);

  function isLocked(race) {
    const jt = jumpDate(race.time, race.date);
    return jt ? jt.getTime() <= now : false;
  }

  function getStatus(race) {
    const key = rk(race.venue, race.num);
    if (results[key]) {
      const pick = picks[key];
      if (!pick) return 'nopick';
      return results[key].toLowerCase() === pick.toLowerCase() ? 'won' : 'lost';
    }
    const jt = jumpDate(race.time, race.date);
    if (!jt) return 'pending';
    return jt.getTime() <= now ? 'racing' : 'pending';
  }

  // Effects
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ww_csv');
      if (saved) { const parsed = parseCSV(saved); setCsvRaces(buildRaces(parsed)); }
    } catch { }
  }, []);

  useEffect(() => {
    if (!user?.id || !SURL || !SKEY) return;
    sbFetch(`comp_picks?clerk_id=eq.${encodeURIComponent(user.id)}&date=eq.${today}&select=venue,race_num,horse_name`)
      .then(rows => {
        if (!Array.isArray(rows)) return;
        const p = {};
        rows.forEach(r => { p[rk(r.venue, r.race_num)] = r.horse_name; });
        setPicks(p);
      });
  }, [user?.id, today]);

  useEffect(() => {
    if (!SURL || !SKEY) return;
    function load() {
      sbFetch(`comp_results?date=eq.${today}&select=venue,race_num,winner`)
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
  }, [today]);

  useEffect(() => {
    if (!SURL || !SKEY) return;
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
  }, [today]);

  useEffect(() => {
    if (!SURL || !SKEY) return;
    function loadAll() {
      // Aggregate view for popularity %
      sbFetch(`comp_picks_popular?date=eq.${today}&select=venue,race_num,horse_name,pick_count`)
        .then(rows => { if (Array.isArray(rows)) setPopularData(rows); });
      // Full rows for leaderboard computation
      sbFetch(`comp_picks?date=eq.${today}&select=clerk_id,username,venue,race_num,horse_name`)
        .then(rows => { if (Array.isArray(rows)) setAllPicksData(rows); });
    }
    loadAll();
    const id = setInterval(loadAll, 30000);
    return () => clearInterval(id);
  }, [today]);

  useEffect(() => {
    if (!user?.id || !SURL || !SKEY) return;
    sbFetch(`points_log?clerk_id=eq.${encodeURIComponent(user.id)}&select=points`)
      .then(rows => {
        if (!Array.isArray(rows)) return;
        setAllTimePoints(rows.reduce((s, r) => s + (r.points || 0), 0));
      });
  }, [user?.id]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function savePick(race, horseName) {
    if (!horseName) return;
    const key = rk(race.venue, race.num);
    if (isLocked(race) && !scratchAlerts.some(r => rk(r.venue, r.num) === key)) return;
    setPicks(p => ({ ...p, [key]: horseName }));
    if (!user?.id || !SURL || !SKEY) return;
    setSavingKey(key);
    await sbFetch('comp_picks', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { clerk_id: user.id, date: today, venue: nv(race.venue), race_num: +race.num, horse_name: horseName, username: uname },
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
      const res = await sbFetch('comp_picks', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { clerk_id: user.id, date: today, venue: nv(race.venue), race_num: +race.num, horse_name: horse, username: uname },
      });
      if (res === null) allOk = false;
    }
    const rows = await sbFetch(`comp_picks?date=eq.${today}&select=clerk_id,username,venue,race_num,horse_name`);
    if (Array.isArray(rows)) setAllPicksData(rows);
    setSubmitting(false);
    setSubmitToast(allOk ? 'success' : 'error');
    setTimeout(() => setSubmitToast(null), 3000);
  }

  // ─── Pro gate ─────────────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, background: '#f3f4f6' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '32px 28px', maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 26 }}>🏆</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Daily Competition</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
            Pick the winner of each selected race and climb the daily leaderboard. Pro members only.
          </div>
          <button onClick={() => setUpgradeOpen(true)} style={{ width: '100%', padding: '13px 0', background: G, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Upgrade to Pro
          </button>
        </div>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </main>
    );
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────
  const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const headerDateStr = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Brisbane' });

  function renderRaceRow(race) {
    const key = rk(race.venue, race.num);
    const locked = isLocked(race);
    const status = getStatus(race);
    const pick = picks[key];
    const popular = popularPicks[key] || [];
    const topPop = popular[0];
    const rank1 = mr1Map[key];
    const jt = jumpDate(race.time, race.date);
    const msToJump = jt ? jt.getTime() - now : null;
    const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
    const activeHorses = (race.horses || []).filter(h => !h.scratched && !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`));

    return (
      <>
        {isScratched && (
          <tr key={`${key}-alert`}>
            <td colSpan={5} style={{ padding: '5px 10px', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
                ⚠ {pick} has been scratched — please re-pick below
              </span>
            </td>
          </tr>
        )}
        <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
          {/* Race info */}
          <td style={{ padding: '10px 10px', minWidth: 130, verticalAlign: 'middle' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{titleCase(race.venue)} R{race.num}</div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{race.time || '—'} · {race.dist || ''}</div>
          </td>
          {/* Your pick */}
          <td style={{ padding: '10px 8px', minWidth: 130, verticalAlign: 'middle' }}>
            {locked && !isScratched ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: pick ? '#111827' : '#d1d5db' }}>{pick || 'No pick'}</span>
            ) : (
              <div>
                <select
                  value={pick || ''}
                  onChange={e => savePick(race, e.target.value)}
                  style={{
                    fontSize: 11, padding: '5px 6px', borderRadius: 5, width: '100%', maxWidth: 148,
                    border: `1px solid ${isScratched ? '#dc2626' : pick ? '#86efac' : '#e5e7eb'}`,
                    background: isScratched ? '#fef2f2' : pick ? '#f0fdf4' : '#fff',
                    color: pick ? '#065f46' : '#9ca3af', cursor: 'pointer', boxSizing: 'border-box',
                  }}
                >
                  <option value="">Pick horse…</option>
                  {activeHorses.map(h => (
                    <option key={h.name} value={h.name}>{h.name}</option>
                  ))}
                </select>
                {savingKey === key && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Saving…</div>}
              </div>
            )}
          </td>
          {/* Most popular */}
          <td style={{ padding: '10px 8px', minWidth: 120, verticalAlign: 'middle' }}>
            {topPop ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{topPop.horse}</div>
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>{topPop.pct}% of {topPop.total} picks</div>
              </div>
            ) : (
              <span style={{ fontSize: 10, color: '#d1d5db' }}>No picks yet</span>
            )}
          </td>
          {/* Model #1 */}
          <td style={{ padding: '10px 8px', minWidth: 100, verticalAlign: 'middle' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{rank1 || '—'}</span>
          </td>
          {/* Result / countdown */}
          <td style={{ padding: '10px 8px', minWidth: 72, verticalAlign: 'middle', textAlign: 'center' }}>
            {status === 'won' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#dcfce7', color: '#166534' }}>WON</span>}
            {status === 'lost' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fee2e2', color: '#991b1b' }}>LOST</span>}
            {status === 'racing' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fffbeb', color: '#92400e' }}>Racing</span>}
            {status === 'nopick' && <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>}
            {status === 'pending' && msToJump !== null && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{fmtMs(msToJump) || 'Now'}</span>
            )}
            {status === 'pending' && msToJump === null && <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>}
          </td>
        </tr>
      </>
    );
  }

  // ─── Left panel ───────────────────────────────────────────────────────────────
  const leftPanel = (
    <div style={{ width: 160, flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: '14px 12px', boxSizing: 'border-box', overflowY: 'auto' }}>
      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff' }}>{initials}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>{uname}</div>
      </div>

      {/* Today stats */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Today</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Rank</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{userRank ? `#${userRank}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Score</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{userScore} pts</span>
        </div>
      </div>

      {/* All-time points */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>All-time</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Points</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{allTimePoints !== null ? allTimePoints : '—'}</span>
        </div>
      </div>

      {/* This week grid */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>This week</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {WEEK_DAYS.map((d, i) => {
            const isToday = i === todayDayIdx;
            const isPast = i < todayDayIdx;
            return (
              <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 7, color: '#9ca3af' }}>{d[0]}</span>
                <div style={{
                  width: 17, height: 17, borderRadius: 3,
                  background: isToday ? G : isPast ? '#f3f4f6' : '#f9fafb',
                  border: `1px solid ${isToday ? G : '#e5e7eb'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 700,
                  color: isToday ? '#fff' : '#9ca3af',
                }}>
                  {isToday ? userScore : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Best streak (today's) */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Best streak</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
          {(() => {
            let streak = 0, best = 0;
            for (const race of compRaces) {
              const key = rk(race.venue, race.num);
              const winner = results[key];
              if (!winner) { streak = 0; continue; }
              if (picks[key] && winner.toLowerCase() === picks[key].toLowerCase()) { streak++; if (streak > best) best = streak; }
              else streak = 0;
            }
            return best;
          })()}
        </div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>correct in a row</div>
      </div>

      <button onClick={() => setMainTab('alltime')} style={{ padding: '7px 0', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer', width: '100%' }}>
        View history
      </button>
    </div>
  );

  // ─── Centre panel ─────────────────────────────────────────────────────────────
  const centrePanel = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Entrants', val: entrantCount || 0 },
          { label: 'Leader', val: leaderScore },
          { label: 'Meetings', val: selVenues.length },
        ].map(({ label, val }, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: i > 0 ? 14 : 0 }}>
            {i > 0 && <div style={{ width: 1, height: 24, background: '#e5e7eb', marginRight: 14 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{val}</span>
              <span style={{ fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>{label}</span>
            </div>
          </div>
        ))}
        <div style={{ flex: 1, display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {selVenues.map(v => (
            <span key={v} style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f0fdf4', color: G, border: `1px solid #bbf7d0`, whiteSpace: 'nowrap' }}>
              {titleCase(v)}
            </span>
          ))}
        </div>
      </div>

      {/* Race table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {!csvRaces && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 32 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>No race data loaded</div>
            <div style={{ fontSize: 12, color: '#9ca3af', maxWidth: 280 }}>Upload today&apos;s CSV on the Races page to enable the competition.</div>
          </div>
        )}
        {csvRaces && compRaces.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10 }}>
            <div style={{ fontSize: 32 }}>🏁</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>No races in CSV</div>
          </div>
        )}
        {csvRaces && compRaces.length > 0 && selVenues.map(v => (
          <div key={v}>
            <div style={{ background: '#f9fafb', padding: '7px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titleCase(v)}</span>
              <span style={{ fontSize: 9, color: '#9ca3af' }}>last 4 races · ${((meetingPrize[v] || 0) / 1000).toFixed(0)}k prize</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                  {['Race', 'Your pick', 'Most popular', 'Model #1', 'Result'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#9ca3af', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(racesByVenue[v] || []).map(race => (
                  <>{renderRaceRow(race)}</>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Right panel ──────────────────────────────────────────────────────────────
  const top5 = todayLeaderboard.slice(0, 5);
  const userEntry = todayLeaderboard.find(e => e.isMe);
  const showUserSep = userEntry && !top5.some(e => e.isMe);

  const rightPanel = (
    <div style={{ width: 180, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Leaderboard */}
      <div style={{ padding: '12px 12px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#111827', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today&apos;s leaderboard</div>
        {todayLeaderboard.length === 0 && (
          <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: '8px 0 12px' }}>No picks submitted yet</div>
        )}
        {[...top5, ...(showUserSep ? [userEntry] : [])].map((e, i) => (
          <div key={e.clerk_id} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 5, marginBottom: 2,
            background: e.isMe ? '#eff6ff' : 'transparent',
            border: e.isMe ? '1px solid #bfdbfe' : '1px solid transparent',
            ...(showUserSep && i === top5.length ? { marginTop: 6, borderTop: '1px dashed #e5e7eb', borderRadius: 0, paddingTop: 8 } : {}),
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', width: 14, textAlign: 'center', flexShrink: 0 }}>#{e.rank}</span>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: e.isMe ? '#1d4ed8' : G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {(e.uname || '?')[0].toUpperCase()}
            </div>
            <span style={{ fontSize: 10, fontWeight: e.isMe ? 700 : 500, color: e.isMe ? '#1d4ed8' : '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.uname}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: e.isMe ? '#1d4ed8' : G, flexShrink: 0 }}>{e.score}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: '#f3f4f6', margin: '10px 0' }} />

      {/* Scoring rules */}
      <div style={{ padding: '0 12px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#111827', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scoring</div>
        {[['Correct pick', '+1 pt'], ['Perfect 4/4 per meeting', '+3 bonus']].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, marginLeft: 6, flexShrink: 0 }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: '#f3f4f6' }} />

      {/* Today's meetings */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#111827', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today&apos;s meetings</div>
        {selVenues.length === 0 && <div style={{ fontSize: 10, color: '#9ca3af' }}>Load CSV on Races page</div>}
        {selVenues.map(v => (
          <div key={v} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{titleCase(v)}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>${((meetingPrize[v] || 0) / 1000).toFixed(0)}k</span>
          </div>
        ))}
      </div>

      {/* Scratch alerts */}
      {scratchAlerts.length > 0 && (
        <>
          <div style={{ height: 1, background: '#f3f4f6' }} />
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠ Scratch alerts</div>
            {scratchAlerts.map(race => (
              <div key={rk(race.venue, race.num)} style={{ fontSize: 10, color: '#991b1b', marginBottom: 3, lineHeight: 1.4 }}>
                {titleCase(race.venue)} R{race.num}: {picks[rk(race.venue, race.num)]} scratched
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 1, background: '#f3f4f6' }} />

      {/* Action buttons */}
      <div style={{ padding: '10px 12px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button
          onClick={submitAllPicks}
          disabled={submitting || pickedCount === 0}
          style={{
            padding: '9px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: pickedCount === 0 ? 'default' : 'pointer', border: 'none',
            background: submitToast === 'success' ? '#dcfce7' : submitToast === 'error' ? '#fee2e2' : pickedCount > 0 ? G : '#e5e7eb',
            color: submitToast === 'success' ? '#166534' : submitToast === 'error' ? '#991b1b' : pickedCount > 0 ? '#fff' : '#9ca3af',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting…' : submitToast === 'success' ? '✓ Picks submitted!' : submitToast === 'error' ? '✗ Submit failed' : `Submit picks (${pickedCount}/${compRaces.length})`}
        </button>
        <button
          onClick={() => {
            const text = compRaces.map(r => { const k = rk(r.venue, r.num); return `${titleCase(r.venue)} R${r.num}: ${picks[k] || '—'}`; }).join('\n');
            navigator.clipboard?.writeText(`My picks · ${today}\n${text}`).catch(() => { });
          }}
          style={{ padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, fontWeight: 600, color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          Copy my picks
        </button>
        <button onClick={() => setMainTab('alltime')} style={{ padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, fontWeight: 600, color: '#374151', background: '#fff', cursor: 'pointer' }}>
          Past comps
        </button>
        <button
          onClick={() => {
            const msg = encodeURIComponent(`Check out Waging War's daily competition — pick winners from today's top races!`);
            window.open(`https://twitter.com/intent/tweet?text=${msg}`, '_blank', 'noopener');
          }}
          style={{ padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, fontWeight: 600, color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          Share
        </button>
      </div>
    </div>
  );

  // ─── All-time tab ─────────────────────────────────────────────────────────────
  const allTimePanel = (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 16 }}>All-time leaderboard</div>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Historical rankings coming soon</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Cumulative scores across all competition dates will appear here.</div>
      </div>
    </div>
  );

  // ─── Mobile today view (stacked) ─────────────────────────────────────────────
  const mobileTodayPanel = (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* User score bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{uname}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Score: <b style={{ color: G }}>{userScore} pts</b> {userRank ? `· Rank #${userRank}` : ''}</div>
        </div>
        <button onClick={() => setMainTab('alltime')} style={{ fontSize: 10, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}>History</button>
      </div>
      {/* Stats row */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 14px', display: 'flex', gap: 16 }}>
        {[{ label: 'Entrants', val: entrantCount || 0 }, { label: 'Leader', val: leaderScore }, { label: 'Meetings', val: selVenues.length }].map(({ label, val }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{val}</span>
            <span style={{ fontSize: 8, color: '#9ca3af', textTransform: 'uppercase' }}>{label}</span>
          </div>
        ))}
      </div>
      {/* Scratch alerts */}
      {scratchAlerts.length > 0 && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 14px' }}>
          {scratchAlerts.map(race => (
            <div key={rk(race.venue, race.num)} style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
              ⚠ {picks[rk(race.venue, race.num)]} scratched in {titleCase(race.venue)} R{race.num} — re-pick below
            </div>
          ))}
        </div>
      )}
      {/* Races */}
      {!csvRaces && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>No CSV loaded</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Upload today&apos;s CSV on the Races page first.</div>
        </div>
      )}
      {csvRaces && selVenues.map(v => (
        <div key={v} style={{ background: '#fff', marginBottom: 1 }}>
          <div style={{ background: '#f9fafb', padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{titleCase(v)}</span>
            <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 6 }}>${((meetingPrize[v] || 0) / 1000).toFixed(0)}k prize</span>
          </div>
          {(racesByVenue[v] || []).map(race => {
            const key = rk(race.venue, race.num);
            const locked = isLocked(race);
            const status = getStatus(race);
            const pick = picks[key];
            const popular = popularPicks[key] || [];
            const topPop = popular[0];
            const rank1 = mr1Map[key];
            const jt = jumpDate(race.time, race.date);
            const msToJump = jt ? jt.getTime() - now : null;
            const isScratched = pick && scratchings.has(`${key}||${pick.toUpperCase()}`);
            const activeHorses = (race.horses || []).filter(h => !h.scratched && !scratchings.has(`${key}||${(h.name || '').toUpperCase()}`));
            return (
              <div key={key} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>R{race.num}</span>
                    <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>{race.time} · {race.dist}</span>
                  </div>
                  <div>
                    {status === 'won' && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#dcfce7', color: '#166534' }}>WON</span>}
                    {status === 'lost' && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fee2e2', color: '#991b1b' }}>LOST</span>}
                    {status === 'racing' && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fffbeb', color: '#92400e' }}>Racing</span>}
                    {status === 'pending' && msToJump !== null && <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280' }}>{fmtMs(msToJump) || 'Now'}</span>}
                  </div>
                </div>
                {isScratched && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, marginBottom: 5 }}>⚠ {pick} scratched — re-pick</div>}
                {locked && !isScratched ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: pick ? '#065f46' : '#9ca3af', background: pick ? '#f0fdf4' : '#f9fafb', padding: '5px 8px', borderRadius: 5, border: '1px solid #e5e7eb' }}>{pick || 'No pick'}</div>
                ) : (
                  <select value={pick || ''} onChange={e => savePick(race, e.target.value)}
                    style={{ width: '100%', fontSize: 12, padding: '7px 8px', borderRadius: 6, border: `1px solid ${isScratched ? '#dc2626' : pick ? '#86efac' : '#e5e7eb'}`, background: isScratched ? '#fef2f2' : pick ? '#f0fdf4' : '#fff', color: pick ? '#065f46' : '#9ca3af' }}>
                    <option value="">Pick horse…</option>
                    {activeHorses.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                  </select>
                )}
                {(topPop || rank1) && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    {topPop && <div style={{ fontSize: 9, color: '#6b7280' }}>Popular: <b style={{ color: '#111827' }}>{topPop.horse}</b> {topPop.pct}%</div>}
                    {rank1 && <div style={{ fontSize: 9, color: '#6b7280' }}>Model: <b style={{ color: '#111827' }}>{rank1}</b></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {/* Submit picks (mobile) */}
      {csvRaces && compRaces.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <button
            onClick={submitAllPicks}
            disabled={submitting || pickedCount === 0}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 7, fontSize: 13, fontWeight: 700, border: 'none',
              cursor: pickedCount === 0 ? 'default' : 'pointer',
              background: submitToast === 'success' ? '#dcfce7' : submitToast === 'error' ? '#fee2e2' : pickedCount > 0 ? G : '#e5e7eb',
              color: submitToast === 'success' ? '#166534' : submitToast === 'error' ? '#991b1b' : pickedCount > 0 ? '#fff' : '#9ca3af',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting…' : submitToast === 'success' ? '✓ Picks submitted!' : submitToast === 'error' ? '✗ Submit failed' : `Submit picks · ${pickedCount}/${compRaces.length} selected`}
          </button>
        </div>
      )}
      {/* Leaderboard (mobile inline) */}
      {todayLeaderboard.length > 0 && (
        <div style={{ background: '#fff', margin: '4px 0 0', padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leaderboard</div>
          {[...top5, ...(showUserSep ? [userEntry] : [])].map((e, i) => (
            <div key={e.clerk_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f3f4f6', background: e.isMe ? '#f0f7ff' : 'transparent' }}>
              <span style={{ fontSize: 10, color: '#9ca3af', width: 18 }}>#{e.rank}</span>
              <span style={{ fontSize: 11, flex: 1, fontWeight: e.isMe ? 700 : 400, color: e.isMe ? '#1d4ed8' : '#374151' }}>{e.uname}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: e.isMe ? '#1d4ed8' : G }}>{e.score}</span>
            </div>
          ))}
        </div>
      )}
      {/* Scoring rules (mobile) */}
      <div style={{ background: '#fff', margin: '4px 0', padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scoring</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>Correct pick <b style={{ color: G }}>+1pt</b> · Perfect 4/4 per meeting <b style={{ color: G }}>+3 bonus</b></div>
      </div>
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f3f4f6' }}>
      {/* Header bar */}
      <div style={{ background: G, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{headerDateStr}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{entrantCount} entrant{entrantCount !== 1 ? 's' : ''}</span>
          {closingTime && <><span style={{ opacity: 0.4 }}>·</span><span>Closes {closingTime}</span></>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {[{ id: 'today', label: 'Today' }, { id: 'alltime', label: 'All-time' }].map(t => (
            <button key={t.id} onClick={() => setMainTab(t.id)}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 4, cursor: 'pointer', background: mainTab === t.id ? 'rgba(255,255,255,0.2)' : 'transparent', color: mainTab === t.id ? '#fff' : 'rgba(255,255,255,0.55)' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {mainTab === 'today' && (
        isMobile
          ? mobileTodayPanel
          : (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {leftPanel}
              {centrePanel}
              {rightPanel}
            </div>
          )
      )}
      {mainTab === 'alltime' && allTimePanel}
    </main>
  );
}
