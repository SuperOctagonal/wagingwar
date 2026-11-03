// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adKeys, isTestAd } from '../lib/adKeys.mjs';

const VARIANTS = ['product15', 'qld', 'cupquest'];

test('variants first in their order, then every other ad A-Z', () => {
  const keys = ['qld', 'product19', 'cupquest', 'spring1', 'product19', null, 'product15'];
  assert.deepEqual(adKeys(keys, VARIANTS), ['product15', 'qld', 'cupquest', 'product19', 'spring1']);
});

test('variants listed even with no data yet', () => {
  assert.deepEqual(adKeys([], VARIANTS), VARIANTS);
});

test('test tags never listed: testad, testad2, any case', () => {
  assert.deepEqual(adKeys(['testad', 'testad2', 'product19', 'test-spring'], VARIANTS), [...VARIANTS, 'product19']);
  assert.deepEqual(adKeys(['testad'], ['testad']), []);
  for (const k of ['testad', 'testad2', 'TestAd3', 'TEST']) assert.equal(isTestAd(k), true, k);
  for (const k of ['product19', 'qld', 'mytest', null, undefined]) assert.equal(isTestAd(k), false, String(k));
});
