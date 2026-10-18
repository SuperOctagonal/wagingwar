const { test, expect } = require('@playwright/test');

// user_settings stores one JSONB blob per user and PUT replaces it
// wholesale (not a merge) -- this test reads the real current settings
// first and restores them exactly afterward, rather than deleting
// anything (there's nothing to delete: it's the account's one settings
// row, not a created test row).
test('Settings: save and reload', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page; page.request (used
  // throughout below, not the bare `request` fixture) shares this
  // page's cookie jar, so it benefits from that refresh (confirmed
  // live, 2026-10-18).
  await page.goto('/settings');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const getRes = await page.request.get('/api/settings');
  expect(getRes.ok(), `settings GET failed: ${getRes.status()} ${await getRes.text()}`).toBeTruthy();
  const rows = await getRes.json();
  const originalSettings = rows?.[0]?.settings || {};

  // A sentinel value unlikely to collide with anything real, on a field
  // (stakingAlert) that's purely informational -- it changes what the
  // Log Bet form warns about, nothing else.
  const testValue = '987';
  try {
    const putRes = await page.request.put('/api/settings', {
      data: { settings: { ...originalSettings, stakingAlert: testValue } },
    });
    expect(putRes.ok(), `settings PUT failed: ${putRes.status()} ${await putRes.text()}`).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    const verifyRes = await page.request.get('/api/settings');
    const verifyRows = await verifyRes.json();
    expect(verifyRows?.[0]?.settings?.stakingAlert).toBe(testValue);
  } finally {
    await page.request.put('/api/settings', { data: { settings: originalSettings } });
  }
});
