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
  'WARRACKNABEAL':                 'WARRACKNABEAL',
  'BETDELUXE WARRACKNABEAL':       'WARRACKNABEAL',
  // Added following the Warrnambool missing-from-Results investigation
  // (2026-08-20) -- a 60-day cross-reference of race_results/race_schedule
  // venue strings against AU_VENUE_STATE turned up these name variants for
  // already-known venues, sponsor prefixes not in SPONSOR_PREFIXES, etc.
  'DEVONPORT TAPETA SYNTHETIC':    'DEVONPORT',
  'ILLAWARRA GRANGE':              'KEMBLA GRANGE', // Illawarra Turf Club's home track
  'PICKLEBET PARK WODONGA':        'WODONGA',
  'PINJARRA PARK':                 'PINJARRA',
  'PIONEER PARK':                  'ALICE SPRINGS', // Pioneer Park is Alice Springs' track name
  'LAURA (Q)':                     'LAURA',
  // Mt Newman investigation (2026-08-22): RA's own Calendar.aspx lists this
  // venue as plain "Newman", but the everyrace Wizard CSV's Meeting column
  // uses "MT NEWMAN" -- without these, the two pipelines wrote two separate
  // today_meetings rows for the same physical meeting (confirmed live:
  // "MT NEWMAN" state:null from CSV import, "NEWMAN" state:WA
  // track_condition:Good from the backend's own scratchings scrape) that
  // never merged.
  'NEWMAN':                        'MT NEWMAN',
  'MOUNT NEWMAN':                  'MT NEWMAN',
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
  'WELLINGTON':'NSW',
  // Added 2026-08-20, from the Warrnambool investigation's 60-day
  // venue cross-reference (see the comment above VENUE_NORMALISE's
  // matching additions) — real AU tracks that had simply never been added.
  'ALBURY':'NSW','BALLINA':'NSW','CARINDA':'NSW','CASINO':'NSW',
  'COONABARABRAN':'NSW','FORBES':'NSW','GILGANDRA':'NSW','GUNNEDAH':'NSW',
  'LOUTH':'NSW','MOREE':'NSW','MURWILLUMBAH':'NSW','NARROMINE':'NSW',
  'NOWRA':'NSW','QUIRINDI':'NSW','SAPPHIRE COAST':'NSW','WARREN':'NSW',
  'FLEMINGTON':'VIC','CAULFIELD':'VIC','CAULFIELD HEATH':'VIC','MOONEE VALLEY':'VIC','SANDOWN':'VIC',
  'SANDOWN-HILLSIDE':'VIC','SANDOWN HILLSIDE':'VIC','SANDOWN LAKESIDE':'VIC',
  'BENDIGO':'VIC','BALLARAT':'VIC','BALLARAT SYN':'VIC','BALLARAT SYNTHETIC':'VIC',
  'GEELONG':'VIC','PAKENHAM':'VIC','CRANBOURNE':'VIC','MORNINGTON':'VIC',
  'SEYMOUR':'VIC','ECHUCA':'VIC','HAMILTON':'VIC','HORSHAM':'VIC',
  'SWAN HILL':'VIC','WODONGA':'VIC','WANGARATTA':'VIC','KILMORE':'VIC',
  'MOE':'VIC',
  'WARRACKNABEAL':'VIC',
  'BAIRNSDALE':'VIC','CASTERTON':'VIC','COLERAINE':'VIC','DONALD':'VIC',
  'MILDURA':'VIC','MURTOA':'VIC','SALE':'VIC','WARRNAMBOOL':'VIC',
  'EAGLE FARM':'QLD','DOOMBEN':'QLD','GOLD COAST':'QLD','GOLD COAST POLY':'QLD',
  'TOOWOOMBA':'QLD','WARWICK':'QLD','IPSWICH':'QLD','SUNSHINE COAST':'QLD',
  'ROCKHAMPTON':'QLD','TOWNSVILLE':'QLD','CAIRNS':'QLD','MACKAY':'QLD',
  'BEAUDESERT':'QLD','DALBY':'QLD','KILCOY':'QLD','BUNDABERG':'QLD',
  'GRAFTON':'QLD','LONGREACH':'QLD','ROMA':'QLD','GYMPIE':'QLD','EMERALD':'QLD',
  'CLONCURRY':'QLD','CHARTERS TOWERS':'QLD','MAREEBA':'QLD','CALOUNDRA':'QLD',
  'BARCALDINE':'QLD','GAYNDAH':'QLD','NANANGO':'QLD','STANTHORPE':'QLD',
  'TARA':'QLD','THANGOOL':'QLD','HOME HILL':'QLD',
  'ALPHA':'QLD','ATHERTON':'QLD','BLACKALL':'QLD','BOWEN':'QLD',
  'CHARLEVILLE':'QLD','CORFIELD':'QLD','CUNNAMULLA':'QLD','ESK':'QLD',
  'GATTON':'QLD','GLADSTONE':'QLD','GOONDIWINDI':'QLD','HUGHENDEN':'QLD',
  'ILFRACOMBE':'QLD','INGHAM':'QLD','INNISFAIL':'QLD','JULIA CREEK':'QLD',
  'LAURA':'QLD','MIDDLEMOUNT':'QLD','MUTTABURRA':'QLD','RICHMOND':'QLD',
  'STAMFORD':'QLD','TAMBO':'QLD','YEPPOON':'QLD',
  'MORPHETTVILLE':'SA','MORPHETTVILLE PARKS':'SA','MURRAY BRIDGE':'SA','GAWLER':'SA',
  'PORT AUGUSTA':'SA','NARACOORTE':'SA','BALAKLAVA':'SA','MOUNT GAMBIER':'SA',
  'KADINA':'SA',
  'BORDERTOWN':'SA','QUORN':'SA','ROXBY DOWNS':'SA','STRATHALBYN':'SA',
  'BELMONT PARK':'WA','BELMONT':'WA','ASCOT':'WA','PINJARRA':'WA',
  'BUNBURY':'WA','GERALDTON':'WA','KALGOORLIE':'WA','ALBANY':'WA',
  'NORTHAM':'WA','YORK':'WA','BROOME':'WA','PORT HEDLAND':'WA',
  'ESPERANCE':'WA','NARROGIN':'WA',
  'CARNARVON':'WA','DERBY':'WA','MARBLE BAR':'WA','ROEBOURNE':'WA',
  'DARWIN':'NT','ALICE SPRINGS':'NT','TENNANT CREEK':'NT',
  'KATHERINE':'NT',
  'HOBART':'TAS','LAUNCESTON':'TAS','SPREYTON':'TAS','DEVONPORT':'TAS',
  'THOROUGHBRED PARK':'ACT',
  'PAKENHAM SYNTHETIC':'VIC',
  'MOUNT ISA':'QLD',
  // Added 2026-08-22, from the Mt Newman missing-results investigation's
  // 30-day venue cross-reference (race_results/race_schedule/today_meetings
  // vs this allowlist) -- real AU tracks that had simply never been added.
  // State for each confirmed directly from today_meetings.state, which the
  // backend's RA-calendar scrape already writes correctly for these (it
  // derives state from which Calendar.aspx?State= page it found the venue
  // on, not from this allowlist), independent of this fix.
  'MT NEWMAN':'WA','ARAMAC':'QLD','BERRIGAN':'NSW','DINGO':'QLD','KUNUNURRA':'WA',
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

  // 4. Substring fallback — compare hyphen-normalised forms of name and each key (mirrors Python normalise_venue).
  // Word-boundary-aware, not a raw .includes(): a plain substring check lets
  // a short, generic name like "A Park" (the deliberate example of an
  // obscure, meant-to-stay-unrecognised meeting -- see isKnownAuVenue's
  // comment) falsely match inside an unrelated longer key like "PINJARRA
  // PARK" purely because the letters happen to line up mid-word ("...ARRA
  // PARK" contains "A PARK" starting mid-token, not at a real word break).
  // Requiring the match to start/end at a space or string edge keeps
  // legitimate whole-phrase matches (e.g. "MT ISA" inside "SPORTSBET MT
  // ISA") working while rejecting that kind of coincidental overlap.
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isWordBoundedSubstring = (haystack, needle) =>
    new RegExp(`(^|\\s)${escapeRegex(needle)}($|\\s)`).test(haystack);
  for (const [key, val] of Object.entries(VENUE_NORMALISE)) {
    const kn = key.replace(/-/g, ' ');
    if (spaced === kn || isWordBoundedSubstring(spaced, kn) || isWordBoundedSubstring(kn, spaced)) return val;
  }

  console.warn(`[venues] normaliseVenue: no match for "${raw}" — add to VENUE_NORMALISE if this is a known venue`);
  return name;
}
