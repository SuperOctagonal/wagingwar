// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingStatus, globalFindings, summarise, unknownVenueFindings } from '../lib/dataHealthStatus.mjs';

const race = (raceNum, o = {}) => ({ raceNum, jump: '2026-11-01T02:00:00.000Z', jumped: false, hasResult: false, hasCard: true, overdue: false, ...o });
const preRace = [race(1), race(2), race(3)];
const errsAt = (...isos) => isos;
const breakerPaused = { trips: 1, active: true, untilText: '08:36', lastAt: '2026-11-01T22:00:00Z' };

test('before any race jumps: scraper errors + paused breaker -> OK meetings, info banner, nothing counted', () => {
  const m = meetingStatus({ abandoned: false, races: preRace, trackCondition: null, scraperErrorTimes: errsAt('2026-10-31T19:00:00Z', '2026-10-31T20:00:00Z') });
  assert.equal(m.status, 'green');
  assert.deepEqual(m.reasons, []);
  const g = globalFindings({ breaker: breakerPaused, overdueTotal: 0, staleMins: null });
  assert.equal(g.length, 1);
  assert.equal(g[0].status, 'info');
  assert.match(g[0].text, /Results scraping paused until 08:36 AEST, nothing overdue/);
  const s = summarise([{ ...m }, { ...m }], g);
  assert.equal(s.overall, 'green');
  assert.deepEqual(s.counts, { red: 0, amber: 0, green: 2, abandoned: 0 });
});

test('overdue result -> Warning with reason; breaker paused + overdue -> Problem with reason', () => {
  const races = [race(1, { jumped: true, hasResult: false, overdue: true }), race(2, { jumped: true, hasResult: true }), race(3)];
  const m = meetingStatus({ abandoned: false, races, trackCondition: 'Good 4' });
  assert.equal(m.status, 'amber');
  assert.deepEqual(m.reasons, ['1 race missing results after 45 min (R1)']);
  const g = globalFindings({ breaker: breakerPaused, overdueTotal: 1, staleMins: 60 });
  assert.equal(g[0].status, 'red');
  assert.match(g[0].text, /paused until 08:36 AEST while 1 race overdue/);
  assert.equal(g.filter(x => x.status === 'amber').length, 0, 'stale-scraper warning not repeated alongside the breaker problem');
  const s = summarise([m], g);
  assert.equal(s.overall, 'red');
  assert.deepEqual(s.counts, { red: 1, amber: 1, green: 0, abandoned: 0 });
});

test('overdue without the breaker: Warning, plus a stale-scraper warning when no results for 45+ min', () => {
  const g = globalFindings({ breaker: null, overdueTotal: 2, staleMins: 70 });
  assert.equal(g.length, 1);
  assert.equal(g[0].status, 'amber');
  assert.match(g[0].text, /No new results scraped for 70 min while 2 races overdue/);
});

test('breaker tripped earlier, not paused, nothing overdue -> info only', () => {
  const g = globalFindings({ breaker: { ...breakerPaused, active: false }, overdueTotal: 0, staleMins: 5 });
  assert.equal(g.length, 1);
  assert.equal(g[0].status, 'info');
  assert.match(g[0].text, /Results scraping not paused now, nothing overdue\. Circuit breaker tripped 1× this day/);
});

// Nowra, 1 Nov: 9 bot-challenge errors 04:00-08:00 AEST, R1 jumps 11:30 AEST, no result yet.
const nowraErrs = Array.from({ length: 9 }, (_, i) => new Date(Date.UTC(2026, 9, 31, 18) + i * 27 * 60000).toISOString()); // 04:00-07:36 AEST
const nowraR1 = race(1, { jump: '2026-11-01T01:30:00.000Z', jumped: true, hasResult: false });

test('Nowra: 9 errors 04:00-08:00, R1 jumped 11:30 with no result yet -> OK (errors were before the jump)', () => {
  const m = meetingStatus({ abandoned: false, races: [nowraR1, race(2)], trackCondition: 'Good 4', scraperErrorTimes: nowraErrs });
  assert.equal(m.status, 'green');
  assert.deepEqual(m.reasons, []);
});

test('errors after the earliest waiting jump, R1 still unresulted -> Warning with reason', () => {
  const after = [...nowraErrs, '2026-11-01T01:38:00.000Z', '2026-11-01T01:45:00.000Z'];
  const m = meetingStatus({ abandoned: false, races: [nowraR1, race(2)], trackCondition: 'Good 4', scraperErrorTimes: after });
  assert.equal(m.status, 'amber');
  assert.deepEqual(m.reasons, ['2 scraper errors since R1 jumped, while R1 has no result yet']);
});

