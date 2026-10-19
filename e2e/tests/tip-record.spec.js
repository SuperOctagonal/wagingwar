const { test, expect } = require('@playwright/test');

// Public page, no auth -- deliberately overrides the suite's logged-in
// storageState so this exercises the real signed-out experience, same as
// api-auth.spec.js's "signed out" block.
test.use({ storageState: { cookies: [], origins: [] } });

test('Tip Record loads logged out', async ({ page }) => {
  await page.goto('/tip-record');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: 'Tip Record' })).toBeVisible({ timeout: 20000 });
});

test('Headline numbers match the API', async ({ page }) => {
  const res = await page.request.get('/api/tip-record');
  expect(res.ok(), `tip-record API failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.rows)).toBeTruthy();
  expect(body.meta.settled).toBe(body.rows.length);

  // Unfiltered (default view = every settled top pick) bets count on the
  // page must equal the API's own settled count -- the one figure both
  // sides can agree on without re-deriving the win/units aggregation
  // client-side in the test itself.
  await page.goto('/tip-record');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // getByText(..., {exact:true}) -- a plain `text=BETS` locator also
  // matches any ancestor whose combined descendant text happens to
  // include "BETS" (e.g. the whole stat grid), not just the label itself,
  // and fails Playwright's strict mode with 2+ matches.
  const betsValue = page.getByText('BETS', { exact: true }).locator('xpath=preceding-sibling::div[1]');
  await expect(betsValue).toBeVisible({ timeout: 20000 });
  const shown = (await betsValue.innerText()).replace(/[^\d]/g, '');
  expect(Number(shown)).toBe(body.meta.settled);
});

test('Changing a filter changes the bet count', async ({ page }) => {
  await page.goto('/tip-record');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const betsValue = page.getByText('BETS', { exact: true }).locator('xpath=preceding-sibling::div[1]');
  await expect(betsValue).toBeVisible({ timeout: 20000 });
  const before = (await betsValue.innerText()).replace(/[^\d]/g, '');

  await page.getByLabel('State').selectOption('VIC');
  await expect(async () => {
    const after = (await betsValue.innerText()).replace(/[^\d]/g, '');
    expect(after).not.toBe(before);
  }).toPass({ timeout: 10000 });
});

test('No horizontal page scroll at 375x812', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tip-record');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page.getByRole('heading', { name: 'Tip Record' })).toBeVisible({ timeout: 20000 });
  // TopNav's mobile/narrow layout is decided by a useEffect (it measures
  // window width after mount, defaulting to the full desktop nav on first
  // paint) -- retried rather than a single snapshot, so this doesn't race
  // that effect and flag a false positive on a frame that hasn't settled
  // yet.
  await expect(async () => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: sub-pixel rounding
  }).toPass({ timeout: 10000 });
});

test('API response has no fields outside the documented shape', async ({ page }) => {
  const res = await page.request.get('/api/tip-record');
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(['meta', 'rows']);
  expect(Object.keys(body.meta).sort()).toEqual(['excluded', 'results_to', 'settled']);
  expect(Object.keys(body.meta.excluded).sort()).toEqual(['abandoned', 'no_result', 'scratched', 'total']);
  if (body.rows.length) {
    expect(body.rows[0]).toHaveLength(13); // date, venue, state, race, horse, score, ww_price, market_price, sp, finish_pos, field_size, edge_pct, field_rank
  }
});
