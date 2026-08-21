import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { fetchUserBetData } from '@/lib/serverInsightsData';
import { isBetWon, isBetLost, isBetSettled, betPnl, roi, aggGroup, rankBucket, RANKS_HEAT, ODDS_HEAT } from '@/lib/edgeZone';
import { oddsBucket } from '@/lib/oddsBucket';

// Batch 1 of the Insights server-side rebuild: Hero bar, ROI by model rank,
// Edge zone heatmap, Track condition breakdown. Later batches add fields to
// this same response (CLV tracker, Kelly advisor, Top venues, Staking
// discipline, P&L calendar) rather than introducing new routes -- every
// Insights section reads from the same underlying dataset (this user's own
// bet_log + closing SP), unlike Results' two routes which needed genuinely
// different heavy per-race joins.
//
// Date-range only for now (Today/Yesterday/This Week/This Month/All Time/
// Custom, matching the page's existing dateRangeBounds()) -- BetFilterPanel's
// extra filters (odds/venue/distance/etc.) are deliberately NOT wired in here
// yet; that's deferred to the final batch once every section has migrated,
// per explicit agreement to accept the temporary inconsistency during
// migration rather than duplicate the filtering logic twice in the meantime.

// Minimum settled bets a group needs before showing a real percentage.
const MIN_SAMPLE = 10;
// |ROI| this many points either side of 0 is flagged as a "clear edge" on
// the heatmap once a cell clears MIN_SAMPLE -- a deliberate threshold choice
// (not from an existing convention elsewhere in the codebase), flagged back
// for confirmation same as the Score Band range recalibration was.
const CLEAR_EDGE_ROI_THRESHOLD = 20;

function maxDrawdown(sortedBets) {
  let peak = 0, cum = 0, dd = 0;
  for (const b of sortedBets) {
    cum += betPnl(b);
    if (cum > peak) peak = cum;
    const d = peak - cum;
    if (d > dd) dd = d;
  }
  return -dd;
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

  const { ok, bets } = await fetchUserBetData(userId, { start, end });
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  const settled = bets.filter(isBetSettled);
  const wonBets = settled.filter(isBetWon);

  // ─── Hero bar ──────────────────────────────────────────────────────────
  const staked = settled.reduce((s, b) => s + +(b.stake || 0), 0);
  const pnl = settled.reduce((s, b) => s + betPnl(b), 0);
  const sr = settled.length > 0 ? wonBets.length / settled.length * 100 : 0;
  const avgOdds = settled.length > 0 ? settled.reduce((s, b) => s + +(b.odds || 0), 0) / settled.length : 0;
  const clvBets = settled.filter(b => b.closeSp != null);
  const avgClv = clvBets.length > 0
    ? clvBets.reduce((s, b) => s + (+b.odds - b.closeSp) / b.closeSp * 100, 0) / clvBets.length
    : null;
  const sortedByDate = [...settled].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
  const hero = {
    pnl, roi: roi(pnl, staked), sr, avgClv, avgOdds,
    dd: maxDrawdown(sortedByDate), n: settled.length, wins: wonBets.length,
  };

  // ─── ROI by model rank ─────────────────────────────────────────────────
  // Stored bet_log.rank (captured at logging time), not a live re-score --
  // explicit decision to keep this simple and consistent with what's
  // already captured, matching the Kelly/heatmap zones below.
  const roiByRank = ['R1', 'R2', 'R3', 'R4+'].map(label => {
    const bs = settled.filter(b => {
      const r = +(b.rank || 99);
      if (label === 'R1') return r === 1;
      if (label === 'R2') return r === 2;
      if (label === 'R3') return r === 3;
      return r >= 4;
    });
    const g = aggGroup(bs);
    return { label, ...g, insufficientData: g.n < MIN_SAMPLE };
  });

  // ─── Edge zone heatmap (rank bucket x odds band) ──────────────────────
  const heatmapCells = {};
  RANKS_HEAT.forEach(rk => ODDS_HEAT.forEach(ob => { heatmapCells[`${rk}||${ob}`] = []; }));
  settled.forEach(b => {
    const rb = rankBucket(b.rank);
    const ob = oddsBucket(b.odds);
    if (rb && ob && heatmapCells[`${rb}||${ob}`] !== undefined) heatmapCells[`${rb}||${ob}`].push(b);
  });
  const edgeHeatmap = {
    ranks: RANKS_HEAT,
    odds: ODDS_HEAT,
    cells: Object.fromEntries(Object.entries(heatmapCells).map(([key, bs]) => {
      const g = aggGroup(bs);
      const insufficientData = g.n < MIN_SAMPLE;
      const hasEdge = !insufficientData && Math.abs(g.roi) >= CLEAR_EDGE_ROI_THRESHOLD;
      return [key, { n: g.n, roi: g.roi, sr: g.sr, insufficientData, hasEdge, edgeDirection: hasEdge ? (g.roi > 0 ? 'positive' : 'negative') : null }];
    })),
  };

  // ─── Track condition breakdown ────────────────────────────────────────
  const condition = ['Good', 'Soft', 'Heavy', 'Synthetic'].map(label => {
    const bs = settled.filter(b => (b.track_condition || '').toLowerCase().includes(label.toLowerCase()));
    const g = aggGroup(bs);
    return { label, ...g, insufficientData: g.n < MIN_SAMPLE };
  });

  return NextResponse.json({ hero, roiByRank, edgeHeatmap, condition, dateRange: { start: start || null, end: end || null } });
}
