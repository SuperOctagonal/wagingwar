// Signs in once via Clerk's hosted <SignIn/> form and saves the resulting
// session as storageState, reused by every test (via playwright.config.js's
// `use.storageState`) instead of each spec file re-authenticating. Tests
// that need a signed-out context override with
// `test.use({ storageState: { cookies: [], origins: [] } })`.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

module.exports = async function globalSetup(config) {
  const { baseURL } = config.projects[0].use;
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL / E2E_USER_PASSWORD are not set. Copy .env.e2e.example to .env.e2e and fill in a dedicated Clerk test account.',
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/sign-in`);

  // Clerk's hosted sign-in: email/identifier step, then a separate
  // password step. Selectors target the actual <input> by name rather
  // than visible copy, since Clerk's own button/label text has changed
  // across versions.
  await page.locator('input[name="identifier"]').fill(email);
  await page.getByRole('button', { name: /continue/i }).click();

  await page.locator('input[name="password"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /continue|sign in/i }).click();

  // Signed in once Clerk redirects off /sign-in -- don't assert a specific
  // destination, the post-login redirect target isn't this suite's concern.
  await page.waitForURL(url => !url.pathname.startsWith('/sign-in'), { timeout: 20000 });
  // Settle past the redirect before trusting the session is fully live
  // (middleware/Clerk client hydration can lag the URL change by a beat).
  await page.waitForLoadState('networkidle').catch(() => {});

  const authDir = path.resolve(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: path.join(authDir, 'user.json') });
  await browser.close();
};
