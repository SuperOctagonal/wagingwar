// Timezone-aware race jump-time helpers, shared between the server-side
// jump-time gate (app/api/log-bet/route.js) and any client-side edit locks
// that need the same notion of "has this race already jumped".

export function parseTimeStr(timeStr) {
  if (!timeStr) return null;
  const t = timeStr.trim().replace(/\./g, ':');
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  let h, m;
  if (ampm) {
    h = parseInt(ampm[1], 10);
    m = parseInt(ampm[2], 10);
    if (/pm/i.test(ampm[3]) && h !== 12) h += 12;
    if (/am/i.test(ampm[3]) && h === 12) h = 0;
  } else {
    const plain = t.match(/^(\d{1,2}):(\d{2})/);
    if (!plain) return null;
    h = parseInt(plain[1], 10);
    m = parseInt(plain[2], 10);
  }
  return { h, m };
}

// Offset (minutes) between UTC and the given IANA zone at a given instant,
// derived via Intl rather than hardcoded -- generic so both the Sydney and
// Brisbane helpers below share one implementation.
export function offsetMinutesForZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  const hour = +parts.hour === 24 ? 0 : +parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

function zonedDateTimeToInstant(dateISO, timeStr, timeZone) {
  const parsed = parseTimeStr(timeStr);
  if (!parsed || !dateISO) return null;
  const [y, mo, d] = dateISO.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const naiveUTC = Date.UTC(y, mo - 1, d, parsed.h, parsed.m, 0);
  const offsetMin = offsetMinutesForZone(new Date(naiveUTC), timeZone);
  return new Date(naiveUTC - offsetMin * 60000);
}

// Ground truth (verified against live odds data, 2026-10-05): race_schedule
// post_time strings like "01.46 pm" are Australia/Sydney CLOCK time for
// every venue, including QLD/SA -- not Brisbane/AEST, and not venue-local.
// This is now the one function that should be used to turn a post_time
// string into a real instant.
export function sydneyOffsetMinutes(date) {
  return offsetMinutesForZone(date, 'Australia/Sydney');
}

export function sydneyDateTimeToInstant(dateISO, timeStr) {
  return zonedDateTimeToInstant(dateISO, timeStr, 'Australia/Sydney');
}

// Deprecated -- post_time is Sydney-clock, not Brisbane-clock (see above).
// Sydney observes daylight saving and Brisbane doesn't, so this was wrong by
// exactly one hour for every race while Sydney is on AEDT (every AU summer).
// Kept only so any code this audit missed doesn't hard-crash; use
// sydneyDateTimeToInstant/sydneyOffsetMinutes instead.
export function brisbaneOffsetMinutes(date) {
  return offsetMinutesForZone(date, 'Australia/Brisbane');
}

export function brisbaneDateTimeToInstant(dateISO, timeStr) {
  return zonedDateTimeToInstant(dateISO, timeStr, 'Australia/Brisbane');
}

export function brisbaneTodayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// True only when we can positively confirm the race has jumped — unknown/unparseable
// dates or times fail open (returns false) rather than blocking on missing data.
export function hasRaceJumped(dateISO, timeStr) {
  const raceInstant = sydneyDateTimeToInstant(dateISO, timeStr);
  if (!raceInstant) return false;
  return raceInstant.getTime() <= Date.now();
}

// DISPLAY helper: formats a post_time string in the VIEWER's own local
// timezone (not Sydney, not Brisbane) with a short zone label, e.g.
// "12:46 pm AEST" for a Brisbane viewer or "1:46 pm AEDT" for a Sydney
// viewer looking at the exact same race. Must be called client-side only
// (no timeZone override -- relies on the runtime's own local zone), since
// Render's server timezone differs from the browser's; callers should
// render a neutral placeholder (or the raw string) during SSR and swap to
// this after mount, or use suppressHydrationWarning on the text node.
// showZone: false omits the trailing zone abbreviation (e.g. for a table
// column too narrow to fit "1:26 pm AEST" next to its own countdown
// column -- see components/RaceTimeLocal.js's showZone prop) -- the
// caller is then expected to show the zone once elsewhere (a panel header
// or tooltip), not per-row.
export function formatRaceTimeViewerLocal(dateISO, timeStr, showZone = true) {
  const instant = sydneyDateTimeToInstant(dateISO, timeStr);
  if (!instant) return null;
  try {
    const hm = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).format(instant);
    if (!showZone) return hm;
    const parts = new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).formatToParts(instant);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return tz ? `${hm} ${tz}` : hm;
  } catch {
    return null;
  }
}

// The viewer's own current short zone abbreviation (e.g. "AEST"/"AEDT"),
// with no race time involved -- for a panel header/tooltip that shows the
// zone once rather than repeating it on every row. Must be called
// client-side only, same reasoning as formatRaceTimeViewerLocal.
export function viewerTimeZoneLabel() {
  try {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZoneName: 'short', hour: 'numeric' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}
