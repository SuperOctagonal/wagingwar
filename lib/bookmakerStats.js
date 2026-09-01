// Shared per-bookmaker aggregation for the Bookies and Health tabs (My Bets
// sidebar) -- single source of truth for the balance calculation so the two
// pages can never show divergent numbers for the same bookmaker. Added when
// Health gained its own Balance column, reusing this rather than
// duplicating the calc a second time.
import { fetchAllRows } from '@/lib/fetchAllRows';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Same settled-bet definition used across My Bets/Insights (calcRow,
// computeInsightsSummary, etc.) -- win/loss/place, excluding
// pending/unresolved/scratched/abandoned.
export const SETTLED_BET_STATUSES = new Set(['win', 'loss', 'place']);

export function isOpenBet(b) {
  return !SETTLED_BET_STATUSES.has(b.status) && b.status !== 'scratched' && b.status !== 'abandoned';
}

// Mirrors app/mybets/page.js's computePnl exactly -- duplicated here rather
// than imported since page.js isn't meant to be imported as a module.
export function betPnl(b) {
  const isEW = (b.bet_type || '').toLowerCase().includes('each');
  const stk = +(b.stake || 0);
  if (b.profit_loss !== null && b.profit_loss !== undefined) return +b.profit_loss;
  if (b.return_amt !== null && b.return_amt !== undefined) return +b.return_amt - (isEW ? stk * 2 : stk);
  if (b.status === 'loss') return isEW ? -(stk * 2) : -stk;
  return 0;
}

export async function fetchBookmakerTransactions(userId) {
  if (!userId || !SURL || !SKEY) return [];
  const { ok, rows } = await fetchAllRows(
    `${SURL}/rest/v1/bookmaker_transactions?clerk_id=eq.${encodeURIComponent(userId)}&order=occurred_at.desc`,
    { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  );
  return ok ? rows : [];
}

// Per-bookmaker aggregate: txTotal (sum of logged transactions), n/wins/
// staked/pnl (settled bets only), open (stakes on not-yet-resolved bets),
// plus derived balance/roi/winRate. balance = txTotal + pnl -- the exact
// calculation Bookies' Balance column and Health's Balance column both
// read from, via this one function.
export function computeBookmakerRows(bets, transactions) {
  const byBookmaker = {};
  const ensure = bk => (byBookmaker[bk] ||= { bookmaker: bk, txTotal: 0, n: 0, wins: 0, staked: 0, pnl: 0, open: 0 });

  (transactions || []).forEach(t => { ensure(t.bookmaker).txTotal += +t.amount; });
  (bets || []).forEach(b => {
    if (!b.bookmaker) return;
    const row = ensure(b.bookmaker);
    if (isOpenBet(b)) { row.open += +(b.stake || 0); return; }
    if (!SETTLED_BET_STATUSES.has(b.status)) return;
    row.n += 1;
    if (b.status === 'win') row.wins += 1;
    row.staked += +(b.stake || 0);
    row.pnl += betPnl(b);
  });

  return Object.values(byBookmaker).map(r => ({
    ...r,
    balance: r.txTotal + r.pnl,
    roi: r.staked > 0 ? (r.pnl / r.staked) * 100 : null,
    winRate: r.n > 0 ? r.wins / r.n : 0,
  }));
}
