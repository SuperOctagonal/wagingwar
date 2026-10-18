// Runs once before the whole suite. Fails the entire run with one clear
// message instead of letting every signed-in test fail separately for
// the same underlying reason (missing or expired session).
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const AUTH_FILE = path.resolve(__dirname, '..', '.auth', 'user.json');
const FAIL_MESSAGE = 'Session missing or expired, run npm run e2e:login';

module.exports = async function globalSetup(config) {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(FAIL_MESSAGE);
  }

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage({ storageState: AUTH_FILE });
  try {
    await page.goto(`${baseURL}/account`);
    await page.waitForLoadState('networkidle').catch(() => {});
    if (new URL(page.url()).pathname.startsWith('/sign-in')) {
      throw new Error(FAIL_MESSAGE);
    }
  } finally {
    await browser.close();
  }
};
