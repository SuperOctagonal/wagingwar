# wagingwar-next

## End-to-end tests (Playwright)

A Playwright suite that drives the **live site** (production by default)
with a dedicated Clerk test account. It is not run automatically on
deploy or in any CI hook -- it's invoked explicitly.

### Setup

1. Create a dedicated Clerk user to test with. **Never use a real
   punter's account** -- the suite logs real bets, blackbook rows,
   community posts/replies/votes and a competition pick under this
   account (all prefixed `QA e2e -` and deleted again by the test that
   created them, but transient activity still happens). Give it the
   **Pro** plan so every covered flow (Blackbook, Insights, Community,
   competitions, live odds) is actually reachable.
2. Copy `.env.e2e.example` to `.env.e2e` and fill in:
   - `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` -- that test account's real
     sign-in credentials.
   - `BASE_URL` -- defaults to `https://wagingwar.com.au`; override to
     point at a preview deploy or local dev server instead.
   `.env.e2e` is git-ignored. Never commit it.
3. Install Playwright's browser binary once: `npx playwright install chromium`.

### Running

```
npm run e2e
```

Runs serially (one worker, no parallelism) against whatever `BASE_URL`
resolves to, since every test shares one real account and one real
production database -- concurrent runs would make failures impossible
to attribute and risk one test's writes colliding with another's.

Every test prefixes everything it creates with `QA e2e -` and deletes it
again in a `finally`/cleanup block, even on failure. No test clears all
of the account's bets or touches anything account-wide.

View the HTML report after a run: `npx playwright show-report`.

### What's covered

- Sign-in, and that a protected page loads afterward.
- Races: live prices and the Move/LIVE badge render.
- My Bets: log, edit and delete a bet.
- Insights: the summary endpoint returns real numbers.
- Blackbook: add, edit a note, remove.
- Settings: save a value, reload, verify it persisted (restores the
  account's real settings afterward -- the settings PUT replaces the
  whole blob, not a merge).
- Community: post, reply, vote twice via the API directly (must count
  once, not twice), delete the reply, delete the post.
- Competitions: save a pick (against a fabricated venue/race that can't
  collide with a real one).
- Profile and Account pages load.
- API auth: every write route returns 401 when signed out; a request
  against another/non-existent id returns 404 and changes nothing.

### Known limitations

- There's no second real test account, so a genuine cross-user 403 (as
  opposed to "id doesn't exist," which returns 404 the same way) isn't
  exercised -- see `e2e/tests/api-auth.spec.js`'s comments.
- The app has no test ids. Selectors are built from real button/label
  text read from the source at the time this suite was written -- if
  that copy changes, the matching test needs updating too.
