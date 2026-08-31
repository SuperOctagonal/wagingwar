// Single source of truth for the bookmaker list, used by every bet-logging
// entry point (Races page BetModal, My Bets Quick Log, Settings' default
// bookmaker) plus server-side validation in /api/log-bet.
//
// Previously three separate hardcoded copies existed and had already drifted
// (Settings was missing BlueBet/Other that the other two had) -- see the
// bookmaker audit, 2026-08-31.
//
// BLUEBET is deliberately excluded from BOOKMAKERS (the selectable list) --
// BlueBet rebranded to BetRight in 2023, so new bets should be logged under
// BetRight. It's kept in LEGACY_BOOKMAKERS so historical bet_log rows already
// tagged "BlueBet" keep validating/filtering correctly (BetFilterPanel's
// bookmaker filter is already dynamic, built from actual logged values, so it
// needs no change here) without offering it as a choice for new bets.
export const BOOKMAKERS = [
  'Sportsbet', 'TAB', 'Ladbrokes', 'Neds', 'Betfair', 'Bet365',
  'PointsBet', 'Unibet', 'BetRight', 'Betr', 'PalmerBet', 'TABtouch',
  'Dabble', 'BoomBet', 'Other',
];

export const LEGACY_BOOKMAKERS = ['BlueBet'];

// Full accepted set for server-side validation -- active + legacy, so a bet
// logged under the old brand name before the BetRight rename still passes.
export const ALL_KNOWN_BOOKMAKERS = [...BOOKMAKERS, ...LEGACY_BOOKMAKERS];
