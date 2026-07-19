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

// Offset (minutes) between UTC and Australia/Brisbane at a given instant, derived
// via Intl rather than hardcoded — Brisbane doesn't observe daylight saving, but
// other states supplying race times do, so we never assume a fixed +10:00.
export function brisbaneOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Brisbane', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
  const hour = +parts.hour === 24 ? 0 : +parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function brisbaneDateTimeToInstant(dateISO, timeStr) {
  const parsed = parseTimeStr(timeStr);
  if (!parsed || !dateISO) return null;
  const [y, mo, d] = dateISO.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const naiveUTC = Date.UTC(y, mo - 1, d, parsed.h, parsed.m, 0);
  const offsetMin = brisbaneOffsetMinutes(new Date(naiveUTC));
  return new Date(naiveUTC - offsetMin * 60000);
}

export function brisbaneTodayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// True only when we can positively confirm the race has jumped — unknown/unparseable
// dates or times fail open (returns false) rather than blocking on missing data.
export function hasRaceJumped(dateISO, timeStr) {
  const raceInstant = brisbaneDateTimeToInstant(dateISO, timeStr);
  if (!raceInstant) return false;
  return raceInstant.getTime() <= Date.now();
}
