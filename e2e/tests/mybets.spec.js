const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

// Mutations go through the app's own API (the exact routes the UI itself
// calls) -- this codebase has no test ids, so driving every click with a
// guessed CSS/text selector against production would be far more brittle
// than exercising the real write path directly and then verifying the
// result renders correctly in the UI. Log Bet's own multi-step picker
// (Meeting -> Race -> Horse, backed by whichever race is actually
// scheduled today) is the one flow genuinely impractical to drive this
// way without hardcoding a venue/race that may not exist on the day this
// runs.
test('My Bets: log, edit and delete a bet', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page. Every API call below
  // uses page.request (shares this page's cookie jar), not the bare
  // `request` fixture, which never gets that refresh and 401s on
  // whatever cookie storageState captured at login time (confirmed live,
  // 2026-10-18).
  await page.goto('/mybets');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const cleanup = new Cleanup(page.request);
  const horseName = qa('Mybets Test Horse');

  try {
    // venue is a NOT NULL column on bet_log (confirmed against the live
    // schema, 2026-10-18) -- the real BetModal UI always has a race's
    // venue to send, so this wasn't caught until the e2e suite's own
    // bare-minimum payload hit the constraint directly (502 "Supabase
    // 400"). Test bug, not an app bug: match what every real caller
    // already sends.
    const createRes = await page.request.post('/api/log-bet', {
      data: { horse_name: horseName, venue: qa('Test Track'), stake: 10, odds: 2.5, bet_type: 'win', bookmaker: 'Sportsbet' },
    });
    expect(createRes.ok(), `log-bet create failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const created = await createRes.json();
    const row = Array.isArray(created) ? created[0] : created;
    expect(row?.id).toBeTruthy();
    cleanup.add('/api/bets', row.id);

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(horseName).first()).toBeVisible({ timeout: 20000 });

    const patchRes = await page.request.patch(`/api/bets?id=${row.id}`, { data: { stake: 25 } });
    expect(patchRes.ok(), `bet edit failed: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText('$25').first()).toBeVisible({ timeout: 20000 });

    const delRes = await page.request.delete(`/api/bets?id=${row.id}`);
    expect(delRes.ok(), `bet delete failed: ${delRes.status()} ${await delRes.text()}`).toBeTruthy();
    cleanup.items = []; // already deleted -- nothing left for the finally block to do

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(horseName)).toHaveCount(0);
  } finally {
    await cleanup.run();
  }
});
