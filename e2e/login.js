#!/usr/bin/env node
// Manual, one-time (well, until the session expires) sign-in: opens a
// real headed browser, a human signs in -- including Clerk's emailed
// new-device code, which there's no way to automate without the app
// email API itself -- and once that's done this saves the resulting
// cookies/storage as Playwright storageState for every other test to
// reuse. Run via `npm run e2e:login`.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.e2e') });

const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://wagingwar.com.au';
const AUTH_DIR = path.resolve(__dirname, '..', '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');
const TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/sign-in`);

  console.log('Sign in in the opened browser window (including the emailed code if Clerk asks for one).');
  console.log(`Waiting up to ${TIMEOUT_MS / 60000} minutes...`);

  await page.waitForURL(url => !url.pathname.startsWith('/sign-in'), { timeout: TIMEOUT_MS });
  // Confirm the signed-in UI is actually there, not just a redirect mid-
  // flight (Clerk can bounce through intermediate URLs before settling).
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(
    () => !!document.cookie && !window.location.pathname.startsWith('/sign-in'),
    null,
    { timeout: 30000 },
  );

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();

  // Never log cookie/token values -- only confirm the file was written.
  console.log('Session saved');
}

main().catch(err => {
  console.error('[e2e:login] failed:', err.message);
  process.exit(1);
});
