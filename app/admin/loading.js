// Shown while an /admin page builds (Clerk, Stripe and Supabase reads).
// Deliberately generic: it renders before the page's admin check runs.
export default function AdminLoading() {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f9fafb' }}>
      <div role="status" aria-live="polite" style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 16px', fontSize: 13, color: '#6b7280' }}>
        Loading…
      </div>
    </div>
  );
}
