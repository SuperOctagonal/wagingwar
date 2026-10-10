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
// column itself uses) below the pill (or alone, see below). Opt-in and
// undefined everywhere else that renders this badge (Odds tab/page, Pace
// Map, Movers tab) -- only the Field table's MOVE column, MobileRunnerCard
// and the Top firmer/drifter chips pass it.
//
// move is null below MARKET_MOVE_THRESHOLD (lib/marketMoves.js's
// computeMoveFlag returns null under 15%) -- that's not "nothing to show"
// once prices exist: the price line renders on its own, no pill, no
// colour, same small-grey/tabular-nums styling as the >=15% case's own
// price line, so every runner with a real open+current price shows
// something, not just the ones that cleared the pill threshold. Only
// genuinely nothing (no move AND no prices) returns null.
//
// showSignedPctInline: for the under-threshold price-only line, whether
// the signed %" ("+9%"/"-9%", same (current-open)/open calc and sign
// convention as the pill's own unsigned pct+direction, just not run
// through computeMoveFlag's Math.abs/threshold) appends inline after the
// price text (desktop Field table, which can grow/scroll horizontally --
// see app/races/page.js's ww-scroll-x wrapper) or goes into a tooltip on
// the price line instead (MobileRunnerCard, a fixed-width flex box with no
// scroll fallback -- see that call site for why). Flat (rounded 0%) shows
// neither, same as a genuinely-null move case visually.
export default function FirmingDriftingBadge({ move, compact = false, prices = null, showSignedPctInline = true }) {
  const hasPrices = prices && Number.isFinite(prices.open) && Number.isFinite(prices.current);
  if (!move && !hasPrices) return null;
  const color = move?.direction === 'firming' ? FIRMING_COLOR : DRIFTING_COLOR;
  const bg = move?.direction === 'firming' ? '#d1fae5' : '#fee2e2';
  const arrow = move?.direction === 'firming' ? '▲' : '▼';
  const label = move?.direction === 'firming' ? 'Firming' : 'Drifting';
  const priceLine = hasPrices && (
    // #6b7280 on white is ~4.6:1 -- passes WCAG AA (4.5:1) for this
    // 10px/normal-weight text.
    <div className="tabular-nums" style={{ fontSize: 10, color: '#6b7280', marginLeft: move ? 2 : 0, marginTop: move ? 1 : 0, whiteSpace: 'nowrap', lineHeight: 1 }}>
      ${prices.open.toFixed(2)} → ${prices.current.toFixed(2)}
    </div>
  );
  if (!move) {
    // Under threshold: no pill, just the price line (+ signed % per above),
    // vertically centred in the badge's own box so a row of under-
    // threshold runners doesn't end up shorter than one with a pill+price-
    // line stack next to it (the row's actual height is still set by
    // other, taller cells either way, e.g. the Horse/Jockey/Trainer column
    // -- this just keeps the single line from sitting at the top of that
    // extra space instead of centred).
    const signedPct = hasPrices ? Math.round((prices.current - prices.open) / prices.open * 100) : 0;
    const pctStr = signedPct > 0 ? `+${signedPct}%` : signedPct < 0 ? `${signedPct}%` : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minHeight: 18 }}>
        {hasPrices ? (
          <div
            className="tabular-nums"
            title={!showSignedPctInline && pctStr ? `${pctStr} since open` : undefined}
            style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', lineHeight: 1 }}
          >
            ${prices.open.toFixed(2)} → ${prices.current.toFixed(2)}{showSignedPctInline && pctStr ? ` ${pctStr}` : ''}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ lineHeight: 1.3 }}>
      <span
        title={`${label} ${move.pct}% since open -- best price across bookmakers`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color, background: bg, fontSize: 10, fontWeight: 800, marginLeft: 2, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}
      >
        {compact ? `${arrow} ${move.pct}%` : `${arrow} ${label} ${move.pct}%`}
      </span>
      {priceLine}
    </div>
  );
}
