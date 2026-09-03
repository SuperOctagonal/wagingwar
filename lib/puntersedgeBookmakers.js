// Maps our internal bookmaker names (see lib/bookmakers.js) to PuntersEdge's
// bookmaker slugs, for matching bet_log rows / race_cards runners against
// PuntersEdge odds data. A bookmaker with no PuntersEdge coverage (or one we
// haven't confirmed a slug for) maps to null -- callers must treat null as
// "skip this bookmaker", never as an error.
//
// Confirmed pairs and the "no PuntersEdge equivalent" list below were
// verified against PuntersEdge's live /v1/racing/best-odds response,
// 2026-09-03. Bet365, BoomBet, and BlueBet are also confirmed null --
// PuntersEdge covers 14 AU bookmakers total and none of these three are on
// that list, so this is settled coverage, not a gap to revisit.
export const PUNTERSEDGE_SLUGS = {
  Sportsbet: 'sportsbet',
  TAB: 'tab',
  TABtouch: 'tabtouch',
  Betr: 'betr_au',
  Ladbrokes: 'ladbrokes_au',
  Neds: 'neds',
  PalmerBet: 'palmerbet',
  BetRight: 'betright',
  Unibet: 'unibet',
  PointsBet: 'pointsbetau',
  'PlayUp/NextBet': 'playup',
  BetDeluxe: 'betdeluxe',
  BoostBet: 'boostbet',
  BetGold: 'betgold',

  // Confirmed as having no PuntersEdge equivalent.
  BetCloud: null,
  Betfair: null,
  'Betfair Back': null,
  Betkings: null,
  Betmakers: null,
  Boombet: null,
  Dabble: null,
  'Global Book': null,
  Picklebet: null,
  Topsport: null,

  // In our active/legacy lists but not covered by the verification pass above.
  Bet365: null,
  BoomBet: null,
  Other: null,
  BlueBet: null,
};

// Never throws -- an unrecognised or unmapped bookmaker simply returns null.
export function getPuntersEdgeSlug(bookmaker) {
  return PUNTERSEDGE_SLUGS[bookmaker] ?? null;
}
