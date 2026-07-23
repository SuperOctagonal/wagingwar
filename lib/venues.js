export const VENUE_NORMALISE = {
  'SANDOWN-HILLSIDE':              'SANDOWN',
  'SANDOWN HILLSIDE':              'SANDOWN',
  'SANDOWN LAKESIDE':              'SANDOWN',
  'PINJARRA SCARPSIDE':            'PINJARRA',
  'CANNON PARK':                   'CAIRNS',
  'ROSEHILL':                      'ROSEHILL GARDENS',
  'ROSEHILL GARDENS':              'ROSEHILL GARDENS',
  'ROSEHILL GARDENS RACECOURSE':   'ROSEHILL GARDENS',
  'AQUIS PARK GOLD COAST':         'GOLD COAST',
  'AQUIS PARK GOLD COAST POLY':    'GOLD COAST POLY',
  'THOMAS FARMS RC MURRAY BRIDGE': 'MURRAY BRIDGE',
  'THOMAS FARMS MURRAY BRIDGE':    'MURRAY BRIDGE',
  'RC MURRAY BRIDGE':              'MURRAY BRIDGE',
  'SPORTSBET SANDOWN HILLSIDE':    'SANDOWN',
  'BELMONT PARK':                  'BELMONT',
  'BALLARAT SYN':                  'BALLARAT SYNTHETIC',
  'SPORTSBET-BALLARAT SYNTHETIC':  'BALLARAT SYNTHETIC',
  'SPORTSBET BALLARAT SYNTHETIC':  'BALLARAT SYNTHETIC',
  'SOUTHSIDE PAKENHAM SYNTHETIC':  'PAKENHAM SYNTHETIC',
  'WAGGA':                         'WAGGA WAGGA',
  'WAGGA WAGGA':                   'WAGGA WAGGA',
  'CANBERRA':                      'THOROUGHBRED PARK',
  'SPORTSBET MT ISA':              'MOUNT ISA',
};

export const SPONSOR_PREFIXES = [
  'SPORTSBET-', 'SPORTSBET ', 'LADBROKES-', 'LADBROKES ',
  'BET365-', 'BET365 ', 'TAB-', 'TAB ', 'SOUTHSIDE ', 'AQUIS ',
];

export function stripSponsorPrefix(name) {
  const upper = (name || '').toUpperCase();
  for (const p of SPONSOR_PREFIXES) {
    if (upper.startsWith(p)) return name.slice(p.length).trim();
  }
  return (name || '').trim();
}

export function normaliseVenue(raw) {
  if (!raw) return '';
  const cleaned = raw.toUpperCase().trim();

  // 1. Exact match
  if (VENUE_NORMALISE[cleaned]) return VENUE_NORMALISE[cleaned];

  // 2. Sponsor-prefix strip + exact match
  const stripped = stripSponsorPrefix(raw).toUpperCase().trim();
  if (stripped !== cleaned && VENUE_NORMALISE[stripped]) return VENUE_NORMALISE[stripped];

  const name = stripped !== cleaned ? stripped : cleaned;

  // 3. Hyphen → space normalise + exact match (e.g. "SANDOWN-LAKESIDE" → "SANDOWN LAKESIDE" → "SANDOWN")
  const spaced = name.replace(/-/g, ' ');
  if (spaced !== name && VENUE_NORMALISE[spaced]) return VENUE_NORMALISE[spaced];

  // 4. Substring fallback — compare hyphen-normalised forms of name and each key (mirrors Python normalise_venue)
  for (const [key, val] of Object.entries(VENUE_NORMALISE)) {
    const kn = key.replace(/-/g, ' ');
    if (spaced === kn || spaced.includes(kn) || kn.includes(spaced)) return val;
  }

  console.warn(`[venues] normaliseVenue: no match for "${raw}" — add to VENUE_NORMALISE if this is a known venue`);
  return name;
}
