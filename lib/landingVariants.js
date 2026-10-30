// Home page hero copy per ad campaign, chosen by ?utm_content=. middleware.js
// rewrites /?utm_content=<key> to the prerendered /landing/<key>, so every
// variant stays static (no per-request render, no client-side headline swap).
//
// Copy rules for every variant: no claims about profit, winnings or returns;
// qld carries no figures at all (noFigures: no model-record card, no product
// mockup with records/prices) so nothing on it can go stale.
export const LANDING_VARIANTS = {
  product15: {
    headline: 'Live Prices and Race Scoring for Every Race',
    sub: 'Live bookmaker prices free for every punter. Pro adds scores, pace maps and value.',
  },
  qld: {
    headline: 'Every QLD race scored. Live prices free.',
    sub: 'Data and analytics for Australian racing.',
    noFigures: true,
  },
  cupquest: {
    headline: 'Melbourne Cup Week: Every Runner Scored',
    sub: 'Live bookmaker prices free for every punter. Pro adds scores, pace maps and value.',
  },
};

export const DEFAULT_LANDING = {
  headline: 'Back Winners With Data,\nNot Hunches',
  sub: 'Live bookmaker prices free for every punter. Pro adds scores, pace maps and value.',
};

export function landingVariant(key) {
  return LANDING_VARIANTS[key] || DEFAULT_LANDING;
}
