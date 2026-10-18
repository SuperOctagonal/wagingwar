const { test, expect } = require('@playwright/test');

// user_settings stores one JSONB blob per user and PUT replaces it
// wholesale (not a merge) -- this test reads the real current settings
// first and restores them exactly afterward, rather than deleting
// anything (there's nothing to delete: it's the account's one settings
// row, not a created test row).
test('Settings: save and reload', async ({ page, request }) => {
  const getRes = await request.get('/api/settings');
  expect(getRes.ok(), `settings GET failed: ${getRes.status()} ${await getRes.text()}`).toBeTruthy();
  const rows = await getRes.json();
  const originalSettings = rows?.[0]?.settings || {};

  // A sentinel value unlikely to collide with anything real, on a field
  // (stakingAlert) that's purely informational -- it changes what the
  // Log Bet form warns about, nothing else.
  const testValue = '987';
  try {
    const putRes = await request.put('/api/settings', {
      data: { settings: { ...originalSettings, stakingAlert: testValue } },
    });
    expect(putRes.ok(), `settings PUT failed: ${putRes.status()} ${await putRes.text()}`).toBeTruthy();

    await page.goto('/settings');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});

    const verifyRes = await request.get('/api/settings');
    const verifyRows = await verifyRes.json();
    expect(verifyRows?.[0]?.settings?.stakingAlert).toBe(testValue);
  } finally {
    await request.put('/api/settings', { data: { settings: originalSettings } });
  }
});
