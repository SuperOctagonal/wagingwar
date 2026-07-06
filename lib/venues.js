export const VENUE_NORMALISE = {
  'SANDOWN-HILLSIDE':              'SANDOWN',
  'SANDOWN HILLSIDE':              'SANDOWN',
  'SANDOWN LAKESIDE':              'SANDOWN',
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
  const cleaned = (raw || '').toUpperCase().trim();
  if (VENUE_NORMALISE[cleaned]) return VENUE_NORMALISE[cleaned];
  const stripped = stripSponsorPrefix(raw).toUpperCase().trim();
  if (stripped !== cleaned) {
    if (VENUE_NORMALISE[stripped]) return VENUE_NORMALISE[stripped];
    for (const [key, val] of Object.entries(VENUE_NORMALISE)) {
      if (stripped === key || stripped.includes(key) || key.includes(stripped)) return val;
    }
    return stripped;
  }
  for (const [key, val] of Object.entries(VENUE_NORMALISE)) {
    if (cleaned.includes(key) || key.includes(cleaned)) return val;
  }
  return cleaned;
}
