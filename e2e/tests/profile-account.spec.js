const { test, expect } = require('@playwright/test');

// Read-only -- nothing created, nothing to clean up.
test('Account page loads', async ({ page, request }) => {
  const meRes = await request.get('/api/profile/me');
  expect(meRes.ok(), `profile/me failed: ${meRes.status()} ${await meRes.text()}`).toBeTruthy();
  const profile = await meRes.json();
  expect(profile?.clerk_id).toBeTruthy();

  await page.goto('/account');
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).not.toHaveURL(/\/sign-in/);
});

test('Public profile page loads', async ({ page, request }) => {
  const meRes = await request.get('/api/profile/me');
  const profile = await meRes.json();
  expect(profile?.clerk_id).toBeTruthy();

  await page.goto(`/u/${profile.clerk_id}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).not.toHaveURL(/\/sign-in/);
});
