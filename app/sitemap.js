// Static, public pages only. The per-meeting Results URLs
// (/results?date=...&venue=..., ~190 of them) were removed 2026-10-31: each
// one triggers up to 30 days of race-card scoring on the server, and
// crawlers following them were a likely cause of memory pressure on
// wagingwar-app. Restore from git history once those pages are cheap.
export const revalidate = 3600;

export default function sitemap() {
  const baseUrl = 'https://wagingwar.com.au';

  // Publicly viewable pages only -- sign-in-only routes (middleware.js's
  // isProtectedRoute: /races, /mybets, /community, ...) redirect crawlers
  // to /sign-in, so listing them only produced redirect noise.
  const routes = [
    '',
    '/results',
    '/tip-record',
    '/how-it-works',
    '/pricing',
    '/faq',
    '/terms',
    '/privacy',
    '/responsible-gambling',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
