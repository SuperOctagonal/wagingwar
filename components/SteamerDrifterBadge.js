import { STEAMER_COLOR, DRIFTER_COLOR } from '@/lib/steamersDrifters';

// One arrow per active flag (open-move, recent-move) -- both shown together
// when both fire, since they're independent signals, not mutually exclusive.
// Placed next to the best-price summary only (never per-bookmaker columns).
function Arrow({ flag, sinceLabel }) {
  if (!flag) return null;
  const color = flag.direction === 'steamer' ? STEAMER_COLOR : DRIFTER_COLOR;
  const arrow = flag.direction === 'steamer' ? '▲' : '▼';
  const verb = flag.direction === 'steamer' ? 'Shortened' : 'Lengthened';
  return (
    <span
      title={`${verb} ${flag.pct}% ${sinceLabel}`}
      style={{ color, fontSize: 8, fontWeight: 800, marginLeft: 2, letterSpacing: '-0.5px' }}
    >
      {arrow}
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
