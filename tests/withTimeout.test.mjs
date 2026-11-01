// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TimeoutError } from '../lib/withTimeout.mjs';

test('resolves with the value when the source answers in time', async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 50, 'Clerk'), 42);
});

test('passes through the source error', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('401')), 50, 'Stripe'), /401/);
});

test('rejects with a plain-words TimeoutError when the source is slow', async () => {
  const slow = new Promise(r => setTimeout(() => r('late'), 200));
  await assert.rejects(withTimeout(slow, 20, 'Clerk'), e => e instanceof TimeoutError && /Clerk did not respond within 0s/.test(e.message));
});
