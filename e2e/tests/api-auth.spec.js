const { test, expect } = require('@playwright/test');

// Every write route this session's security work added or touched.
// Extend this list whenever a new write route is added under app/api.
const WRITE_ROUTES = [
  { method: 'post', path: '/api/log-bet' },
  { method: 'patch', path: '/api/bets?id=1' },
  { method: 'delete', path: '/api/bets?id=1' },
  { method: 'post', path: '/api/blackbook' },
  { method: 'patch', path: '/api/blackbook?id=00000000-0000-0000-0000-000000000000' },
  { method: 'delete', path: '/api/blackbook?id=00000000-0000-0000-0000-000000000000' },
  { method: 'post', path: '/api/bookmaker-transactions' },
  { method: 'delete', path: '/api/bookmaker-transactions?id=1' },
  { method: 'post', path: '/api/community/post' },
  { method: 'delete', path: '/api/community/post?id=00000000-0000-0000-0000-000000000000' },
  { method: 'post', path: '/api/community/reply' },
  { method: 'delete', path: '/api/community/reply?id=00000000-0000-0000-0000-000000000000' },
  { method: 'post', path: '/api/community/vote' },
  { method: 'delete', path: '/api/community/vote?targetType=post&targetId=00000000-0000-0000-0000-000000000000' },
  { method: 'post', path: '/api/competitions/picks' },
  { method: 'delete', path: '/api/competitions/picks?id=1' },
  { method: 'put', path: '/api/settings' },
  { method: 'patch', path: '/api/profile/me' },
];

test.describe('signed out', () => {
  // Overrides the config's logged-in storageState with a clean, cookie-
  // less context for this describe block only.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { method, path } of WRITE_ROUTES) {
    test(`${method.toUpperCase()} ${path} requires auth`, async ({ request }) => {
      const res = await request[method](path, { data: {} });
      expect(res.status(), `${method.toUpperCase()} ${path} returned ${res.status()}, expected 401`).toBe(401);
    });
  }
});

test.describe('signed in, wrong/unowned id', () => {
  // These use a syntactically valid but non-existent id. The ownership
  // filter (id/post_id AND clerk_id) in every route makes "belongs to
  // someone else" and "doesn't exist at all" behave identically --
  // neither matches the signed-in user's own rows, so both paths are
  // exercised by the same request. A genuine second-account 403 (community
  // post/reply ownership check fires only once a row is actually found)
  // would need a real second test account's content id, which this suite
  // doesn't have -- not covered here.
  const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
  const FAKE_BIGINT = '999999999';

  test('PATCH/DELETE on an unowned bet returns 404 and changes nothing', async ({ request }) => {
    const patchRes = await request.patch(`/api/bets?id=${FAKE_BIGINT}`, { data: { stake: 1 } });
    expect(patchRes.status()).toBe(404);
    const delRes = await request.delete(`/api/bets?id=${FAKE_BIGINT}`);
    expect(delRes.status()).toBe(404);
  });

  test('PATCH/DELETE on an unowned blackbook row returns 404', async ({ request }) => {
    const patchRes = await request.patch(`/api/blackbook?id=${FAKE_UUID}`, { data: { note: 'x' } });
    expect(patchRes.status()).toBe(404);
    const delRes = await request.delete(`/api/blackbook?id=${FAKE_UUID}`);
    expect(delRes.status()).toBe(404);
  });

  test('DELETE on a non-existent community post/reply returns 404', async ({ request }) => {
    const postRes = await request.delete(`/api/community/post?id=${FAKE_UUID}`);
    expect(postRes.status()).toBe(404);
    const replyRes = await request.delete(`/api/community/reply?id=${FAKE_UUID}`);
    expect(replyRes.status()).toBe(404);
  });

  test('DELETE on an unowned comp_picks row returns 404', async ({ request }) => {
    const res = await request.delete(`/api/competitions/picks?id=${FAKE_BIGINT}`);
    expect(res.status()).toBe(404);
  });
});
