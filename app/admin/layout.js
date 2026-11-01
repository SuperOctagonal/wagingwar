// Every /admin page: never indexed (also sent as an X-Robots-Tag header,
// see next.config.mjs, and disallowed in app/robots.js; not in the sitemap).
export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
