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
export default function FirmingDriftingBadge({ move, compact = false }) {
  if (!move) return null;
  const color = move.direction === 'firming' ? FIRMING_COLOR : DRIFTING_COLOR;
  const bg = move.direction === 'firming' ? '#d1fae5' : '#fee2e2';
  const arrow = move.direction === 'firming' ? '▲' : '▼';
  const label = move.direction === 'firming' ? 'Firming' : 'Drifting';
  return (
    <div style={{ lineHeight: 1.3 }}>
      <span
        title={`${label} ${move.pct}% since open`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color, background: bg, fontSize: 10, fontWeight: 800, marginLeft: 2, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}
      >
        {compact ? `${arrow} ${move.pct}%` : `${arrow} ${label} ${move.pct}%`}
      </span>
    </div>
  );
}
