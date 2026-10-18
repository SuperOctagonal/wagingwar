const { test, expect } = require('@playwright/test');

// Read-only -- nothing created, nothing to clean up.
//
// Navigate first in both tests -- Clerk's session cookie is short-lived
// and only refreshed by ClerkJS running in a loaded page; page.request
// (not the bare `request` fixture) shares that page's cookie jar, so it
// benefits from the refresh only once a page has actually loaded
// (confirmed live, 2026-10-18: calling it before any navigation 401s).
test('Account page loads', async ({ page }) => {
  await page.goto('/account');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page).not.toHaveURL(/\/sign-in/);

  const meRes = await page.request.get('/api/profile/me');
  expect(meRes.ok(), `profile/me failed: ${meRes.status()} ${await meRes.text()}`).toBeTruthy();
  const profile = await meRes.json();
  expect(profile?.clerk_id).toBeTruthy();
});

test('Public profile page loads', async ({ page }) => {
  await page.goto('/account');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const meRes = await page.request.get('/api/profile/me');
  expect(meRes.ok(), `profile/me failed: ${meRes.status()} ${await meRes.text()}`).toBeTruthy();
  const profile = await meRes.json();
  expect(profile?.clerk_id).toBeTruthy();

  await page.goto(`/u/${profile.clerk_id}`);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page).not.toHaveURL(/\/sign-in/);
});
