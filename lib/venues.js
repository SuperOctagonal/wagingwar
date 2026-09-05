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

  // Added 2026-09-06, live-odds-coverage-gap investigation: explicit self-map
  // entries so an exact match wins before the substring fallback gets a
  // chance to misresolve a bare venue name into an unrelated, more specific
  // key. Confirmed live: PuntersEdge's raw venue field for today's actual
  // Randwick Inside meeting was just "Randwick" (no "Ins"/"Kensington"
  // qualifier) -- with no explicit 'RANDWICK' key, that fell through to the
  // substring fallback, which found "RANDWICK" as a word-bounded prefix of
  // the key "RANDWICK INS" and returned that -- right by coincidence today
  // (Randwick Ins is what's actually racing), but wrong on any day the main
  // Randwick track races instead, since it would misfile real Randwick-
  // proper data under RANDWICK INS. Same fix for 'MORPHETTVILLE' /
  // 'MORPHETTVILLE PARKS': PuntersEdge's raw "Morphettville" had no fallback
  // rescue at all (no key contains it as a substring), so it resolved to a
  // bare "MORPHETTVILLE" that matches no real venue today -- Morphettville
  // Parks races were silently dropped rather than misfiled.
  //
  // Full-table audit for the same shape of risk (a bare name that's a
  // word-bounded prefix of a different, more specific key) found one more
  // live bug: 'BALLARAT' had no self-map and would resolve to 'BALLARAT
  // SYNTHETIC' via the 'BALLARAT SYN' key -- wrong, since Ballarat and
  // Ballarat Synthetic are different physical tracks. Also added self-maps
  // for SANDOWN/BELMONT/PINJARRA/DEVONPORT/LAURA even though those weren't
  // actually producing wrong answers (the substring fallback already landed
  // on the same value a correct self-map would give, since those pairs are
  // deliberate same-venue merges) -- for robustness/clarity, not because
  // they were broken. Every other prefix found in the audit (SPORTSBET,
  // AQUIS, THOMAS FARMS, RC, SOUTHSIDE, PICKLEBET, BETDELUXE, CANNON, MT,
  // MOUNT, ILLAWARRA, PIONEER, CANBERRA RACING) is a sponsor-prefix or
  // partial-word fragment no real feed would ever send as a standalone raw
  // venue name, so left alone.
  'RANDWICK':                      'RANDWICK',
  'MORPHETTVILLE':                 'MORPHETTVILLE',
  'MORPHETTVILLE PARKS':           'MORPHETTVILLE PARKS',
  'BALLARAT':                      'BALLARAT',
  'SANDOWN':                       'SANDOWN',
  'BELMONT':                       'BELMONT',
  'PINJARRA':                      'PINJARRA',
  'DEVONPORT':                     'DEVONPORT',
  'LAURA':                         'LAURA',
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
  // Added 2026-08-31, from the Corowa missing-from-Results investigation's
  // 60-day venue cross-reference (race_results/race_schedule/today_meetings
  // vs this allowlist) -- real AU tracks that had simply never been added.
  // State for each confirmed from today_meetings.state (RA-calendar-derived)
  // except BEAUMONT, whose today_meetings.state was null (CSV-fallback path
  // only) -- corroborated instead via RA's own meeting-transfer notices,
  // which use "Beaumont" as the alternate track for Newcastle (NSW) meetings.
  'COROWA':'NSW','GULARGAMBONE':'NSW','MUNGINDI':'NSW','TUNCURRY':'NSW','BEAUMONT':'NSW',
  'BETOOTA':'QLD','MCKINLAY':'QLD','OAK PARK':'QLD','SPRINGSURE':'QLD',
  // Added 2026-09-05, Birdsville-missing-from-Results investigation:
  // isKnownAuVenue('BIRDSVILLE') was silently excluding all 12 real
  // race_results rows from the Results page's meeting-card list -- the JS
  // twin of the same gap already fixed on the Python side (venues.py,
  // 2026-09-04 audit). State confirmed from today_meetings.state.
  'BIRDSVILLE':'QLD',
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

