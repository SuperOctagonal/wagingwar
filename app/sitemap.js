export default function sitemap() {
  const baseUrl = 'https://wagingwar.com.au';

  const routes = [
    '',
    '/races',
    '/results',
    '/mybets',
    '/insights',
    '/competitions',
    '/blackbook',
    '/community',
    '/how-it-works',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
