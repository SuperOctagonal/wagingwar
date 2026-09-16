// Intraday Track DNA: adjusts running-style-related expectations for a
// meeting's REMAINING races today, using that SAME meeting's own earlier
// results today -- not historical data (that's Race Genome Matching,
// lib/raceGenome.js, a separate mechanism). Pure, additive, downstream of
// the existing pipeline -- never touches calculateMatrixOdds/PM or any
// earlier phase's mechanics.
//
// Mechanism: after each race at a meeting results, compare the winner's
// PRE-race predicted running style (calcPaceMap's role classification --
// Leader/Presser/Midfield/Closer/Backmarker) against a neutral 1-in-5
// baseline. Once at least MIN_RESULTED_RACES races have resulted at that
// meeting today, a role's actual win share today vs that baseline becomes
// a per-role adjustment ratio, applied (damped via sqrt -- a same-day
// n=3-5 sample is genuinely thin, this keeps a single meeting's noise
// from swinging any one runner's price too hard) to a runner's own
// predicted-role probability for the meeting's remaining races.
//
// The 1-in-5 flat baseline is a simplification (roles don't actually win
// at equal historical rates in general) -- chosen because it makes the
// adjustment self-contained and auditable from only today's data, with
// no dependency on a separate historical role-baseline table. Flagged
// explicitly, not hidden.

export const MIN_RESULTED_RACES = 3;
export const ROLES = ['Leader', 'Presser', 'Midfield', 'Closer', 'Backmarker'];
const BASELINE_ROLE_WIN_SHARE = 1 / ROLES.length;

// resultedRaces: [{ winnerRole }] -- one entry per already-resulted race
// at this meeting today, in the order they resulted. Returns
// { applied: false, reason, n } before the minimum sample size is met --
// callers must show this plainly, never silently apply an adjustment
// from 1-2 races.
export function computeIntradayRoleAdjustment(resultedRaces) {
  const n = resultedRaces.length;
  if (n < MIN_RESULTED_RACES) {
    return { applied: false, reason: `only ${n} of ${MIN_RESULTED_RACES} minimum resulted races so far today at this meeting`, n };
  }
  const counts = Object.fromEntries(ROLES.map(r => [r, 0]));
  resultedRaces.forEach(r => { if (r.winnerRole in counts) counts[r.winnerRole]++; });
  const ratios = Object.fromEntries(ROLES.map(role => [role, (counts[role] / n) / BASELINE_ROLE_WIN_SHARE]));
  return { applied: true, n, counts, ratios };
}

// Pure, additive price adjustment for one runner in a later race at the
// same meeting today, using their own predicted role.
export function applyIntradayAdjustment(price, role, adjustment) {
  if (!adjustment?.applied || !(price > 0)) return price;
  const ratio = adjustment.ratios[role];
  if (!(ratio > 0)) return price;
  const damped = Math.sqrt(ratio); // see module comment -- dampens a thin same-day sample
  const prob = 1 / price;
  const adjProb = Math.min(0.98, Math.max(0.005, prob * damped));
  return 1 / adjProb;
}
