// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowWelcome, dismissedState, closedState, NEW_USER_MS, REMIND_AFTER_MS } from '../lib/welcomeCard.mjs';

const NOW = Date.parse('2026-11-04T10:00:00Z');
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const show = (o) => shouldShowWelcome({ now: NOW, ...o });

test('constants: 24 hours new, 7 days reminder', () => {
  assert.equal(NEW_USER_MS, DAY);
  assert.equal(REMIND_AFTER_MS, 7 * DAY);
});

test('never dismissed: no username, or signed up in the last 24h', () => {
  assert.equal(show({ hasUsername: false, createdAt: NOW - 400 * DAY }), true);
  assert.equal(show({ hasUsername: false, createdAt: NOW - HOUR }), true);
  assert.equal(show({ hasUsername: true, createdAt: new Date(NOW - 2 * HOUR) }), true);
  assert.equal(show({ hasUsername: true, createdAt: NOW - DAY - 1 }), false);
  assert.equal(show({ hasUsername: true, createdAt: NOW - 400 * DAY }), false);
  assert.equal(show({ hasUsername: true, createdAt: null }), false);
  assert.equal(show({ hasUsername: true, createdAt: NOW - HOUR, state: 'junk' }), true);
});

test('dismissed once: back once after 7 days, only with no username', () => {
  const d1 = dismissedState(undefined, NOW);
  assert.deepEqual(d1, { dismissals: 1, lastDismissedAt: '2026-11-04T10:00:00.000Z' });
  assert.equal(show({ hasUsername: false, createdAt: NOW - HOUR, state: d1 }), false);
  assert.equal(shouldShowWelcome({ hasUsername: false, createdAt: NOW, state: d1, now: NOW + 7 * DAY - 1 }), false);
  assert.equal(shouldShowWelcome({ hasUsername: false, createdAt: NOW, state: d1, now: NOW + 7 * DAY }), true);
  assert.equal(shouldShowWelcome({ hasUsername: true, createdAt: NOW, state: d1, now: NOW + 30 * DAY }), false);
  assert.equal(shouldShowWelcome({ hasUsername: false, createdAt: NOW, state: { dismissals: 1 }, now: NOW + 30 * DAY }), false);
});

test('dismissed twice: never again', () => {
  const d2 = dismissedState(dismissedState(undefined, NOW), NOW + 8 * DAY);
  assert.equal(d2.dismissals, 2);
  assert.equal(shouldShowWelcome({ hasUsername: false, createdAt: NOW, state: d2, now: NOW + 400 * DAY }), false);
});

test('username saved from the card: closed for good, other fields kept', () => {
  const c = closedState({ dismissals: 1, lastDismissedAt: 'x' }, NOW);
  assert.deepEqual(c, { dismissals: 1, lastDismissedAt: 'x', closedAt: '2026-11-04T10:00:00.000Z' });
  assert.equal(show({ hasUsername: false, createdAt: NOW - HOUR, state: closedState(undefined, NOW) }), false);
  assert.equal(show({ hasUsername: true, createdAt: NOW - HOUR, state: closedState(undefined, NOW) }), false);
});
