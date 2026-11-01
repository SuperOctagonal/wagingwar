'use client';

// Error boundary for the /admin pages: an unexpected failure shows this
// instead of the site-wide error page. Per-source failures (Clerk, Stripe,
// Supabase) are handled in the page itself and never reach here. No error
// details are shown -- they go to the server log.
export default function AdminError({ reset }) {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f9fafb' }}>
      <div style={{ maxWidth: 640, margin: '48px auto', padding: '0 16px' }}>
        <div role="alert" style={{ border: '1px solid #fecaca', background: '#fff', borderRadius: 8, padding: '16px 18px' }}>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 }}>The admin page couldn&apos;t load</h1>
          <p style={{ fontSize: 13, color: '#374151', margin: '6px 0 12px' }}>Something went wrong while building it. Try again; if it keeps happening, check the server logs.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 6, border: 'none', background: '#00471b', color: '#fff', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
