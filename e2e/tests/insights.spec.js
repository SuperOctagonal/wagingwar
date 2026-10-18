const { test, expect } = require('@playwright/test');

// Read-only. Just confirms the server-rendered summary actually returns
// numbers for the signed-in account, rather than an empty/error state --
// doesn't assert specific values since those depend on the test
// account's real bet history.
test('Insights tab loads numbers', async ({ page }) => {
  const res = await page.request.get('/api/insights/summary');
  expect(res.ok(), `insights/summary failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  expect(body.summary).toBeTruthy();
  expect(body.summary.hero).toBeTruthy();
  expect(typeof body.summary.hero.n).toBe('number');

  await page.goto('/mybets');
  await page.waitForLoadState('networkidle').catch(() => {});
  const insightsTab = page.getByRole('button', { name: /insights/i }).first();
  if (await insightsTab.isVisible().catch(() => false)) {
    await insightsTab.click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
});
