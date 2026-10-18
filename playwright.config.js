// @ts-check
const path = require('path');
const dotenv = require('dotenv');

// .env.e2e holds BASE_URL -- git-ignored, never committed (no credentials
// live here anymore; auth is a saved session, see e2e/login.js). Loaded
// here (not via Playwright's built-in dotenv support) so both the config
// and every test/setup file see it via process.env regardless of how
// they're run.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://wagingwar.com.au';

module.exports = defineConfig({
  testDir: './e2e/tests',
  // Against production, with one shared test account -- tests must not
  // run concurrently (two bets logged at once, a vote race, etc. would
  // make failures impossible to attribute and risk corrupting another
  // test's state before its own cleanup runs).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Several pages here poll on their own setInterval (My Bets, Blackbook,
  // Competitions) and never truly reach networkidle, so a test that
  // reloads a couple of times and waits on networkidle each time can
  // exceed Playwright's 30s default well before anything is actually
  // wrong (confirmed live, 2026-10-18: a few tests failed with "Test
  // timeout of 30000ms exceeded" despite the awaited content already
  // being on the page by the time of the failure screenshot).
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./e2e/global-setup.js'),
  use: {
    baseURL: BASE_URL,
    // Saved by `npm run e2e:login` (manual sign-in -- Clerk's new-device
    // email code can't be scripted). Applies to both the `page` and
    // `request` fixtures, so api-auth.spec.js's signed-in checks send
    // real session cookies too, not a separate login path.
    storageState: path.resolve(__dirname, '.auth/user.json'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // This suite hits the real production site and a real (test) account --
  // never wired into any deploy/CI hook. Run it explicitly with `npm run e2e`.
});
