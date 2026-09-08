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
      style={{ display: 'inline-flex', alignItems: 'center', color, background: bg, fontSize: 7, fontWeight: 800, marginLeft: 2, padding: '1px 3px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}
    >
      {arrow}{flag.pct}%
    </span>
  );
}

export default function SteamerDrifterBadge({ flags }) {
  if (!flags || (!flags.open && !flags.recent)) return null;
  return (
    <>
      <Arrow flag={flags.open} sinceLabel="since open" />
      <Arrow flag={flags.recent} sinceLabel="in last hour" />
    </>
  );
}
