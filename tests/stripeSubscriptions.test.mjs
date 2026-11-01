// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBillingIso, matchSubscriptions } from '../lib/stripeSubscriptions.mjs';

const T = 1798761600; // 2027-01-01T00:00:00Z

test('next billing: item period end (current API) wins, subscription field is the fallback', () => {
  assert.equal(nextBillingIso({ items: { data: [{ current_period_end: T }] } }), '2027-01-01T00:00:00.000Z');
  assert.equal(nextBillingIso({ current_period_end: T, items: { data: [{}] } }), '2027-01-01T00:00:00.000Z');
  assert.equal(nextBillingIso({ current_period_end: 1, items: { data: [{ current_period_end: T }] } }), '2027-01-01T00:00:00.000Z');
});

test('next billing: missing or malformed -> null (blank), never throws', () => {
  for (const sub of [null, undefined, {}, { items: null }, { items: { data: [] } }, { current_period_end: 'soon' },
    { current_period_end: -5 }, { current_period_end: 1e20 }, { items: { data: [{ current_period_end: NaN }] } }]) {
    assert.equal(nextBillingIso(sub), null, JSON.stringify(sub));
  }
  const trap = { get items() { throw new Error('boom'); } };
  assert.equal(nextBillingIso(trap), null);
});

test('matching: by customer id, then by email; unmatched counted, active ones separately', () => {
  const users = [
    { id: 'u1', stripeCustomerId: 'cus_1', email: 'a@x.com' },
    { id: 'u2', stripeCustomerId: null, email: 'B@x.com' },
  ];
  const subs = [
    { id: 's1', customer: 'cus_1', status: 'active', created: 1 },
    { id: 's2', customer: { id: 'cus_2', email: 'b@X.com' }, status: 'trialing', created: 2 },
    { id: 's3', customer: { id: 'cus_9', email: 'nobody@x.com' }, status: 'active', created: 3 },
    { id: 's4', customer: 'cus_8', status: 'canceled', created: 4 },
  ];
  const { subByUserId, unmatched } = matchSubscriptions(users, subs);
  assert.equal(subByUserId.get('u1').id, 's1');
  assert.equal(subByUserId.get('u2').id, 's2');
  assert.deepEqual(unmatched, { total: 2, active: 1 });
});

test('matching: one subscription per user, active beats newer cancelled', () => {
  const users = [{ id: 'u1', stripeCustomerId: 'cus_1', email: null }];
  const { subByUserId, unmatched } = matchSubscriptions(users, [
    { id: 'old', customer: 'cus_1', status: 'active', created: 1 },
    { id: 'new', customer: 'cus_1', status: 'canceled', created: 9 },
  ]);
  assert.equal(subByUserId.get('u1').id, 'old');
  assert.deepEqual(unmatched, { total: 0, active: 0 });
});
