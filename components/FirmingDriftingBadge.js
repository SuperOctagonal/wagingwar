import { FIRMING_COLOR, DRIFTING_COLOR } from '@/lib/marketMoves';

// Filled pill with an arrow AND the word "Firming"/"Drifting", not just
// color+arrow -- bare colored arrow+% (the pre-rename design) was too easy
// to mistake for the separate, unrelated Value column (RunnerRow/
// MobileRunnerCard's WW$-vs-market edge, which renders its own bare colored
// arrow+% text and was never touched by this feature). The visible word is
// what removes the ambiguity, not just position/color.
//
// Wrapped in its own block-level div, same as the LIVE tag next to it --
// every render site (RunnerRow/MobileRunnerCard's Price $, PaceMapView's
// SP, OddsTable's Best, the Movers tab's Move column) is a narrow, nowrap,
// fixed/percentage-width cell shared with a sibling column. An inline
// badge appended after the price text extends that line's horizontal
// footprint past the cell's own width, and in a fixed-width flex box or a
// tight percentage-width table column, that overflow visually bleeds into
// the neighbouring column instead of the cell growing to fit. Stacking it
// on its own line keeps the cell's width exactly what it was without a
// badge at all.
// compact: true drops the "Firming"/"Drifting" word, showing just the arrow
// + percentage. Only used where the badge already has its own dedicated
// column (Field tab's MOVE column) -- the label exists specifically to
// disambiguate from the neighbouring Value column when the two shared space
// (see above), so it's still shown everywhere the badge remains stacked
// under a price (Odds tab/page, Pace Map, mobile Field tab).
//
// prices: optional {open, current} -- when both are real numbers, shown as
// a second line ("$5.10 → $2.80", same .toFixed(2) convention the Price $
// column itself uses) below the pill. Opt-in and undefined everywhere else
// that renders this badge (Odds tab/page, Pace Map, mobile Field tab,
// Movers tab) -- only the Field table's MOVE column and the Top
// firmer/drifter chips pass it, per the task that added it.
export default function FirmingDriftingBadge({ move, compact = false, prices = null }) {
  if (!move) return null;
  const color = move.direction === 'firming' ? FIRMING_COLOR : DRIFTING_COLOR;
  const bg = move.direction === 'firming' ? '#d1fae5' : '#fee2e2';
  const arrow = move.direction === 'firming' ? '▲' : '▼';
  const label = move.direction === 'firming' ? 'Firming' : 'Drifting';
  const hasPrices = prices && Number.isFinite(prices.open) && Number.isFinite(prices.current);
  return (
    <div style={{ lineHeight: 1.3 }}>
      <span
        title={`${label} ${move.pct}% since open -- best price across bookmakers`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color, background: bg, fontSize: 10, fontWeight: 800, marginLeft: 2, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}
      >
        {compact ? `${arrow} ${move.pct}%` : `${arrow} ${label} ${move.pct}%`}
      </span>
      {/* #6b7280 on white is ~4.6:1 -- passes WCAG AA (4.5:1) for this
          10px/normal-weight text. */}
      {hasPrices && (
        <div className="tabular-nums" style={{ fontSize: 10, color: '#6b7280', marginLeft: 2, marginTop: 1, whiteSpace: 'nowrap', lineHeight: 1 }}>
          ${prices.open.toFixed(2)} → ${prices.current.toFixed(2)}
        </div>
      )}
    </div>
  );
}
