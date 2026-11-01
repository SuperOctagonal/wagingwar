// Status rules for the admin Data health panel (lib/adminDataHealth.js).
// Warn only when something needs action; everything else is a muted note.
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/dataHealthStatus.test.mjs).
//
// Statuses: 'red' (Problem), 'amber' (Warning), 'green' (OK), 'abandoned'
// (neutral), 'info' (neutral note, global findings only -- never counted).

// A jumped race with no result this long after its jump is "overdue".
export const RESULT_GRACE_MIN = 45;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const raceList = races => `R${races.map(r => r.raceNum).join(', R')}`;

// One meeting. races: [{ raceNum, jump (ISO or null), jumped, hasResult,
// hasCard, overdue }]. A meeting is a Warning only with real impact:
//   - a result overdue (jumped > RESULT_GRACE_MIN ago, no result);
//   - no card for a scheduled race (one with a jump time);
//   - no track condition once the first race has jumped;
//   - scraper errors logged after the jump of the earliest race still
//     waiting for a result (errors from before that jump, e.g. morning bot
//     challenges, say nothing about that result).
// Scraper errors on their own are a muted count, not a status. Abandoned
// meetings are neutral and their errors don't count.
// scraperErrorTimes: ISO times of this meeting's scraper errors.
export function meetingStatus({ abandoned, races, trackCondition, scraperErrorTimes = [] }) {
  if (abandoned) return { status: 'abandoned', reasons: [] };
  const reasons = [];
  const overdue = races.filter(r => r.overdue);
  if (overdue.length) reasons.push(`${plural(overdue.length, 'race')} missing results after ${RESULT_GRACE_MIN} min (${raceList(overdue)})`);
  const scheduled = races.filter(r => r.jump);
  const noCard = scheduled.filter(r => !r.hasCard);
  if (noCard.length) {
    reasons.push(noCard.length === scheduled.length
      ? `No race cards for any of the ${plural(scheduled.length, 'scheduled race')}`
      : `No race card for ${raceList(noCard)}`);
  }
  const jumped = races.filter(r => r.jumped);
  if (jumped.length && !trackCondition) reasons.push('No track condition after the first race jumped');
  const waiting = jumped.filter(r => !r.hasResult);
  if (waiting.length) {
    // A waiting race with no jump time (past date, known only from cards)
    // gives no cut-off, so every error counts.
    const since = waiting.some(r => !r.jump) ? -Infinity : Math.min(...waiting.map(r => new Date(r.jump).getTime()));
    const after = scraperErrorTimes.filter(t => new Date(t).getTime() > since).length;
    if (after) reasons.push(`${plural(after, 'scraper error')} since ${raceList(waiting.slice(0, 1))} jumped, while ${raceList(waiting)} ${waiting.length === 1 ? 'has' : 'have'} no result yet`);
  }
  return { status: reasons.length ? 'amber' : 'green', reasons };
}

// Global findings for the banner.
//   breaker: null, or { trips, active, untilText } for the results-scraping
//            circuit breaker (paused now = active).
//   overdueTotal: overdue races across non-abandoned meetings.
//   staleMins: minutes since the last scraped result, or null.
//   unmatched: [{ name, n, msg, last }] scraper messages not tied to a meeting.
// A red Problem only when the breaker is paused or has tripped AND a jumped
// race is overdue; otherwise the breaker is neutral info.
export function globalFindings({ breaker, overdueTotal, staleMins, lastResultAt, unmatched = [] }) {
  const out = [];
  const overdueText = `${plural(overdueTotal, 'race')} overdue`;
  if (breaker) {
    const tripped = `Circuit breaker tripped ${breaker.trips}× this day (bot challenges).`;
    if (overdueTotal) {
      out.push({
        status: 'red',
        text: breaker.active
          ? `Results scraping paused until ${breaker.untilText} AEST while ${overdueText}. ${tripped}`
          : `Results scraping was paused and ${overdueText}. ${tripped}`,
        lastAt: breaker.lastAt,
      });
    } else {
      out.push({
        status: 'info',
        text: breaker.active
          ? `Results scraping paused until ${breaker.untilText} AEST, nothing overdue. ${tripped}`
          : `Results scraping not paused now, nothing overdue. ${tripped}`,
        lastAt: breaker.lastAt,
      });
    }
  }
  if (overdueTotal && staleMins != null && staleMins > RESULT_GRACE_MIN && !(breaker && overdueTotal)) {
    out.push({ status: 'amber', text: `No new results scraped for ${staleMins} min while ${overdueText}.`, lastAt: lastResultAt });
  }
  for (const u of unmatched) {
    out.push({ status: 'info', text: `Scraper message${u.n === 1 ? '' : 's'} not tied to a meeting on this date — ${u.name} (${u.n}×): ${(u.msg || '').slice(0, 160)}`, lastAt: u.last });
  }
  return out;
}

// Banner status and summary counts. Info findings never count.
export function summarise(meetings, global) {
  const counts = {
    red: global.filter(g => g.status === 'red').length,
    amber: meetings.filter(m => m.status === 'amber').length + global.filter(g => g.status === 'amber').length,
    green: meetings.filter(m => m.status === 'green').length,
    abandoned: meetings.filter(m => m.status === 'abandoned').length,
  };
  const overall = counts.red ? 'red' : counts.amber ? 'amber' : meetings.length ? 'green' : null;
  return { overall, counts };
}