// Module-level, not per-call -- caps the unmatched-venue warning at once
// per unique raw value for the life of the process/session, instead of
// once per row. See the warning site below for why this matters (this
// function runs inside per-row loops in several hot server routes).
const warnedUnmatchedVenues = new Set();

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

  // Not finding an alias here is the EXPECTED, majority-case outcome for any
  // venue whose source name is already canonical (e.g. "EAGLE FARM",
  // "HAWKESBURY") -- VENUE_NORMALISE only ever holds typo/alias variants,
  // never the canonical names themselves, so a clean already-correct name
  // will always reach this point. Only warn if `name` ALSO isn't a real
  // AU_VENUE_STATE key -- that's the actual "genuinely unrecognised venue"
  // case this warning exists for. Previously warned unconditionally here,
  // which fired on every already-correct venue (confirmed live: EAGLE FARM,
  // HAWKESBURY, ALBURY, WYONG, BENDIGO, GEELONG and more, none of them
  // actually broken -- AU_VENUE_STATE[name] already resolved fine in the
  // caller every time).
  if (!AU_VENUE_STATE[name]) {
    // Deduplicated to once per unique unmatched value for the life of the
    // process, not once per row -- this function runs inside per-row
    // .map()/.filter() loops in several server routes (results-ranks,
    // serverResultsData, serverInsightsData, and this file's own callers),
    // so a genuinely unmapped venue appearing across a 30-day window's
    // worth of rows previously meant one warning per row, not per venue
    // (confirmed live: a single venue logged 8 times in a 786-row sample).
    // At worst that's thousands of synchronous console.warn calls in one
    // request -- a real perf cost on its own, independent of whether the
    // underlying match was ever actually wrong.
    if (!warnedUnmatchedVenues.has(raw)) {
      warnedUnmatchedVenues.add(raw);
      console.warn(`[venues] normaliseVenue: no match for "${raw}" — add to VENUE_NORMALISE if this is a known venue`);
    }
  }
  return name;
}

