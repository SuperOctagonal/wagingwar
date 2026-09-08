import { STEAMER_COLOR, DRIFTER_COLOR } from '@/lib/steamersDrifters';

// One pill per active flag (open-move, recent-move) -- both shown together
// when both fire, since they're independent signals, not mutually exclusive.
// Placed next to the best-price summary only (never per-bookmaker columns).
// Deliberately a filled background pill, not bare colored text -- a plain
// colored arrow/percentage here is visually near-identical to the existing,
// unrelated WW$-vs-market Value column (RunnerRow/MobileRunnerCard), which
// already renders its own bare colored ▲/▼+% text. The pill background is
// what makes this a distinct, unmistakable badge rather than "another arrow
// on the row" a reader could attribute to the wrong column at a glance.
function Arrow({ flag, sinceLabel }) {
  if (!flag) return null;
  const color = flag.direction === 'steamer' ? STEAMER_COLOR : DRIFTER_COLOR;
  const bg = flag.direction === 'steamer' ? '#d1fae5' : '#fee2e2';
  const arrow = flag.direction === 'steamer' ? '▲' : '▼';
  const verb = flag.direction === 'steamer' ? 'Shortened' : 'Lengthened';
  return (
    <span
      title={`${verb} ${flag.pct}% ${sinceLabel}`}
      style={{ display: 'inline-flex', alignItems: 'center', color, background: bg, fontSize: 10, fontWeight: 800, marginLeft: 2, padding: '1px 4px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}
    >
      {arrow}{flag.pct}%
    </span>
  );
}

// Wrapped in its own block-level div, same as the existing LIVE tag
// (display:'block') next to it -- every render site (RunnerRow/
// MobileRunnerCard's Price $, PaceMapView's SP, OddsTable's Best) is a
// narrow, nowrap, fixed/percentage-width cell shared with a sibling column
// (Value, or the next bookmaker column). An inline badge appended after the
// price text extends that line's horizontal footprint past the cell's own
// width, and in a fixed-width flex box (PaceMapView's w-20, MobileRunnerCard)
// or a tight percentage-width table column (RunnerRow), that overflow
// visually bleeds into the neighbouring column instead of the cell growing
// to fit -- which is exactly what made this look like it was rendering
// "inside" the Value column. Stacking it on its own line below the price
// keeps this cell's width exactly what it already was with no badge at all.
export default function SteamerDrifterBadge({ flags }) {
  if (!flags || (!flags.open && !flags.recent)) return null;
  return (
    <div style={{ lineHeight: 1.3 }}>
      <Arrow flag={flags.open} sinceLabel="since open" />
      <Arrow flag={flags.recent} sinceLabel="in last hour" />
    </div>
  );
}
