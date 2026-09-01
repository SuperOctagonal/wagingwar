import { redirect } from 'next/navigation';

// Standalone /insights route — no longer renders content directly (sidebar
// migration, 2026-09). Redirects to the Insights section of My Bets' sidebar,
// so existing bookmarks/shared links still land somewhere useful instead of
// breaking. middleware.js already protects both /insights(.*) and /mybets(.*)
// with the same auth.protect() check, so the redirect target is covered
// without any middleware change.
export default function InsightsPage() {
  redirect('/mybets?tab=insights');
}
