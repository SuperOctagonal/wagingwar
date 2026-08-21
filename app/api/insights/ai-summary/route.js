import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { computeInsightsSummary, fetchUserSettings, MIN_SAMPLE } from '@/lib/insightsSummary';
import { parseFilterParams } from '@/lib/serverInsightsData';

// Section 10 (AI Insight): template-generated, not a live LLM call -- no
// external API spend. Built from the exact same aggregated numbers
// /api/insights/summary returns (via the shared computeInsightsSummary),
// so this can never reference anything beyond what the rest of the page
// already shows. Cheap and synchronous, so no caching is needed here --
// the hash/staleness cache in an earlier version of this route existed only
// to control per-call API cost, which no longer applies to a template.

// Candidate groups pulled from every already-computed breakdown, all given
// a consistent { label, roi, n } shape so best/worst can be picked across
// all of them at once -- same idea as the original page's rank x condition
// zones, just built from the sections that actually exist post-rebuild
// (rank x odds heatmap, track condition, venue) rather than a cross-tab
// that isn't computed anywhere else on this page.
function collectCandidates(summary) {
  const candidates = [];

  summary.roiByRank.forEach(r => {
    if (!r.insufficientData && r.n > 0) candidates.push({ label: `model rank ${r.label}`, roi: r.roi, n: r.n });
  });

  summary.condition.forEach(c => {
    if (!c.insufficientData && c.n > 0) candidates.push({ label: `${c.label} track condition`, roi: c.roi, n: c.n });
  });

  summary.venues.forEach(v => {
    if (!v.insufficientData && v.n > 0) {
      const label = v.venue.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      candidates.push({ label: `${label} (venue)`, roi: v.roi, n: v.n });
    }
  });

  Object.entries(summary.edgeHeatmap.cells).forEach(([key, cell]) => {
    if (!cell.insufficientData && cell.n > 0) {
      const [rankBand, oddsBand] = key.split('||');
      candidates.push({ label: `${rankBand} picks at ${oddsBand}`, roi: cell.roi, n: cell.n });
    }
  });

  return candidates;
}

function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }

function buildSummaryText(summary) {
  const candidates = collectCandidates(summary);

  if (!candidates.length) {
    return `No group in this window yet has ${MIN_SAMPLE} or more settled bets, so there isn't a reliable best- or lowest-performing group to report.`;
  }

  const best = candidates.reduce((a, b) => (b.roi > a.roi ? b : a));
  const worst = candidates.reduce((a, b) => (b.roi < a.roi ? b : a));

  const bestSentence = `The best-performing group in this window is ${best.label}, with an ROI of ${fmtPct(best.roi)} over ${best.n} bets.`;

  if (best === worst || candidates.length === 1) {
    return bestSentence;
  }

  const worstSentence = `The lowest-performing group is ${worst.label}, with an ROI of ${fmtPct(worst.roi)} over ${worst.n} bets.`;
  return `${bestSentence} ${worstSentence}`;
}

export async function GET(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user?.publicMetadata?.plan !== 'pro') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') || undefined;
  const end = searchParams.get('end') || undefined;
  const filters = parseFilterParams(searchParams);

  const userSettings = await fetchUserSettings(userId);
  const { ok, summary } = await computeInsightsSummary(userId, { start, end, filters }, userSettings);
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  return NextResponse.json({ text: buildSummaryText(summary) });
}
