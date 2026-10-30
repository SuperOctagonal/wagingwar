// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache } from '../lib/ttlCache.mjs';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('returns fresh values, expires and deletes stale ones', async () => {
  const c = createTtlCache({ ttlMs: 30, max: 10 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  await tick(40);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 0);
});

test('never grows past max: least recently used dropped first', () => {
  const c = createTtlCache({ ttlMs: 60_000, max: 3 });
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  c.get('a');                 // a is now most recently used
  c.set('d', 4);              // over max -> drop LRU (b)
  assert.equal(c.size, 3);
  assert.equal(c.get('b'), undefined);
  assert.deepEqual([c.get('a'), c.get('c'), c.get('d')], [1, 3, 4]);
});

test('sweeps expired entries before evicting live ones', async () => {
  const c = createTtlCache({ ttlMs: 60_000, max: 2 });
  c.set('old', 1, 10);
  c.set('live', 2);
  await tick(20);
  c.set('new', 3);            // over max: expired 'old' goes, 'live' stays
  assert.deepEqual([c.get('live'), c.get('new'), c.size], [2, 3, 2]);
});

test('bounded under many distinct keys', () => {
  const c = createTtlCache({ ttlMs: 60_000, max: 100 });
  for (let i = 0; i < 10_000; i++) c.set(`k${i}`, i);
  assert.equal(c.size, 100);
  assert.equal(c.get('k9999'), 9999);
  assert.equal(c.get('k0'), undefined);
});

test('per-entry ttl override', async () => {
  const c = createTtlCache({ ttlMs: 60_000, max: 10 });
  c.set('short', 1, 10);
  await tick(20);
  assert.equal(c.get('short'), undefined);
});
