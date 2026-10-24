const { test, expect } = require('@playwright/test');

// Regression coverage for the Form-tab crash (production, Kembla Grange R6,
// 24 Oct): FormCard referenced displayPrice/mobEdge/mobIsTopRated/
// isBiggestFirmer/isBiggestDrifter without ever declaring them, so React
// threw a plain ReferenceError on every render -- always, not just for that
// particular race -- and with no error boundary around the tab panels it
// took the whole page down. Fixed in app/races/page.js (FormCard) + wrapped
// each tab panel in components/TabPanelErrorBoundary.js. This test clicks
// through every tab and fails on any pageerror or console error, so a
// regression here is caught long before a user hits a blank page.

function attachCrashListeners(page, errors) {
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
}

test('Races tabs do not crash the page (desktop)', async ({ page }) => {
  const errors = [];
  attachCrashListeners(page, errors);

  await page.goto('/races');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // Wait for a race to actually be selected/loaded before touching tabs.
  await expect(page.locator('text=/\\$\\d/').first()).toBeVisible({ timeout: 20000 });

  // Sectionals is permanently locked (no content branch at all) and is a
  // no-op click by design -- included anyway since clicking it must still
  // never crash the page.
  const tabs = ['Field', 'Odds', 'Form', 'Pace Map', 'Movers', 'Value', 'Sectionals'];
  for (const label of tabs) {
    // Each tab button's accessible name leads with its icon font's glyph
    // character (the <i> isn't aria-hidden), so the label is a substring,
    // not the start of the name -- no `^` anchor.
    await page.getByRole('button', { name: new RegExp(label) }).first().click();
    await page.waitForTimeout(500);
    // The page itself (not just the clicked tab) must still be alive --
    // this is exactly what a blanked-page crash would fail.
    await expect(page.locator('body')).toBeVisible();
  }

  expect(errors, `Console/page errors while clicking tabs:\n${errors.join('\n')}`).toEqual([]);
});

test('Races mobile layers do not crash the page (375x812)', async ({ page }) => {
  const errors = [];
  attachCrashListeners(page, errors);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/races');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page.locator('text=/\\$\\d/').first()).toBeVisible({ timeout: 20000 });

  // Narrow viewports don't show the desktop ViewTabBar at all (see the
  // "Mobile section" comment in app/races/page.js) -- Field stays the only
  // top-level view, and Form/Pace map/Odds/etc. are reached instead as
  // expandable layer chips on top of it. This is the real mobile UI, not a
  // stand-in for the desktop tabs.
  const layers = ['Top picks', 'Form detail', 'Score breakdown', 'Pace map', 'Odds'];
  for (const label of layers) {
    const chip = page.getByRole('button', { name: label });
    if (await chip.count()) {
      await chip.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  }

  expect(errors, `Console/page errors while clicking mobile layers:\n${errors.join('\n')}`).toEqual([]);
});
