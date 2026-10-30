// Dev-only extra site-admin IDs, for viewing /admin locally against the
// Clerk DEV instance (where the real admin account doesn't exist).
//
// Two guards, both required: the Clerk secret key must be a dev key
// (sk_test_...) AND NODE_ENV must not be 'production'. With a live key, or
// in any production build, this always returns [] -- whatever
// DEV_SITE_ADMIN_IDS says. Tested in tests/adminDevAllowlist.test.mjs.
//
// Plain .mjs (no Next-specific imports) so node --test can run it directly.
export function devSiteAdminIds(env = process.env) {
  if (env.NODE_ENV === 'production') return [];
  if (!(env.CLERK_SECRET_KEY || '').startsWith('sk_test_')) return [];
  return (env.DEV_SITE_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
