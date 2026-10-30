import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { sydneyDateTimeToInstant } from '@/lib/raceTime';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// A jumped race with no result this long after its jump is "overdue".
export const RESULT_GRACE_MIN = 45;
// The date picker covers today plus this many previous days.
export const HEALTH_DAYS_BACK = 7;

// Racing date: Sydney calendar day, same basis as race_schedule.post_time
// (Sydney clock for every venue, see lib/raceTime.js).
export function racingToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' });
}

export function healthDates() {
  const base = new Date(`${racingToday()}T00:00:00Z`);
  return Array.from({ length: HEALTH_DAYS_BACK + 1 }, (_, i) => {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() - i); return d.toISOString().slice(0, 10);
  });
}

const raceKey = n => String(Number(n));
const maxIso = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

// "...pausing ALL results scraping until 19:05:53 AEST" (AEST = UTC+10) ->
// instant the pause ends, using the row's created_at for the date.
function circuitBreakerUntil(row) {
  const m = /until (\d{2}):(\d{2}):(\d{2}) AEST/.exec(row.error_msg || '');
  if (!m) return null;
  const created = new Date(row.created_at);
  const aestDay = new Date(created.getTime() + 10 * 3600e3).toISOString().slice(0, 10);
  let until = new Date(`${aestDay}T${m[1]}:${m[2]}:${m[3]}+10:00`);
  if (until < created) until = new Date(until.getTime() + 864e5); // crossed midnight
  return until;
}

