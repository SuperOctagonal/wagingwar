const { test, expect } = require('@playwright/test');

// Session is established once in global-setup.js and reused via
// storageState -- this just confirms it's actually live before every
// other spec relies on it.
test('signed-in session loads a protected page', async ({ page }) => {
  await page.goto('/account');
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.waitForLoadState('networkidle').catch(() => {});
});
