'use client';

// Standalone /insights route — kept alive for existing bookmarks/shared links
// after Batch 4 of the My Bets restructure removed Insights from top nav and
// relocated its content into My Bets' Insights tab. Actual implementation
// lives in components/InsightsPanel.js, shared by both this route and that tab.
import InsightsPanel from '@/components/InsightsPanel';

export default function InsightsPage() {
  return <InsightsPanel />;
}
