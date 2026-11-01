/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  // Admin pages and APIs are never indexed. A header (not just the robots
  // meta in app/admin/layout.js) so it also covers the not-found, loading
  // and error responses and the JSON API routes.
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/admin', headers: noindex },
      { source: '/admin/:path*', headers: noindex },
      { source: '/api/admin/:path*', headers: noindex },
    ];
  },
};
export default nextConfig;
