// @ts-check
const path = require('path');
const dotenv = require('dotenv');

// .env.e2e holds the test account's real credentials -- git-ignored, never
// committed. Loaded here (not via Playwright's built-in dotenv support)
// so both the config and every test/setup file see the same values via
// process.env, regardless of how they're run.
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
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./e2e/global-setup.js'),
  use: {
    baseURL: BASE_URL,
    storageState: path.resolve(__dirname, 'e2e/.auth/user.json'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // This suite hits the real production site and a real (test) account --
  // never wired into any deploy/CI hook. Run it explicitly with `npm run e2e`.
});
