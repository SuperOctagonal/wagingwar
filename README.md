# wagingwar-next

## End-to-end tests (Playwright)

A Playwright suite that drives the **live site** (production by default)
with a dedicated Clerk test account. It is not run automatically on
deploy or in any CI hook -- it's invoked explicitly.

Authentication is a **saved browser session**, not stored credentials --
Clerk challenges a fresh browser/device with an emailed code, which
can't be scripted without hooking into the app's own email delivery. You
sign in by hand once; Playwright reuses that session for every test
until it expires.

### Setup (Windows)

1. Create a dedicated Clerk user to test with. **Never use a real
   punter's account** -- the suite logs real bets, blackbook rows,
   community posts/replies/votes and a competition pick under this
   account (all prefixed `QA e2e -` and deleted again by the test that
   created them, but transient activity still happens). Give it the
   **Pro** plan so every covered flow (Blackbook, Insights, Community,
   competitions, live odds) is actually reachable.
2. Copy `.env.e2e.example` to `.env.e2e` (optional -- only needed to
   override `BASE_URL`, e.g. to point at a preview deploy instead of
   production). `.env.e2e` is git-ignored; it holds no credentials.
3. Install Playwright's browser binary once:
   ```
   npx playwright install chromium
   ```
4. Save a session:
   ```
   npm run e2e:login
   ```
   A real Chrome window opens at the sign-in page. Sign in as the test
   account by hand, including Clerk's emailed new-device code when it
   asks for one. Once you're through to a signed-in page, the script
   detects it automatically, writes `.auth/user.json`, and prints
   `Session saved`. Leave the window alone until you see that line --
   it waits up to 5 minutes.
5. Re-run step 4 (`npm run e2e:login`) whenever the saved session
   expires -- see "fails fast" below for how you'll know.

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

If `.auth/user.json` is missing, or the saved session has expired, the
whole run fails immediately with one message -- **`Session missing or
expired, run npm run e2e:login`** -- instead of every signed-in test
failing separately for the same reason. Run `npm run e2e:login` again
and re-run `npm run e2e`.

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
