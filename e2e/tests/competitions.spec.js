const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

// Uses a venue that doesn't exist in race_schedule on purpose -- the
// lock check fails open ("not locked") when it can't find a matching
// schedule row, so this never collides with a real competition race and
// never risks hitting a genuinely locked one.
test('Competitions: pick save', async ({ request }) => {
  const cleanup = new Cleanup(request);
  const venue = qa('Test Track');
  const horseName = qa('Competitions Test Horse');
  const todayISO = new Date().toISOString().slice(0, 10);

  try {
    const postRes = await request.post('/api/competitions/picks', {
      data: { comp_date: todayISO, venue, race_num: 1, horse_name: horseName },
    });
    expect(postRes.ok(), `pick save failed: ${postRes.status()} ${await postRes.text()}`).toBeTruthy();
    const row = await postRes.json();
    expect(row?.id).toBeTruthy();
    cleanup.add('/api/competitions/picks', row.id);

    const getRes = await request.get(`/api/competitions/picks?comp_date=${todayISO}`);
    expect(getRes.ok()).toBeTruthy();
    const picks = await getRes.json();
    expect(picks.some(p => p.horse_name === horseName)).toBeTruthy();
  } finally {
    await cleanup.run();
  }
});
