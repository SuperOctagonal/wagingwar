import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { fetchUserBetData } from '@/lib/serverInsightsData';
import { isBetWon, isBetLost, isBetSettled, betPnl, roi, aggGroup, rankBucket, RANKS_HEAT, ODDS_HEAT } from '@/lib/edgeZone';
import { oddsBucket } from '@/lib/oddsBucket';
import { normaliseVenue } from '@/lib/venues';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Batches of the Insights server-side rebuild land as fields on this same
// response rather than new routes -- every Insights section reads from the
// same underlying dataset (this user's own bet_log + closing SP), unlike
// Results' two routes which needed genuinely different heavy per-race joins.
// Batch 1: Hero bar, ROI by model rank, Edge zone heatmap, Track condition.
// Batch 2: CLV tracker, Kelly staking advisor, Top venues.
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

// Kelly stake fraction (%) implied by a win rate and decimal odds, clamped
// at 0 -- same formula the pre-rebuild client-side page used.
function kellyPct(winRate, decOdds) {
  const b = decOdds - 1;
  return b > 0 ? Math.max(0, (winRate * b - (1 - winRate)) / b * 100) : 0;
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

  const [{ ok, bets }, settingsRows] = await Promise.all([
    fetchUserBetData(userId, { start, end }),
    SURL && SKEY
      ? fetch(`${SURL}/rest/v1/user_settings?clerk_id=eq.${encodeURIComponent(userId)}&select=settings`, {
          headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
        }).then(r => r.ok ? r.json() : [])
      : Promise.resolve([]),
  ]);
  if (!ok) return NextResponse.json({ error: 'Supabase fetch failed' }, { status: 502 });

  const userSettings = settingsRows?.[0]?.settings || {};
  const bankroll = +(userSettings.bankroll || 0);
  const kellyFractionLabel = userSettings.kellyFraction || 'Half Kelly';
  const kellyFrac = kellyFractionLabel === 'Full Kelly' ? 1 : kellyFractionLabel === 'Quarter Kelly' ? 0.25 : 0.5;

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

  // ─── CLV tracker (by model rank) ──────────────────────────────────────
  // b.closeSp is the per-horse closing SP from fetchUserBetData's join.
  const clv = ['R1', 'R2', 'R3+', 'All'].map(label => {
    const bs = settled.filter(b => {
      if (b.closeSp == null) return false;
      const r = +(b.rank || 99);
      if (label === 'R1') return r === 1;
      if (label === 'R2') return r === 2;
      if (label === 'R3+') return r >= 3;
      return true;
    });
    const n = bs.length;
    if (!n) return { label, avgClv: 0, beatPct: 0, n: 0, insufficientData: true };
    const vals = bs.map(b => (+b.odds - b.closeSp) / b.closeSp * 100);
    return {
      label, n,
      avgClv: vals.reduce((s, v) => s + v, 0) / vals.length,
      beatPct: vals.filter(v => v > 0).length / vals.length * 100,
      insufficientData: n < MIN_SAMPLE,
    };
  });

  // ─── Kelly staking advisor ─────────────────────────────────────────────
  // Informational only, not directive -- signal is a neutral description of
  // where actual staking sits relative to the model-implied size, not an
  // instruction. Reuses the same rank x odds zones as the Edge Heatmap
  // (heatmapCells above), at the same MIN_SAMPLE floor.
  const kellyZones = bankroll > 0
    ? Object.entries(heatmapCells)
        .map(([key, bs]) => {
          if (bs.length < MIN_SAMPLE) return null;
          const [rb, ob] = key.split('||');
          const g = aggGroup(bs);
          const avgOdds = bs.reduce((s, b) => s + +(b.odds || 0), 0) / bs.length;
          const optK = kellyPct(g.sr / 100, avgOdds) * kellyFrac;
          const actPct = g.staked / g.n / bankroll * 100;
          const signal = optK === 0 ? 'no_model_edge'
            : actPct > optK * 1.2 ? 'above_model_size'
            : actPct < optK * 0.8 ? 'below_model_size'
            : 'in_line_with_model';
          return { label: `${rb} ${ob}`, optK, actPct, signal, n: g.n };
        })
        .filter(Boolean)
        .sort((a, b) => b.n - a.n)
    : [];
  const kelly = { bankroll, kellyFractionLabel, zones: kellyZones };

  // ─── Top venues ─────────────────────────────────────────────────────────
  // Every venue with at least one settled bet, sorting stays client-side
  // (cheap re-sort of an already-small aggregated list) -- same as before.
  const venueGroups = {};
  settled.forEach(b => {
    const v = normaliseVenue(b.track || b.venue || '') || 'Unknown';
    if (!venueGroups[v]) venueGroups[v] = [];
    venueGroups[v].push(b);
  });
  const venues = Object.entries(venueGroups).map(([venue, bs]) => {
    const g = aggGroup(bs);
    return { venue, ...g, insufficientData: g.n < MIN_SAMPLE };
  });

  // ─── Staking discipline ─────────────────────────────────────────────────
  // Two benchmarks against actual P&L: flat $10 stakes, and a simulated
  // Kelly stake (rolling win-rate estimate per day, same as the pre-rebuild
  // client version). Bug fix: both benchmarks previously checked
  // `b.status === 'won'`, a value that never actually appears in bet_log
  // (real values are 'win'/'place'/'loss') -- every win was silently
  // treated as a loss in both benchmarks. Now uses isBetWon/isBetLost.
  const actualPnl = settled.reduce((s, b) => s + betPnl(b), 0);
  const flatPnl = settled.reduce((s, b) => s + (isBetWon(b) ? 10 * (+b.odds - 1) : -10), 0);
  const sortedForKellySim = [...settled].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
  // Patch, not a redesign: this is a rolling-bankroll simulation, and sizing
  // each stake off the CURRENT (compounding) bankroll made it grow
  // exponentially over a long bet history -- confirmed live on a 520-bet
  // account, the simulated P&L came out to +$1.1 billion. Capping the stake
  // base at the starting bankroll (never the grown one) bounds growth to
  // roughly linear regardless of how many bets are simulated, without
  // changing the day-to-day win/loss mechanics. The model's realism beyond
  // that is a separate question for a proper redesign later.
  const startingBankroll = bankroll || 1000;
  let kb = startingBankroll, kellyPnlSum = 0;
  sortedForKellySim.forEach((b, i) => {
    const slice = sortedForKellySim.slice(0, i);
    const sliceW = slice.filter(isBetWon).length;
    const estSR = slice.length > 5 ? sliceW / slice.length : 0.25;
    const kStakePct = kellyPct(estSR, +b.odds) * kellyFrac / 100;
    const kStake = Math.min(kb, startingBankroll) * Math.min(kStakePct, 0.1);
    const p = isBetWon(b) ? kStake * (+b.odds - 1) : -kStake;
    kb += p; kellyPnlSum += p;
  });
  // Second, independent guard on the displayed number itself -- if the
  // simulation still produces something wildly implausible relative to what
  // was actually staked in real life, show that plainly rather than a raw
  // absurd figure.
  const realTotalStaked = settled.reduce((s, b) => s + +(b.stake || 0), 0);
  const kellySimDiverged = realTotalStaked > 0 && Math.abs(kellyPnlSum) > realTotalStaked * 50;
  const overallAvg = settled.length ? settled.reduce((s, b) => s + +(b.stake || 0), 0) / settled.length : 0;
  const lossDates = new Set(settled.filter(isBetLost).map(b => b.date));
  const postLoss = settled.filter(b => {
    if (!b.date) return false;
    const prev = new Date(b.date); prev.setDate(prev.getDate() - 1);
    return lossDates.has(prev.toISOString().slice(0, 10));
  });
  const postLossAvg = postLoss.length ? postLoss.reduce((s, b) => s + +(b.stake || 0), 0) / postLoss.length : null;
  // Factual, not a judgment call -- describes the size of the gap, doesn't
  // label the behavior ("tilt" implied an emotional diagnosis the data
  // can't actually support).
  const postLossPctDiff = postLossAvg !== null && overallAvg > 0 ? (postLossAvg - overallAvg) / overallAvg * 100 : null;
  const elevatedPostLossStaking = postLossPctDiff !== null && postLossPctDiff > 15;
  const staking = settled.length ? {
    actualPnl, flatPnl, kellyPnlSum, kellySimDiverged, overallAvg, postLossAvg, postLossPctDiff, elevatedPostLossStaking,
  } : null;

  // ─── P&L calendar ───────────────────────────────────────────────────────
  // Last 90 calendar days, intersected with the active date-range filter
  // (same as the pre-rebuild client version -- selecting "Today" narrows
  // this grid down to a single cell, by design, not a separate fixed window).
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const calendarDays = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(todayISO); d.setDate(d.getDate() - i);
    calendarDays.push(d.toISOString().slice(0, 10));
  }
  const dayPnl = {};
  const hasBet = {};
  settled.forEach(b => {
    if (!b.date) return;
    dayPnl[b.date] = (dayPnl[b.date] || 0) + betPnl(b);
    hasBet[b.date] = true;
  });
  const calendar = calendarDays.map(d => ({ date: d, pnl: hasBet[d] ? (dayPnl[d] || 0) : null }));

  return NextResponse.json({
    hero, roiByRank, edgeHeatmap, condition, clv, kelly, venues, staking, calendar,
    dateRange: { start: start || null, end: end || null },
  });
}
