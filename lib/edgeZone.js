// Shared bet-history aggregation logic -- the "Edge Zone" analysis originally
// built as page-local functions inside app/insights/page.js (rank x odds
// heatmap, venue breakdown, condition breakdown). Extracted so other features
// (the My Bets Battle Card) can reuse the exact same scoring instead of
// re-implementing it, and so the two can't drift apart.
import { ODDS_BANDS, oddsBucket } from './oddsBucket';

export const RANKS_HEAT = ['R1-2', 'R3-4', 'R5+'];
export const ODDS_HEAT = ODDS_BANDS.map(b => b.label);

export function isBetWon(b) { return b.status === 'won' || b.status === 'win' || b.status === 'place'; }
export function isBetLost(b) { return b.status === 'lost' || b.status === 'loss'; }
export function isBetSettled(b) { return isBetWon(b) || isBetLost(b); }

export function betPnl(b) {
  if (isBetWon(b)) return +(+b.stake * (+b.odds - 1)).toFixed(2);
  if (isBetLost(b)) return -(+b.stake);
  return 0;
}

export function roi(pnl, staked) { return staked > 0 ? pnl / staked * 100 : 0; }

export function rankBucket(r) {
  const n = +(r || 0);
  if (!n) return null;
  if (n <= 2) return 'R1-2';
  if (n <= 4) return 'R3-4';
  return 'R5+';
}

// Core per-group aggregate: n/wins/placings/staked/pnl/roi/strike-rate for
// any array of bets. Every other helper here just groups bets and calls this.
export function aggGroup(bets) {
  const settled = bets.filter(isBetSettled);
  const won = settled.filter(isBetWon);
  const staked = settled.reduce((s, b) => s + +b.stake, 0);
  const pnl = settled.reduce((s, b) => s + betPnl(b), 0);
  const firsts = settled.filter(b => +b.finish_pos === 1 || (!+b.finish_pos && (b.status === 'win' || b.status === 'won'))).length;
  const seconds = settled.filter(b => +b.finish_pos === 2 || (!+b.finish_pos && b.status === 'place')).length;
  const thirds = settled.filter(b => +b.finish_pos === 3).length;
  return {
    n: settled.length, wins: won.length, firsts, seconds, thirds, staked, pnl,
    roi: roi(pnl, staked),
    sr: settled.length > 0 ? won.length / settled.length * 100 : 0,
    top3Rate: settled.length > 0 ? (firsts + seconds + thirds) / settled.length * 100 : 0,
  };
}

// Rank x odds-band grid, same shape as Insights' edgeMap.
export function edgeZoneGrid(bets) {
  const grid = {};
  RANKS_HEAT.forEach(rk => ODDS_HEAT.forEach(ob => { grid[`${rk}||${ob}`] = []; }));
  bets.forEach(b => {
    const rb = rankBucket(b.rank);
    const ob = oddsBucket(b.odds);
    if (rb && ob && grid[`${rb}||${ob}`] !== undefined) grid[`${rb}||${ob}`].push(b);
  });
  return grid;
}

export function venueBreakdown(bets, normaliseVenueFn) {
  const vm = {};
  bets.forEach(b => {
    const v = (normaliseVenueFn ? normaliseVenueFn(b.venue || '') : (b.venue || '')) || 'Unknown';
    if (!vm[v]) vm[v] = [];
    vm[v].push(b);
  });
  return Object.entries(vm).map(([venue, bs]) => ({ label: venue, ...aggGroup(bs) }));
}

export function conditionBreakdown(bets) {
  const cm = {};
  bets.forEach(b => {
    const c = (b.track_condition || 'Unknown').trim();
    if (!cm[c]) cm[c] = [];
    cm[c].push(b);
  });
  return Object.entries(cm).map(([label, bs]) => ({ label, ...aggGroup(bs) }));
}

// Battle Card qualification: best-ROI zone, best-strike-rate venue, and
// best-top3-rate condition, each requiring at least minSample settled bets
// in that specific group. Any category with no qualifying group returns
// null for that category -- callers decide what "not enough data" means
// (e.g. My Bets gates the whole card on all three being non-null).
// Default temporarily floored at 1 (was 10) -- but every current caller
// passes minSample explicitly, so this default is never actually used;
// see app/api/battle-card/{route,share/route,status/route}.js.
export function findBattleCardStats(bets, { minSample = 1, normaliseVenueFn } = {}) {
  const grid = edgeZoneGrid(bets);
  const zoneRows = Object.entries(grid)
    .map(([key, bs]) => {
      const [rankLabel, oddsLabel] = key.split('||');
      return { rankLabel, oddsLabel, ...aggGroup(bs) };
    })
    .filter(r => r.n >= minSample);
  const bestZone = zoneRows.length
    ? zoneRows.reduce((best, r) => (r.roi > best.roi ? r : best))
    : null;

  const venueRows = venueBreakdown(bets, normaliseVenueFn).filter(r => r.n >= minSample);
  const bestVenue = venueRows.length
    ? venueRows.reduce((best, r) => (r.sr > best.sr ? r : best))
    : null;

  const condRows = conditionBreakdown(bets).filter(r => r.n >= minSample);
  const bestCondition = condRows.length
    ? condRows.reduce((best, r) => (r.top3Rate > best.top3Rate ? r : best))
    : null;

  return { bestZone, bestVenue, bestCondition, qualifies: !!(bestZone && bestVenue && bestCondition) };
}
