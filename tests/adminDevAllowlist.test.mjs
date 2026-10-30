// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devSiteAdminIds } from '../lib/adminDevAllowlist.mjs';

const IDS = 'user_dev1, user_dev2';

test('dev key + non-production: allowlist applies', () => {
  assert.deepEqual(
    devSiteAdminIds({ NODE_ENV: 'development', CLERK_SECRET_KEY: 'sk_test_abc', DEV_SITE_ADMIN_IDS: IDS }),
    ['user_dev1', 'user_dev2'],
  );
});

test('live key is ignored, even outside production', () => {
  assert.deepEqual(
    devSiteAdminIds({ NODE_ENV: 'development', CLERK_SECRET_KEY: 'sk_live_abc', DEV_SITE_ADMIN_IDS: IDS }),
    [],
  );
});

test('live key in production is ignored', () => {
  assert.deepEqual(
    devSiteAdminIds({ NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_live_abc', DEV_SITE_ADMIN_IDS: IDS }),
    [],
  );
});

test('dev key in a production build is ignored', () => {
  assert.deepEqual(
    devSiteAdminIds({ NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_abc', DEV_SITE_ADMIN_IDS: IDS }),
    [],
  );
});

test('missing or malformed key is ignored', () => {
  assert.deepEqual(devSiteAdminIds({ NODE_ENV: 'development', DEV_SITE_ADMIN_IDS: IDS }), []);
  assert.deepEqual(devSiteAdminIds({ NODE_ENV: 'development', CLERK_SECRET_KEY: 'xsk_test_abc', DEV_SITE_ADMIN_IDS: IDS }), []);
});

test('no ids configured: empty', () => {
  assert.deepEqual(devSiteAdminIds({ NODE_ENV: 'development', CLERK_SECRET_KEY: 'sk_test_abc' }), []);
});
