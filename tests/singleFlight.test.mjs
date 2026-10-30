// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight } from '../lib/singleFlight.mjs';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('concurrent calls run the function once and share the result', async () => {
  let runs = 0;
  const f = singleFlight(async () => { runs++; await tick(20); return { n: runs }; });
  const results = await Promise.all([f(), f(), f(), f()]);
  assert.equal(runs, 1);
  assert.ok(results.every((r) => r === results[0]));
});

test('a call after the previous run settled starts a new run', async () => {
  let runs = 0;
  const f = singleFlight(async () => { runs++; await tick(5); return runs; });
  assert.equal(await f(), 1);
  assert.equal(await f(), 2);
});

test('a failure is shared by concurrent callers, then the next call retries', async () => {
  let runs = 0;
  const f = singleFlight(async () => { runs++; await tick(5); if (runs === 1) throw new Error('boom'); return 'ok'; });
  const settled = await Promise.allSettled([f(), f()]);
  assert.equal(runs, 1);
  assert.ok(settled.every((s) => s.status === 'rejected' && s.reason.message === 'boom'));
  assert.equal(await f(), 'ok');
  assert.equal(runs, 2);
});
