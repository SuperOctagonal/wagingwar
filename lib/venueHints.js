// Category-level hints for the "Guess the Venue" daily puzzle, shown before
// the first guess. Curated for venues with a well-known, verifiable feature
// race or characteristic; every other venue in the candidate word list
// (app/api/games/puzzle/daily/route.js's CANDIDATE_WORDS) falls back to a
// generic state-based hint rather than a fabricated racing fact — explicit
// call not to invent trivia for venues without a solid, confidently-known
// detail.
const CURATED_HINTS = {
  FLEMINGTON:  "Home of the Melbourne Cup, Australia's most famous race",
  RANDWICK:    'Hosts The Everest, the world’s richest race on turf',
  CAULFIELD:   'Hosts the Caulfield Cup each spring',
  ROSEHILL:    'Hosts the Golden Slipper Stakes, a top race for two-year-olds',
  DOOMBEN:     'Hosts the Doomben 10,000 during the Brisbane winter carnival',
  CANTERBURY:  'Hosts the Canterbury Stakes, a Group 1 sprint',
  BENDIGO:     'Hosts the Bendigo Cup each November',
  BALLARAT:    'Hosts the Ballarat Cup',
  GEELONG:     'Hosts the Geelong Cup, traditionally run in October',
  HOBART:      'Hosts the Hobart Cup',
  LAUNCESTON:  'Hosts the Launceston Cup',
  DARWIN:      'Hosts the Darwin Cup Carnival in the dry season',
  NEWCASTLE:   'Hosts the Newcastle Gold Cup',
};

// Generic fallback so every candidate word still gets a hint — a plain,
// unembellished fact (state) rather than guessing at a feature race this
// venue may or may not actually have.
export function getVenueHint(venue, state) {
  const curated = CURATED_HINTS[(venue || '').toUpperCase()];
  if (curated) return curated;
  const stateNames = { NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania', NT: 'the Northern Territory', ACT: 'the ACT' };
  const stateName = stateNames[state] || 'Australia';
  return `An Australian racecourse in ${stateName}`;
}
