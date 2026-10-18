const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

// Uses a venue that doesn't exist in race_schedule on purpose -- the
// lock check fails open ("not locked") when it can't find a matching
// schedule row, so this never collides with a real competition race and
// never risks hitting a genuinely locked one.
test('Competitions: pick save', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page; page.request (used
  // below, not the bare `request` fixture) shares this page's cookie
  // jar, so it benefits from that refresh (confirmed live, 2026-10-18).
  await page.goto('/competitions');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const cleanup = new Cleanup(page.request);
  const venue = qa('Test Track');
  const horseName = qa('Competitions Test Horse');
  const todayISO = new Date().toISOString().slice(0, 10);

  try {
    const postRes = await page.request.post('/api/competitions/picks', {
      data: { comp_date: todayISO, venue, race_num: 1, horse_name: horseName },
    });
    expect(postRes.ok(), `pick save failed: ${postRes.status()} ${await postRes.text()}`).toBeTruthy();
    const row = await postRes.json();
    expect(row?.id).toBeTruthy();
    cleanup.add('/api/competitions/picks', row.id);

    const getRes = await page.request.get(`/api/competitions/picks?comp_date=${todayISO}`);
    expect(getRes.ok()).toBeTruthy();
    const picks = await getRes.json();
    expect(picks.some(p => p.horse_name === horseName)).toBeTruthy();
  } finally {
    await cleanup.run();
  }
});
