const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

test('Blackbook: add, edit note, remove', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page; page.request (used
  // below, not the bare `request` fixture) shares this page's cookie
  // jar, so it benefits from that refresh (confirmed live, 2026-10-18).
  await page.goto('/blackbook');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const cleanup = new Cleanup(page.request);
  const horseName = qa('Blackbook Test Horse');

  try {
    const createRes = await page.request.post('/api/blackbook', { data: { horse_name: horseName } });
    expect(createRes.ok(), `blackbook add failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const created = await createRes.json();
    const row = Array.isArray(created) ? created[0] : created;
    expect(row?.id).toBeTruthy();
    cleanup.add('/api/blackbook', row.id);

    const noteText = qa('note edited by e2e');
    const patchRes = await page.request.patch(`/api/blackbook?id=${row.id}`, { data: { note: noteText } });
    expect(patchRes.ok(), `blackbook note edit failed: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(horseName).first()).toBeVisible({ timeout: 20000 });

    // The note itself is collapsed behind a per-row toggle by default
    // (app/blackbook/page.js's expandedNotes state) -- not visible in
    // the DOM at all until clicked, and that toggle has no row-scoped
    // selector available (same reason "Rm" isn't clicked directly
    // below). Verifying the write via the API it was made through is
    // equally valid proof it persisted.
    const verifyRes = await page.request.get('/api/blackbook');
    const rows = await verifyRes.json();
    expect(rows.find(r => r.id === row.id)?.note).toBe(noteText);

    // Removed via the API, not by clicking the page's "Rm" button --
    // every row renders an identical "Rm" control with no id/row scoping
    // available without a test id, and this suite runs against the real
    // account's real blackbook list, so a same-text-match click risks
    // deleting a DIFFERENT, real saved horse instead of this one. The
    // confirm() dialog itself is a one-line window.confirm in the
    // component (app/blackbook/page.js's handleRemove) with no app logic
    // behind it worth an e2e assertion.
    const delRes = await page.request.delete(`/api/blackbook?id=${row.id}`);
    expect(delRes.ok(), `blackbook remove failed: ${delRes.status()} ${await delRes.text()}`).toBeTruthy();
    cleanup.items = []; // already deleted -- nothing left for the finally block

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(horseName)).toHaveCount(0);
  } finally {
    await cleanup.run();
  }
});
