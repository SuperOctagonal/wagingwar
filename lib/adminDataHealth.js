import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { sydneyDateTimeToInstant } from '@/lib/raceTime';
import { RESULT_GRACE_MIN, meetingStatus, globalFindings, summarise, unknownVenueFindings } from '@/lib/dataHealthStatus.mjs';
import { createTtlCache } from '@/lib/ttlCache.mjs';
import { singleFlight } from '@/lib/singleFlight.mjs';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

export { RESULT_GRACE_MIN };
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

// Unknown-venue check: every venue name in race_cards / race_schedule /
// race_results across the whole picker window (healthDates()), not on the
// AU venue list (isKnownAuVenue). Shown on every date's banner so a missing
// venue can't go unnoticed. ~10k rows on a busy week, so built at most once
// per 10 minutes (ttlCache + singleFlight); a failed read isn't cached.
const VENUE_CHECK_TTL_MS = 10 * 60_000;
const venueCheckCache = createTtlCache({ ttlMs: VENUE_CHECK_TTL_MS, max: 2 });

async function buildVenueCheck() {
  const dates = healthDates();
  const from = dates[dates.length - 1], to = dates[0];
  const range = `date=gte.${from}&date=lte.${to}`;
  const reads = [
    ['race_cards', 'venue,date,race_num,horse_name'],
    ['race_schedule', 'venue,date,race_num'],
    ['race_results', 'venue,date,id'],
  ];
  const res = await Promise.all(reads.map(([table, order]) => fetchAllRows(`${SURL}/rest/v1/${table}?select=venue,date&${range}&order=${order}`, HEADERS)));
  const failed = res.find(r => !r.ok);
  if (failed) return { ok: false, error: `HTTP ${failed.status}` };
  const seen = new Map(); // `${table}|${venue}|${date}`
  res.forEach((r, i) => { for (const row of r.rows) seen.set(`${reads[i][0]}|${row.venue}|${row.date}`, { table: reads[i][0], venue: row.venue, date: row.date }); });
  const all = [...seen.values()];
  const names = new Set(all.map(s => String(s.venue || '').toUpperCase()));
  const sightings = all.filter(s => !isKnownAuVenue(s.venue)).map(s => ({ ...s, venue: normaliseVenue(s.venue) || String(s.venue || '').toUpperCase() }));
  return { ok: true, key: to, from, to, namesChecked: names.size, sightings };
}
const buildVenueCheckOnce = singleFlight(buildVenueCheck);

async function venueCheck() {
  const key = racingToday();
  const hit = venueCheckCache.get(key);
  if (hit) return hit;
  const data = await buildVenueCheckOnce();
  if (data.ok) venueCheckCache.set(data.key, data);
  return data;
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
  // Every paged read has a total order (venue, race_num, then a unique
  // tiebreak): offset paging without one can skip or repeat rows once a
  // table passes 1,000 rows for the day (race_cards / race_results on a
  // Saturday), which would show as false missing-card / overdue warnings.
  const q = (table, select, order) => fetchAllRows(`${SURL}/rest/v1/${table}?select=${select}&date=eq.${date}&order=${order}`, HEADERS);
  // scraper_health: some checks (e.g. "VENUE COMPLETENESS ... for 2026-10-24")
  // are logged under the previous race_date, so load both days and attribute
  // each row to the date its message names, else to its race_date.
  const prevDay = (() => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const [meetingsR, schedR, cardsR, resultsR, scratchR, healthR, venues] = await Promise.all([
    q('today_meetings', 'venue,state,track_condition,condition_override,is_abandoned,calendar_mismatch,created_at', 'venue,id'),
    q('race_schedule', 'venue,race_num,post_time', 'venue,race_num,post_time'),
    q('race_cards', 'venue,race_num,updated_at', 'venue,race_num,horse_name'),
    q('race_results', 'venue,race_num,scraped_at,track_cond', 'venue,race_num,id'),
    q('scratchings', 'venue,race_num,created_at', 'venue,race_num,id'),
    fetchAllRows(`${SURL}/rest/v1/scraper_health?select=venue,error_msg,created_at,race_date&race_date=in.(${prevDay},${date})&order=id`, HEADERS),
    venueCheck().catch(err => ({ ok: false, error: err.message })),
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
        scratchings: 0, lastScratching: null, scraperErrors: 0, scraperErrorTimes: [], lastScraperError: null, lastScraperMsg: null,
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
    m.scraperErrorTimes.push(r.created_at);
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

    // Status comes only from reasons that need action (lib/dataHealthStatus.mjs);
    // everything else is a muted note.
    const { status, reasons } = meetingStatus({ abandoned: m.abandoned, races, trackCondition: track, scraperErrorTimes: m.scraperErrorTimes });
    const notes = [];
    if (!isKnownAuVenue(m.venue)) notes.push('Venue not on AU allowlist (see the Unknown venue warning above)');
    if (!m.abandoned && !races.some(r => r.jump)) notes.push('No jump times (race_schedule)');
    if (!m.meetingRows) notes.push('Not in today_meetings');
    if (m.meetingRows > 1 || m.rawNames.size > 1) notes.push(`${m.meetingRows} today_meetings rows / names: ${[...m.rawNames].join(', ')}`);
    if (m.calendarMismatch) notes.push('Calendar mismatch flagged');

    return {
      venue: m.venue, state: m.state, abandoned: m.abandoned,
      status, reasons, notes,
      raceCount, cardRaces: m.cardRaces.size, jumpedCount, resultedJumped, overdueCount: overdue.length,
      trackCondition: track || null, scratchings: m.scratchings, scraperErrors: m.scraperErrors,
      lastScraperMsg: m.lastScraperMsg, lastScraperError: m.lastScraperError,
      cardsUpdated: m.cardsUpdated, lastResult: m.lastResult, lastScratching: m.lastScratching,
      races,
    };
  }).sort((a, b) => a.venue.localeCompare(b.venue));

  // Global: results-scraping circuit breaker, stale scraper, unmatched messages.
  let breaker = null;
  if (breakerTrips.length) {
    const latest = breakerTrips.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    const until = circuitBreakerUntil(latest);
    breaker = {
      trips: breakerTrips.length,
      active: !!until && until.getTime() > now,
      untilText: until ? until.toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit' }) : null,
      lastAt: latest.created_at,
    };
  }
  const lastResultAny = meetings.reduce((t, m) => maxIso(t, m.lastResult), null);
  // Abandoned meetings never count (their races are never overdue).
  const overdueTotal = meetings.reduce((t, m) => t + m.overdueCount, 0);
  const global = globalFindings({
    breaker,
    overdueTotal,
    staleMins: lastResultAny ? Math.round((now - new Date(lastResultAny).getTime()) / 60000) : null,
    lastResultAt: lastResultAny,
    unmatched: [...unmatched].map(([name, u]) => ({ name, ...u })),
  }).concat(venues.ok
    ? unknownVenueFindings(venues)
    : [{ status: 'info', text: `Venue check couldn't run (${venues.error}); unknown venues aren't being checked right now.` }]);
  const { overall, counts } = summarise(meetings, global);
  return {
    ok: true, date, generatedAt: new Date(now).toISOString(), overall, global, meetings, counts,
  };
}
