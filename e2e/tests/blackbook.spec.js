const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

test('Blackbook: add, edit note, remove', async ({ page, request }) => {
  const cleanup = new Cleanup(request);
  const horseName = qa('Blackbook Test Horse');

  try {
    const createRes = await request.post('/api/blackbook', { data: { horse_name: horseName } });
    expect(createRes.ok(), `blackbook add failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const created = await createRes.json();
    const row = Array.isArray(created) ? created[0] : created;
    expect(row?.id).toBeTruthy();
    cleanup.add('/api/blackbook', row.id);

    const noteText = qa('note edited by e2e');
    const patchRes = await request.patch(`/api/blackbook?id=${row.id}`, { data: { note: noteText } });
    expect(patchRes.ok(), `blackbook note edit failed: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy();

    await page.goto('/blackbook');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.getByText(horseName).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(noteText).first()).toBeVisible({ timeout: 10000 });

    // Removed via the API, not by clicking the page's "Rm" button --
    // every row renders an identical "Rm" control with no id/row scoping
    // available without a test id, and this suite runs against the real
    // account's real blackbook list, so a same-text-match click risks
    // deleting a DIFFERENT, real saved horse instead of this one. The
    // confirm() dialog itself is a one-line window.confirm in the
    // component (app/blackbook/page.js's handleRemove) with no app logic
    // behind it worth an e2e assertion.
    const delRes = await request.delete(`/api/blackbook?id=${row.id}`);
    expect(delRes.ok(), `blackbook remove failed: ${delRes.status()} ${await delRes.text()}`).toBeTruthy();
    cleanup.items = []; // already deleted -- nothing left for the finally block

    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.getByText(horseName)).toHaveCount(0);
  } finally {
    await cleanup.run();
  }
});
