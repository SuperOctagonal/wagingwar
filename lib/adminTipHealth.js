import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { fetchTipRows, isSettled } from '@/lib/tipRecord';
import { agg } from '@/app/tip-record/helpers';
import { normaliseVenue } from '@/lib/venues';
import { sydneyDateTimeToInstant } from '@/lib/raceTime';
import { racingToday } from '@/lib/adminDataHealth';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

export const UNSETTLED_AFTER_HOURS = 3;
export const SNAPSHOT_STALE_MIN = 60;
// Unsettled "no result" tips in this many recent days drive the status;
// older ones are listed and counted but don't keep the panel red forever.
const STATUS_WINDOW_DAYS = 7;

const key = (date, venue, race) => `${date}|${normaliseVenue(venue)}|${Number(race)}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Same settled-row array shape the public Tip Record uses (lib/tipRecord.js),
// so agg() from app/tip-record/helpers.js applies unchanged: it reads
// r[9] finish_pos, r[8] sp, r[13] dead_heat_winners.
function settledShape(r) {
  const a = []; a[8] = Number(r.sp); a[9] = r.finish_pos; a[13] = r.dead_heat_winners || 1; return a;
}

export async function getTipHealth() {
  if (!SURL || !SKEY) return { ok: false, error: 'Supabase is not configured in this environment.' };
  const rows = await fetchTipRows();
  if (!rows) return { ok: false, error: 'Could not read tip_results.' };

  const now = Date.now();
  const today = racingToday();
  const settled = rows.filter(isSettled);
  const unsettled = rows.filter(r => !isSettled(r) && r.date <= today);

  // Jump times for unsettled tips' dates and for today (race_schedule.post_time, Sydney clock).
  const dates = [...new Set([...unsettled.map(r => r.date), today])];
  const [schedR, snapR, meetingsR] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_schedule?select=date,venue,race_num,post_time&date=in.(${dates.join(',')})`, HEADERS),
    sbAdminRaw('race_feature_snapshots?select=captured_at,date,venue,race_num&order=captured_at.desc&limit=1'),
    sbAdminRaw(`today_meetings?select=venue,is_abandoned&date=eq.${today}`),
  ]);
  if (!schedR.ok || !snapR.ok || !meetingsR.ok) return { ok: false, error: 'Could not read race_schedule / snapshots / meetings.' };
  const jumps = new Map();
  for (const s of schedR.rows) {
    const j = sydneyDateTimeToInstant(s.date, s.post_time);
    if (j) jumps.set(key(s.date, s.venue, s.race_num), j.getTime());
  }

  // 1. Rank-1 tips still unsettled more than 3h after the jump.
  // Reason comes from the view's excluded_reason (the one place it's defined).
  const overdue = [];
  unsettled.forEach((r) => {
    const jump = jumps.get(key(r.date, r.venue, r.race_num)) ?? null;
    const hours = jump != null ? (now - jump) / 3600e3 : null;
    const isOverdue = jump != null ? hours > UNSETTLED_AFTER_HOURS : r.date < today;
    if (!isOverdue) return;
    overdue.push({
      key: `${r.date}|${r.venue}|${r.race_num}`, date: r.date, venue: r.venue, raceNum: Number(r.race_num), horse: r.horse_name,
      jump: jump != null ? new Date(jump).toISOString() : null, hoursSinceJump: hours != null ? Math.round(hours * 10) / 10 : null,
      reason: r.excluded_reason || 'no_result', capturedAt: r.captured_at,
    });
  });
  overdue.sort((a, b) => (a.date === b.date ? a.venue.localeCompare(b.venue) || a.raceNum - b.raceNum : b.date.localeCompare(a.date)));
  const windowStart = addDays(today, -(STATUS_WINDOW_DAYS - 1));
  const recentNoResult = overdue.filter(o => o.reason === 'no_result' && o.date >= windowStart);
  const byReason = overdue.reduce((t, o) => ({ ...t, [o.reason]: (t[o.reason] || 0) + 1 }), { no_result: 0, no_sp: 0, scratched: 0, abandoned: 0 });

  // 2. Snapshot freshness, judged inside today's racing window only
  //    (snapshots are captured per race shortly before each jump).
  const latestSnap = snapR.data?.[0] || null;
  const todayJumps = [...jumps.entries()].filter(([k]) => k.startsWith(`${today}|`)).map(([, t]) => t).sort((a, b) => a - b);
  const racingDay = (meetingsR.data || []).some(m => !m.is_abandoned) && todayJumps.length > 0;
  const windowOpen = racingDay ? todayJumps[0] - 60 * 60e3 : null;
  const windowClose = racingDay ? todayJumps[todayJumps.length - 1] : null;
  const inWindow = racingDay && now >= windowOpen && now <= windowClose;
  const snapAgeMin = latestSnap ? Math.round((now - new Date(latestSnap.captured_at).getTime()) / 60000) : null;
  const snapshot = {
    latest: latestSnap?.captured_at || null, latestRace: latestSnap ? `${latestSnap.venue} R${latestSnap.race_num} (${latestSnap.date})` : null,
    ageMin: snapAgeMin, racingDay, inWindow,
    windowOpen: windowOpen ? new Date(windowOpen).toISOString() : null, windowClose: windowClose ? new Date(windowClose).toISOString() : null,
    stale: inWindow && (snapAgeMin == null || snapAgeMin > SNAPSHOT_STALE_MIN),
  };

  // 3. Today's tips vs today's races.
  const tipsToday = rows.filter(r => r.date === today);
  const tipKeys = new Set(tipsToday.map(r => key(r.date, r.venue, r.race_num)));
  const jumpedNoTip = [...jumps.entries()].filter(([k, t]) => k.startsWith(`${today}|`) && t <= now && !tipKeys.has(k)).map(([k]) => k.split('|').slice(1).join(' R'));
  const todayTips = { races: todayJumps.length, tips: tipsToday.length, settled: tipsToday.filter(isSettled).length, jumpedNoTip };

  // 4. Record to date: agg() from app/tip-record/helpers.js -- the same
  //    function behind the public Tip Record headline, dead-heat rule included.
  const a = agg(settled.map(settledShape));
  const deadHeatWins = settled.filter(r => r.finish_pos === 1 && (r.dead_heat_winners || 1) > 1).length;
  const record = {
    settled: a.n, wins: a.w, deadHeatWins,
    strikeRate: a.n ? a.sr : null,
    units: Math.round(a.u * 100) / 100,
    roi: a.n ? a.roi : null,
    from: settled[0]?.date || null, to: settled[settled.length - 1]?.date || null,
  };

  const red = [], amber = [];
  if (recentNoResult.length) red.push(`${recentNoResult.length} rank-1 tip${recentNoResult.length === 1 ? '' : 's'} in the last ${STATUS_WINDOW_DAYS} days with no result ${UNSETTLED_AFTER_HOURS}h+ after the jump`);
  if (snapshot.stale) red.push(`Latest snapshot is ${snapAgeMin ?? '?'} min old during racing`);
  if (jumpedNoTip.length) amber.push(`${jumpedNoTip.length} jumped race${jumpedNoTip.length === 1 ? '' : 's'} today with no rank-1 tip`);
  const status = red.length ? 'red' : amber.length ? 'amber' : 'green';

  return { ok: true, generatedAt: new Date(now).toISOString(), today, status, flags: [...red, ...amber], overdue, byReason, recentNoResult: recentNoResult.length, snapshot, todayTips, record };
}