// Maps the CSV form-history "Crse" abbreviation (e.g. "Cant", "Newc", "Wfrm",
// "Rani") to a canonical venue name, for resolving a runner's past-run winner
// from race_results (see app/races/page.js's Form tab getWinner()). These are
// short internal course codes from the everyrace Wizard CSV -- unrelated to
// any RA calendar name, and normaliseVenue() has no way to recognise them on
// its own (confirmed empty: a 30-day cross-reference against VENUE_NORMALISE
// found zero of these ~280 distinct codes with an existing entry).
//
// Built 2026-09-06 by empirically joining each (horse_name, run_date) pair
// from race_cards' lastRunDetails against race_results (same horse, same
// date -> that row's real venue) rather than guessed from memory -- a wrong
// guess here would display an actively incorrect winner name, worse than the
// blank it replaces. Each value below is the venue race_results actually
// recorded for that code, by far the most common match where a code had
// multiple raw spellings (e.g. "BUNDABERG" vs "SPORTSBET BUNDABERG" both
// normalise to the same venue anyway via normaliseVenue() below). Three
// codes (MDGE, MTNE, RICH) had only a single matching sample each -- kept
// since the abbreviation itself is unambiguous and consistent with the
// resolved name, but lower-confidence than the rest.
//
// Deliberately incomplete: ~108 codes found in the same 30-day window (NZ/
// international tracks like TAUP/PUK/TE A/TE R, country codes like FR/GB/HK/
// IR, and AU codes with no correlatable race_results row in the window) are
// NOT here. Falling through to normaliseVenue()'s existing '—' result for
// those is correct, not a gap -- an overseas run genuinely has no AU
// race_results row to find a winner in.
const CRSE_ABBREV = {
  ALBY: 'ALBURY', ALPH: 'ALPHA', ARMC: 'ARAMAC', ATHN: 'ATHERTON', BALL: 'BALLINA',
  BALT: 'BALLARAT', BARC: 'BARCALDINE', BARN: 'BAIRNSDALE', BATH: 'BATHURST',
  BBRG: 'BUNDABERG', BDGO: 'BENDIGO', BEAN: 'NEWCASTLE', BEAQ: 'BEAUDESERT',
  BEGN: 'BERRIGAN', BELM: 'BELMONT', BLAC: 'BLACKALL', BLUF: 'BLUFF',
  BLVA: 'BALAKLAVA', BORD: 'BORDERTOWN', BOWN: 'BOWEN', BRME: 'BROOME',
  BRTS: 'BALLARAT SYNTHETIC', BTTA: 'BETOOTA', BUNB: 'BUNBURY', CAIR: 'CAIRNS',
  CANA: 'THOROUGHBRED PARK', CANT: 'CANTERBURY', CARI: 'CARINDA', CARN: 'CARNARVON',
  CASO: 'CASINO', CAST: 'CASTERTON', CAUH: 'CAULFIELD HEATH', CAUL: 'CAULFIELD',
  CBRN: 'COONABARABRAN', CDRA: 'SUNSHINE COAST', CHAR: 'CHARLEVILLE', CLER: 'CLERMONT',
  COFF: 'COFFS HARBOUR', COLR: 'COLERAINE', CORF: 'CORFIELD', COWA: 'COWRA',
  CRAN: 'CRANBOURNE', CUNA: 'CUNNAMULLA', DALB: 'DALBY', DARW: 'DARWIN',
  DERB: 'DERBY', DEVS: 'DEVONPORT', DING: 'DINGO', DOND: 'DONALD', DOOM: 'DOOMBEN',
  DUBO: 'DUBBO', ECHA: 'ECHUCA', EFRM: 'EAGLE FARM', ELWK: 'HOBART', EMRD: 'EMERALD',
  ESK: 'ESK', FLEM: 'FLEMINGTON', FORB: 'FORBES', GATT: 'GATTON', GCOP: 'GOLD COAST POLY',
  GCST: 'GOLD COAST', GEEL: 'GEELONG', GILG: 'GILGANDRA', GLAD: 'GLADSTONE',
  GOON: 'GOONDIWINDI', GOSF: 'GOSFORD', GOUL: 'GOULBURN', GRAF: 'GRAFTON',
  GUND: 'GUNDAGAI', GUNN: 'GUNNEDAH', GYMP: 'GYMPIE', HAML: 'HAMILTON',
  HAWK: 'HAWKESBURY', HHIL: 'HOME HILL', HUGH: 'HUGHENDEN', ILFR: 'ILFRACOMBE',
  ILGR: 'KEMBLA GRANGE', INGM: 'INGHAM', INNI: 'INNISFAIL', INVL: 'INVERELL',
  IPSH: 'IPSWICH', JCRK: 'JULIA CREEK', KALG: 'KALGOORLIE', KATH: 'KATHERINE',
  KEMB: 'KEMBLA GRANGE', KILC: 'KILCOY', KUNN: 'KUNUNURRA', LONG: 'LONGREACH',
  LOTH: 'LOUTH', LURA: 'LAURA (Q)', MACK: 'MACKAY', MBAR: 'MARBLE BAR',
  MDGE: 'MUDGEE', MIDT: 'MIDDLEMOUNT', MILD: 'MILDURA', MISA: 'MOUNT ISA',
  MOE: 'MOE', MORE: 'MOREE', MORK: 'MORPHETTVILLE PARKS', MORP: 'MORPHETTVILLE',
  MORU: 'MORUYA', MTGR: 'MOUNT GAMBIER', MTNE: 'MT NEWMAN', MURB: 'MURRAY BRIDGE',
  MURT: 'MURTOA', MURW: 'MURWILLUMBAH', MUSW: 'MUSWELLBROOK', MUTT: 'MUTTABURRA',
  NARA: 'NARACOORTE', NEWC: 'NEWCASTLE', NNGO: 'NANANGO', NORT: 'NORTHAM',
  NRAN: 'NARRANDERA', NRME: 'NARROMINE', NWRA: 'NOWRA', OAKP: 'OAK PARK',
  PAKS: 'PAKENHAM SYNTHETIC', PAUG: 'PORT AUGUSTA', PINJ: 'PINJARRA',
  PINS: 'PINJARRA', PMAC: 'PORT MACQUARIE', PRPK: 'ALICE SPRINGS',
  'PT H': 'PORT HEDLAND', QUIR: 'QUIRINDI', QURN: 'QUORN', RAND: 'RANDWICK',
  RANI: 'RANDWICK INS', REOB: 'ROEBOURNE', RICH: 'RICHMOND', ROCK: 'ROCKHAMPTON',
  ROMA: 'ROMA', ROSE: 'ROSEHILL GARDENS', ROXB: 'ROXBY DOWNS', SALE: 'SALE',
  SANH: 'SANDOWN', SANL: 'SANDOWN', SAPH: 'SAPPHIRE COAST', SCON: 'SCONE',
  SEYM: 'SEYMOUR', SHIL: 'SWAN HILL', STAM: 'STAMFORD', STBN: 'STRATHALBYN',
  TAMB: 'TAMBO', TAMW: 'TAMWORTH', TARE: 'TAREE', THAN: 'THANGOOL',
  TNCK: 'TENNANT CREEK', TOOW: 'TOOWOOMBA', TOWN: 'TOWNSVILLE', TUNC: 'TUNCURRY',
  WAGA: 'WAGGA WAGGA', WANG: 'WANGARATTA', WFRM: 'WARWICK FARM', WNBL: 'WARRNAMBOOL',
  WODG: 'WODONGA', WRAW: 'WARWICK', WRBL: 'WARRACKNABEAL', WREN: 'WARREN',
  WYON: 'WYONG', YEPP: 'YEPPOON',
};

// Bare-name -> sub-venue fallback for feeds (e.g. PuntersEdge) that report
// only the city/track group name with no sub-venue qualifier -- "Randwick"
// for the Randwick Inside/Kensington course, "Morphettville" for
// Morphettville Parks. Ported from worker.py's existing RANDWICK/RANDWICK
// INS disambiguation (see get_target_race_count() and its call site in
// run_scrape()): only substitute when the bare name has NO real race data
// for today and the fallback venue does -- never override a day the main
// track is genuinely racing under its own bare name.
export const AMBIGUOUS_VENUE_FALLBACKS = {
  RANDWICK: 'RANDWICK INS',
  MORPHETTVILLE: 'MORPHETTVILLE PARKS',
};

// Resolves a CSV "Crse" abbreviation to a canonical venue name. Checks
// CRSE_ABBREV first (these codes don't survive normaliseVenue()'s own
// matching -- see that constant's comment), then falls back to
// normaliseVenue() itself so any code that already happens to resolve
// correctly there keeps working unchanged.
export function resolveCrseAbbrev(crse) {
  if (!crse) return '';
  const key = crse.trim().toUpperCase();
  return CRSE_ABBREV[key] || normaliseVenue(crse);
}
