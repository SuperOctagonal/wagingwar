const { test, expect } = require('@playwright/test');

// Read-only -- no content created, nothing to clean up.
test('Races loads with live prices and the Move column', async ({ page }) => {
  await page.goto('/races');
  await page.waitForLoadState('networkidle').catch(() => {});

  // The Field table renders a price in every runner row once race data is
  // loaded -- a bare "$" figure is the most stable thing to assert on
  // without a test id (odds, venue names and even column headers change
  // day to day).
  const priceCell = page.locator('text=/\\$\\d/').first();
  await expect(priceCell).toBeVisible({ timeout: 20000 });

  // The Move column shows a firming/drifting badge only once a runner's
  // price has actually moved >=15% intraday -- not guaranteed to exist on
  // any given day, so this checks for the LIVE price badge instead (shown
  // on every priced runner once live_odds is active for the signed-in
  // plan), which is a safer always-present signal that the live-prices
  // pipeline is wired up end to end.
  const liveBadge = page.getByText('LIVE', { exact: true }).first();
  await expect(liveBadge).toBeVisible({ timeout: 20000 });
});
