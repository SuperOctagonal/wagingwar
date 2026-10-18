const { test, expect } = require('@playwright/test');

// Read-only. Just confirms the server-rendered summary actually returns
// numbers for the signed-in account, rather than an empty/error state --
// doesn't assert specific values since those depend on the test
// account's real bet history.
test('Insights tab loads numbers', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page; page.request shares
  // this page's cookie jar, so the API call below benefits from that
  // refresh only once a page has actually loaded here (confirmed live,
  // 2026-10-18: calling page.request before any navigation still 401s).
  await page.goto('/mybets');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const res = await page.request.get('/api/insights/summary');
  expect(res.ok(), `insights/summary failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  // The route spreads the summary's fields directly onto the response
  // (plus dateRange) rather than nesting them under a `summary` key --
  // confirmed by reading app/api/insights/summary/route.js's final
  // `NextResponse.json({ ...summary, dateRange })`.
  expect(body.hero).toBeTruthy();
  expect(typeof body.hero.n).toBe('number');

  const insightsTab = page.getByRole('button', { name: /insights/i }).first();
  if (await insightsTab.isVisible().catch(() => false)) {
    await insightsTab.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
});
