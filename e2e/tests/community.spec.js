const { test, expect } = require('@playwright/test');
const { qa } = require('../utils/constants');
const { Cleanup } = require('../utils/cleanup');

test('Community: post, reply, vote twice (counts once), delete reply, delete post', async ({ page }) => {
  // Navigate first -- Clerk's session cookie is short-lived and only
  // refreshed by ClerkJS running in a loaded page; page.request (used
  // throughout below, not the bare `request` fixture) shares this
  // page's cookie jar, so it benefits from that refresh (confirmed
  // live, 2026-10-18).
  await page.goto('/community');
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const cleanup = new Cleanup(page.request);
  const title = qa('Post Title');
  const body = qa('Post body created by the e2e suite.');
  const replyText = qa('Reply body created by the e2e suite.');

  try {
    const postRes = await page.request.post('/api/community/post', { data: { section: 'general', title, body } });
    expect(postRes.ok(), `post create failed: ${postRes.status()} ${await postRes.text()}`).toBeTruthy();
    const createdPost = await postRes.json();
    const postRow = Array.isArray(createdPost) ? createdPost[0] : createdPost;
    expect(postRow?.id).toBeTruthy();
    cleanup.add('/api/community/post', postRow.id);

    const replyRes = await page.request.post('/api/community/reply', { data: { post_id: postRow.id, content: replyText } });
    expect(replyRes.ok(), `reply create failed: ${replyRes.status()} ${await replyRes.text()}`).toBeTruthy();
    const createdReply = await replyRes.json();
    const replyRow = Array.isArray(createdReply) ? createdReply[0] : createdReply;
    expect(replyRow?.id).toBeTruthy();
    cleanup.add('/api/community/reply', replyRow.id);

    // This post's own detail page shows exactly this one post and reply
    // -- both ours -- so it's safe to assert on their visible text here,
    // unlike a list page shared with other real content.
    await page.goto(`/community/post/${postRow.id}`);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('1 reply', { exact: false }).first()).toBeVisible();

    // Vote twice via the API directly (not two UI clicks -- the UI
    // toggles vote/unvote per click, a different path). This is the
    // actual idempotency guarantee worth asserting: firing the same POST
    // twice must never double-count.
    const vote1 = await page.request.post('/api/community/vote', { data: { targetType: 'post', targetId: postRow.id } });
    expect(vote1.ok()).toBeTruthy();
    const { votes: votesAfterFirst } = await vote1.json();
    const vote2 = await page.request.post('/api/community/vote', { data: { targetType: 'post', targetId: postRow.id } });
    expect(vote2.ok()).toBeTruthy();
    const { votes: votesAfterSecond } = await vote2.json();
    expect(votesAfterFirst).toBe(1);
    expect(votesAfterSecond).toBe(1); // second call must be a no-op, not 2

    // Un-vote before deleting, so this post is left in a clean state if
    // deletion were to ever fail partway.
    const unvote = await page.request.delete(`/api/community/vote?targetType=post&targetId=${postRow.id}`);
    expect(unvote.ok()).toBeTruthy();

    const delReplyRes = await page.request.delete(`/api/community/reply?id=${replyRow.id}`);
    expect(delReplyRes.ok(), `reply delete failed: ${delReplyRes.status()} ${await delReplyRes.text()}`).toBeTruthy();
    cleanup.items = cleanup.items.filter(i => i.id !== replyRow.id);

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText(replyText)).toHaveCount(0);
    await expect(page.getByText('0 replies', { exact: false }).first()).toBeVisible();

    const delPostRes = await page.request.delete(`/api/community/post?id=${postRow.id}`);
    expect(delPostRes.ok(), `post delete failed: ${delPostRes.status()} ${await delPostRes.text()}`).toBeTruthy();
    cleanup.items = cleanup.items.filter(i => i.id !== postRow.id);

    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await expect(page.getByText('Post not found.')).toBeVisible({ timeout: 10000 });
  } finally {
    await cleanup.run();
  }
});