// Data health for one racing date. Returns meetings (one per normalised
// venue), global findings, and an overall red/amber/green status.
export async function getDataHealth(date) {
  if (!SURL || !SKEY) return { ok: false, error: 'Supabase is not configured in this environment.' };
  const q = (table, select, dateCol = 'date') => fetchAllRows(`${SURL}/rest/v1/${table}?select=${select}&${dateCol}=eq.${date}`, HEADERS);
  // scraper_health: some checks (e.g. "VENUE COMPLETENESS ... for 2026-10-24")
  // are logged under the previous race_date, so load both days and attribute
  // each row to the date its message names, else to its race_date.
  const prevDay = (() => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const [meetingsR, schedR, cardsR, resultsR, scratchR, healthR] = await Promise.all([
    q('today_meetings', 'venue,state,track_condition,condition_override,is_abandoned,calendar_mismatch,created_at'),
    q('race_schedule', 'venue,race_num,post_time'),
    q('race_cards', 'venue,race_num,updated_at'),
    q('race_results', 'venue,race_num,scraped_at,track_cond'),
    q('scratchings', 'venue,race_num,created_at'),
    fetchAllRows(`${SURL}/rest/v1/scraper_health?select=venue,error_msg,created_at,race_date&race_date=in.(${prevDay},${date})`, HEADERS),
  ]);
  const failed = [meetingsR, schedR, cardsR, resultsR, scratchR, healthR].find(r => !r.ok);
  if (failed) return { ok: false, error: `Could not read data (HTTP ${failed.status}).` };

  const now = Date.now();
  const byVenue = new Map();
  const meeting = (raw) => {
    const key = normaliseVenue(raw) || String(raw || '').toUpperCase();
    if (!byVenue.has(key)) {
      byVenue.set(key, {
        venue: key, rawNames: new Set(), meetingRows: 0, state: null, trackCondition: null, abandoned: false, calendarMismatch: false,
        races: new Map(), cardRaces: new Set(), cardsUpdated: null, resultRaces: new Set(), lastResult: null, resultTrack: null,
        scratchings: 0, lastScratching: null, scraperErrors: 0, lastScraperError: null, lastScraperMsg: null,
      });
    }
    const m = byVenue.get(key);
    if (raw) m.rawNames.add(String(raw).toUpperCase());
    return m;
  };

  for (const r of meetingsR.rows) {
    const m = meeting(r.venue);
    m.meetingRows++;
    m.state = m.state || r.state;
    m.trackCondition = m.trackCondition || r.condition_override || r.track_condition || null;
    m.abandoned = m.abandoned || !!r.is_abandoned;
    m.calendarMismatch = m.calendarMismatch || !!r.calendar_mismatch;
  }
  for (const r of schedR.rows) {
    const jump = sydneyDateTimeToInstant(date, r.post_time);
    meeting(r.venue).races.set(raceKey(r.race_num), jump ? jump.toISOString() : null);
  }
  for (const r of cardsR.rows) {
    const m = meeting(r.venue);
    m.cardRaces.add(raceKey(r.race_num));
    m.cardsUpdated = maxIso(m.cardsUpdated, r.updated_at);
  }
  for (const r of resultsR.rows) {
    const m = meeting(r.venue);
    m.resultRaces.add(raceKey(r.race_num));
    m.lastResult = maxIso(m.lastResult, r.scraped_at);
    m.resultTrack = m.resultTrack || r.track_cond || null;
  }
  for (const r of scratchR.rows) {
    const m = meeting(r.venue);
    m.scratchings++;
    m.lastScratching = maxIso(m.lastScratching, r.created_at);
  }

  // scraper_health: venue 'ALL' rows are global (circuit breaker); rows for a
  // meeting on this date count against it; anything else (a scraper name
  // like everyrace_downloader, or a venue not racing this date) is listed
  // as a global finding instead of becoming a phantom meeting.
  const breakerTrips = [];
  const unmatched = new Map(); // name -> { n, last, msg }
  for (const r of healthR.rows) {
    const named = /\bfor (\d{4}-\d{2}-\d{2})\b/.exec(r.error_msg || '')?.[1];
    if ((named || r.race_date) !== date) continue;
    if (String(r.venue).toUpperCase() === 'ALL') { breakerTrips.push(r); continue; }
    const key = normaliseVenue(r.venue) || String(r.venue || '').toUpperCase();
    const m = byVenue.get(key);
    if (!m) {
      const u = unmatched.get(r.venue) || { n: 0, last: null, msg: null };
      u.n++; if (!u.last || r.created_at > u.last) { u.last = r.created_at; u.msg = r.error_msg; }
      unmatched.set(r.venue, u);
      continue;
    }
    m.scraperErrors++;
    if (!m.lastScraperError || r.created_at > m.lastScraperError) { m.lastScraperError = r.created_at; m.lastScraperMsg = r.error_msg; }
  }

  const meetings = [...byVenue.values()].map(m => {
    // Races: schedule first; races known only from cards/results have no jump time.
    for (const rn of [...m.cardRaces, ...m.resultRaces]) if (!m.races.has(rn)) m.races.set(rn, null);
    const races = [...m.races.entries()]
      .map(([raceNum, jump]) => {
        const jumped = jump ? new Date(jump).getTime() <= now : date < racingToday();
        const minsSinceJump = jump ? Math.floor((now - new Date(jump).getTime()) / 60000) : null;
        const hasResult = m.resultRaces.has(raceNum);
        const overdue = !m.abandoned && jumped && !hasResult && (minsSinceJump == null || minsSinceJump > RESULT_GRACE_MIN);
        return { raceNum: Number(raceNum), jump, jumped, hasResult, hasCard: m.cardRaces.has(raceNum), overdue, minsSinceJump };
      })
      .sort((a, b) => a.raceNum - b.raceNum);

    const raceCount = races.length;
    const jumpedCount = races.filter(r => r.jumped).length;
    const resultedJumped = races.filter(r => r.jumped && r.hasResult).length;
    const overdue = races.filter(r => r.overdue);
    const track = m.trackCondition || m.resultTrack;
    const red = [], amber = [];

    if (!m.abandoned) {
      if (!m.cardRaces.size) red.push('No race cards');
      else if (m.cardRaces.size < raceCount) amber.push(`Cards for ${m.cardRaces.size} of ${raceCount} races`);
      if (overdue.length) red.push(`${overdue.length} jumped race${overdue.length === 1 ? '' : 's'} with no result after ${RESULT_GRACE_MIN} min (R${overdue.map(r => r.raceNum).join(', R')})`);
      if (!track) amber.push('No track condition');
      if (!races.some(r => r.jump)) amber.push('No jump times (race_schedule)');
    }
    if (!isKnownAuVenue(m.venue)) red.push('Venue not on AU allowlist (isKnownAuVenue)');
    if (!m.meetingRows) amber.push('Not in today_meetings');
    if (m.meetingRows > 1 || m.rawNames.size > 1) amber.push(`${m.meetingRows} today_meetings rows / names: ${[...m.rawNames].join(', ')}`);
    if (m.calendarMismatch) amber.push('Calendar mismatch flagged');
    if (m.scraperErrors) amber.push(`${m.scraperErrors} scraper error${m.scraperErrors === 1 ? '' : 's'}`);

    return {
      venue: m.venue, state: m.state, abandoned: m.abandoned,
      status: m.abandoned ? 'abandoned' : red.length ? 'red' : amber.length ? 'amber' : 'green',
      flags: [...red, ...amber],
      raceCount, cardRaces: m.cardRaces.size, jumpedCount, resultedJumped, overdueCount: overdue.length,
      trackCondition: track || null, scratchings: m.scratchings, scraperErrors: m.scraperErrors,
      lastScraperMsg: m.lastScraperMsg, lastScraperError: m.lastScraperError,
      cardsUpdated: m.cardsUpdated, lastResult: m.lastResult, lastScratching: m.lastScratching,
      races,
    };
  }).sort((a, b) => a.venue.localeCompare(b.venue));

  // Global: results-scraping circuit breaker.
  const global = [];
  if (breakerTrips.length) {
    const latest = breakerTrips.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    const until = circuitBreakerUntil(latest);
    const active = until && until.getTime() > now;
    global.push({
      status: active ? 'red' : 'amber',
      text: active
        ? `Results scraping is PAUSED by the circuit breaker until ${until.toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit' })} AEST (bot challenges). Tripped ${breakerTrips.length}× this day.`
        : `Results-scraping circuit breaker tripped ${breakerTrips.length}× this day (bot challenges); not active now.`,
      lastAt: latest.created_at,
    });
  }
  for (const [name, u] of unmatched) {
    global.push({ status: 'amber', text: `Scraper message${u.n === 1 ? '' : 's'} not tied to a meeting on this date — ${name} (${u.n}×): ${(u.msg || '').slice(0, 160)}`, lastAt: u.last });
  }
  const lastResultAny = meetings.reduce((t, m) => maxIso(t, m.lastResult), null);
  const overdueTotal = meetings.reduce((t, m) => t + m.overdueCount, 0);
  if (overdueTotal && lastResultAny && now - new Date(lastResultAny).getTime() > RESULT_GRACE_MIN * 60000) {
    global.push({ status: 'red', text: `No new results scraped for ${Math.round((now - new Date(lastResultAny).getTime()) / 60000)} min while ${overdueTotal} race${overdueTotal === 1 ? ' is' : 's are'} overdue (stale results scraper).`, lastAt: lastResultAny });
  }

  const statuses = [...meetings.map(m => m.status), ...global.map(g => g.status)];
  const overall = statuses.includes('red') ? 'red' : statuses.includes('amber') ? 'amber' : meetings.length ? 'green' : null;
  return {
    ok: true, date, generatedAt: new Date(now).toISOString(), overall, global, meetings,
    counts: { red: meetings.filter(m => m.status === 'red').length, amber: meetings.filter(m => m.status === 'amber').length, green: meetings.filter(m => m.status === 'green').length, abandoned: meetings.filter(m => m.abandoned).length },
  };
}