test('scraper errors with every jumped race resulted -> OK (muted count only)', () => {
  const races = [race(1, { jumped: true, hasResult: true }), race(2)];
  assert.equal(meetingStatus({ abandoned: false, races, trackCondition: 'Soft 5', scraperErrorTimes: errsAt('2026-11-01T03:00:00Z') }).status, 'green');
});

test('abandoned meeting -> neutral, never Warning, errors and overdue ignored', () => {
  const races = [race(1, { jumped: true, overdue: true })];
  const m = meetingStatus({ abandoned: true, races, trackCondition: null, scraperErrorTimes: errsAt('2026-11-01T03:00:00Z') });
  assert.equal(m.status, 'abandoned');
  assert.deepEqual(summarise([m], []).counts, { red: 0, amber: 0, green: 0, abandoned: 1 });
});

test('cards missing for scheduled races -> Warning naming them', () => {
  const some = meetingStatus({ abandoned: false, races: [race(1), race(2, { hasCard: false }), race(3, { hasCard: false })], trackCondition: null });
  assert.deepEqual(some.reasons, ['No race card for R2, R3']);
  const none = meetingStatus({ abandoned: false, races: [race(1, { hasCard: false }), race(2, { hasCard: false })], trackCondition: null });
  assert.deepEqual(none.reasons, ['No race cards for any of the 2 scheduled races']);
  // a race known only from results (no jump time) isn't "scheduled"
  assert.equal(meetingStatus({ abandoned: false, races: [race(1), race(9, { jump: null, hasCard: false })], trackCondition: null }).status, 'green');
});

test('no track condition: fine before the first jump, Warning after it', () => {
  assert.equal(meetingStatus({ abandoned: false, races: preRace, trackCondition: null }).status, 'green');
  const after = meetingStatus({ abandoned: false, races: [race(1, { jumped: true, hasResult: true }), race(2)], trackCondition: null });
  assert.deepEqual(after.reasons, ['No track condition after the first race jumped']);
});

test('past day with complete results -> all OK', () => {
  const races = [1, 2, 3, 4].map(n => race(n, { jumped: true, hasResult: true }));
  const m = meetingStatus({ abandoned: false, races, trackCondition: 'Good 4', scraperErrorTimes: errsAt('2026-11-01T03:00:00Z') });
  const s = summarise([m, m], globalFindings({ breaker: null, overdueTotal: 0, staleMins: 900 }));
  assert.equal(s.overall, 'green');
  assert.deepEqual(s.counts, { red: 0, amber: 0, green: 2, abandoned: 0 });
});

test('unknown venue seen in the last 7 days -> one Warning per venue naming dates and tables, counted', () => {
  const g = unknownVenueFindings({
    from: '2026-10-25', to: '2026-11-01', namesChecked: 40,
    sightings: [
      { venue: 'MORTLAKE', date: '2026-10-31', table: 'race_cards' },
      { venue: 'MORTLAKE', date: '2026-10-31', table: 'race_results' },
      { venue: 'TUMUT', date: '2026-10-31', table: 'race_results' },
      { venue: 'MORTLAKE', date: '2026-10-26', table: 'race_schedule' },
    ],
  });
  assert.equal(g.length, 2);
  assert.ok(g.every(x => x.status === 'amber'));
  assert.match(g[0].text, /^Unknown venue MORTLAKE on 26 Oct, 31 Oct \(race_cards, race_results, race_schedule\): not on the AU venue list/);
  assert.match(g[1].text, /^Unknown venue TUMUT on 31 Oct \(race_results\)/);
  const m = meetingStatus({ abandoned: false, races: [race(1, { jumped: true, hasResult: true })], trackCondition: 'Good 4' });
  const s = summarise([m], g);
  assert.equal(s.overall, 'amber');
  assert.equal(s.counts.amber, 2);
});

test('no unknown venues -> one info line confirming the check, nothing counted', () => {
  const g = unknownVenueFindings({ from: '2026-10-25', to: '2026-11-01', namesChecked: 41, sightings: [] });
  assert.deepEqual(g.map(x => x.status), ['info']);
  assert.match(g[0].text, /Venue check: all 41 venue names .* 25 Oct–1 Nov are on the AU venue list/);
  assert.equal(summarise([], g).counts.amber, 0);
});
