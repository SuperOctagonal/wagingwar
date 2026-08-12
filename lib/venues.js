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
  'CANBERRA ACTON':                'THOROUGHBRED PARK',
  'CANBERRA RACING CLUB':          'THOROUGHBRED PARK',
  'SPORTSBET MT ISA':              'MOUNT ISA',
  'DEVONPORT SYNTHETIC':           'DEVONPORT',
  'KENSINGTON':                    'RANDWICK INS',
  'RANDWICK INS':                  'RANDWICK INS',
  'MT GAMBIER':                    'MOUNT GAMBIER',
  'CAULFIELD':                     'CAULFIELD',
  'CAULFIELD HEATH':               'CAULFIELD HEATH',
};

// Canonical AU venue -> state allowlist. Single source of truth for "is this
// a real Australian venue" -- previously duplicated (and already drifted:
// this copy had CAULFIELD HEATH, app/api/import-csv/route.js's copy didn't)
// across app/api/upload-race-csv/route.js and app/api/import-csv/route.js.
// Both now import this instead of keeping their own local copy.
export const AU_VENUE_STATE = {
  'ROSEHILL':'NSW','ROSEHILL GARDENS':'NSW','NEWCASTLE':'NSW','RANDWICK':'NSW',
  'RANDWICK INS':'NSW',
  'WARWICK FARM':'NSW','KEMBLA GRANGE':'NSW','GOSFORD':'NSW','HAWKESBURY':'NSW',
  'NARRANDERA':'NSW','MUDGEE':'NSW','GOULBURN':'NSW','BATHURST':'NSW','ORANGE':'NSW',
  'TAMWORTH':'NSW','GRAFTON':'NSW','LISMORE':'NSW','ARMIDALE':'NSW','TAREE':'NSW',
  'COFFS HARBOUR':'NSW','PORT MACQUARIE':'NSW','DUBBO':'NSW','WAGGA WAGGA':'NSW',
  'MUSWELLBROOK':'NSW','INVERELL':'NSW','MORUYA':'NSW','SCONE':'NSW','WYONG':'NSW',
  'CANTERBURY':'NSW','QUEANBEYAN':'NSW','GUNDAGAI':'NSW','COWRA':'NSW',
  'COOTAMUNDRA':'NSW','YOUNG':'NSW','PARKES':'NSW','BROKEN HILL':'NSW',
  'FLEMINGTON':'VIC','CAULFIELD':'VIC','CAULFIELD HEATH':'VIC','MOONEE VALLEY':'VIC','SANDOWN':'VIC',
  'SANDOWN-HILLSIDE':'VIC','SANDOWN HILLSIDE':'VIC','SANDOWN LAKESIDE':'VIC',
  'BENDIGO':'VIC','BALLARAT':'VIC','BALLARAT SYN':'VIC','BALLARAT SYNTHETIC':'VIC',
  'GEELONG':'VIC','PAKENHAM':'VIC','CRANBOURNE':'VIC','MORNINGTON':'VIC',
  'SEYMOUR':'VIC','ECHUCA':'VIC','HAMILTON':'VIC','HORSHAM':'VIC',
  'SWAN HILL':'VIC','WODONGA':'VIC','WANGARATTA':'VIC','KILMORE':'VIC',
  'EAGLE FARM':'QLD','DOOMBEN':'QLD','GOLD COAST':'QLD','GOLD COAST POLY':'QLD',
  'TOOWOOMBA':'QLD','WARWICK':'QLD','IPSWICH':'QLD','SUNSHINE COAST':'QLD',
  'ROCKHAMPTON':'QLD','TOWNSVILLE':'QLD','CAIRNS':'QLD','MACKAY':'QLD',
  'BEAUDESERT':'QLD','DALBY':'QLD','KILCOY':'QLD','BUNDABERG':'QLD',
  'GRAFTON':'QLD','LONGREACH':'QLD','ROMA':'QLD','GYMPIE':'QLD','EMERALD':'QLD',
  'CLONCURRY':'QLD','CHARTERS TOWERS':'QLD','MAREEBA':'QLD','CALOUNDRA':'QLD',
  'BARCALDINE':'QLD','GAYNDAH':'QLD','NANANGO':'QLD','STANTHORPE':'QLD',
  'TARA':'QLD','THANGOOL':'QLD','HOME HILL':'QLD',
  'MORPHETTVILLE':'SA','MORPHETTVILLE PARKS':'SA','MURRAY BRIDGE':'SA','GAWLER':'SA',
  'PORT AUGUSTA':'SA','NARACOORTE':'SA','BALAKLAVA':'SA','MOUNT GAMBIER':'SA',
  'KADINA':'SA',
  'BELMONT PARK':'WA','BELMONT':'WA','ASCOT':'WA','PINJARRA':'WA',
  'BUNBURY':'WA','GERALDTON':'WA','KALGOORLIE':'WA','ALBANY':'WA',
  'NORTHAM':'WA','YORK':'WA','BROOME':'WA','PORT HEDLAND':'WA',
  'ESPERANCE':'WA','NARROGIN':'WA',
  'DARWIN':'NT','ALICE SPRINGS':'NT','TENNANT CREEK':'NT',
  'HOBART':'TAS','LAUNCESTON':'TAS','SPREYTON':'TAS','DEVONPORT':'TAS',
  'THOROUGHBRED PARK':'ACT',
  'PAKENHAM SYNTHETIC':'VIC',
  'MOUNT ISA':'QLD',
};

// Fail-closed venue check for "is this a real venue on our AU allowlist" --
// used to exclude NZ (and any other non-AU) meetings from the Races/Results
// pipeline at import time. Deliberately the inverse of the old approach
// (name-match a hardcoded NZ blocklist, include everything else by default):
// a blocklist can only ever list tracks someone thought to add, so an
// obscure meeting (e.g. "A Park") sails through unrecognised. An allowlist
// excludes anything unrecognised by default instead.
export function isKnownAuVenue(raw) {
  return !!AU_VENUE_STATE[normaliseVenue(raw)];
}

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
