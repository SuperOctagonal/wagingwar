// Pure CSV parsing + race-building functions extracted from index.html.
// buildRaces() returns {allRaces, allVenues} with no side effects.

export const HEADER_ALIASES = [
  ['raceNum',      ['race number','racenumber','race no','raceno','race']],
  ['raceName',     ['race name','racename','name']],
  ['distance',     ['distance','dist']],
  ['cls',          ['class','race class']],
  ['prize',        ['prize money','prizemoney','prize']],
  ['time',         ['time','race time']],
  ['date',         ['date','race date']],
  ['venue',        ['meeting','venue','track','course']],
  ['horse',        ['horse','horse name']],
  ['tab',          ['tab number','tabnumber','tab no','tab #','tab']],
  ['BP',           ['bp','barrier','barrier position','draw']],
  ['Weight',       ['weight','wgt']],
  ['age',          ['age',' age']],
  ['scratched',    ['scratched','scr']],
  ['Starts',       ['starts','career starts']],
  ['Wins',         ['wins','career wins']],
  ['Seconds',      ['seconds','2nds','career seconds','2nd']],
  ['Thirds',       ['thirds','3rds','career thirds','3rd']],
  ['Places',       ['places','career places']],
  ['Last Finish pos',['last finish pos','last finish','last pos','lastfin']],
  ['Best Form Panel',['best form panel','best form']],
  ['Recent Form Panel',['recent form panel','recent form']],
  ['Wtime Panel',  ['wtime panel','wtime','time panel']],
  ['Wizard Panel', ['wizard panel','wizard']],
  ['Wrat',         ['wrat','class rtg','class rating']],
  ['Last WFA Rating',['last wfa rating','wfa rating','wfarat']],
  ['Average Prizemoney',['average prizemoney','avg prizemoney','average prize','avg prize']],
  ['Joc Loc12m Wins',['joc loc12m wins','joc local wins','jockey local wins','joc wins 12m','joc loc 12m wins']],
  ['Joc Loc12m Starts',['joc loc12m starts','joc local starts','joc starts 12m','joc loc 12m starts']],
  ['Trat',         ['trat','trainer rating']],
  ['Trn Loc12m Wins',['trn loc12m wins','trn local wins','trainer local wins']],
  ['Trn Loc12m Starts',['trn loc12m starts','trn local starts']],
  ['odds',         ['odds','market odds','win odds']],
  ['Course Wins',  ['course wins','crs wins']],
  ['Course Starts',['course starts','crs starts']],
  ['Course Places',['course places','crs places']],
  ['Distance Wins',['distance wins','dist wins']],
  ['Distance Starts',['distance starts','dist starts']],
  ['Distance Places',['distance places','dist places']],
  ['Good Wins',    ['good wins','gd wins']],
  ['Soft Wins',    ['soft wins']],
  ['Soft Starts',  ['soft starts']],
  ['Heavy Wins',   ['heavy wins']],
  ['Heavy Starts', ['heavy starts']],
  ['Class Change', ['class change']],
  ['Espd',         ['espd']],
  ['Pace',         ['pace']],
  ['Good Starts',  ['good starts','gd starts']],
  ['Last SP',      ['last sp','last start price']],
  ['Last-1 SP',    ['last-1 sp','last1 sp']],
  ['Last-2 SP',    ['last-2 sp','last2 sp']],
  ['Last-3 SP',    ['last-3 sp','last3 sp']],
  ['Last Margin',  ['last margin','last finish margin']],
  ['Last-1 Margin',['last-1 margin']],
  ['Last-2 Margin',['last-2 margin']],
  ['Last-3 Margin',['last-3 margin']],
  ['Last Date',       ['last date']],
  ['Last-1 Date',     ['last-1 date']],
  ['Last-2 Date',     ['last-2 date']],
  ['Last-3 Date',     ['last-3 date']],
  ['Last-1 Dist',     ['last-1 dist','last-1 distance']],
  ['Last-2 Dist',     ['last-2 dist','last-2 distance']],
  ['Last-3 Dist',     ['last-3 dist','last-3 distance']],
  ['Last-1 Crse',     ['last-1 crse','last-1 course']],
  ['Last-2 Crse',     ['last-2 crse','last-2 course']],
  ['Last-3 Crse',     ['last-3 crse','last-3 course']],
  ['Last-1 Class',    ['last-1 class','last-1 cls']],
  ['Last-2 Class',    ['last-2 class','last-2 cls']],
  ['Last-3 Class',    ['last-3 class','last-3 cls']],
  ['Last Weight',     ['last weight']],
  ['Last-1 Weight',   ['last-1 weight']],
  ['Last-2 Weight',   ['last-2 weight']],
  ['Last-3 Weight',   ['last-3 weight']],
  ['Last-1 Base Rating',['last-1 base rating','last-1 base']],
  ['Last-2 Base Rating',['last-2 base rating','last-2 base']],
  ['Last-3 Base Rating',['last-3 base rating','last-3 base']],
  ['Last-1 WFA Rating', ['last-1 wfa rating','last-1 wfa']],
  ['Last-2 WFA Rating', ['last-2 wfa rating','last-2 wfa']],
  ['Last-3 WFA Rating', ['last-3 wfa rating','last-3 wfa']],
  ['Jockey',       ['jockey','joc']],
  ['Trainer',      ['trainer','trn']],
  ['Days Since Last Start',['days since last start','days since']],
  ['Allowance',    ['allowance','allow','claim']],
  ['Last-1 Finish pos',['last-1 finish pos','last-1 finish','last1 finish pos']],
  ['Last-2 Finish pos',['last-2 finish pos','last-2 finish','last2 finish pos']],
  ['Last-3 Finish pos',['last-3 finish pos','last-3 finish','last3 finish pos']],
  ['Last-1 WFA Rating',['last-1 wfa rating','last1 wfa rating']],
  ['Last-2 WFA Rating',['last-2 wfa rating','last2 wfa rating']],
  ['Last-3 WFA Rating',['last-3 wfa rating','last3 wfa rating']],
  ['Last Base Rating', ['last base rating','last base']],
  ['Last Dist',        ['last dist','last distance']],
  ['Last Class',       ['last class','last cls']],
  ['Last Crse',        ['last crse','last course']],
  ['Cur Peak',         ['cur peak','current peak']],
  ['Last Peak',        ['last peak']],
  ['sex',              ['sex']],
  ['Form',             ['form']],
  ['Sire',             ['sire']],
  ['Dam',              ['dam']],
  ['G Sire',           ['g sire','gsire','grand sire','grandsire']],
  ['Win Distances',    ['win distances','win dist']],
  ['Joc Loc12m Places',['joc loc12m places','joc local places','jockey local places']],
  ['Trn Loc12m Places',['trn loc12m places','trn local places','trainer local places']],
  ['Joc/Trn Wins',     ['joc/trn wins','jockey trainer wins']],
  ['Joc/Trn Places',   ['joc/trn places','jockey trainer places']],
  ['Joc/Trn Starts',   ['joc/trn starts','jockey trainer starts']],
  ['1Up Wins',         ['1up wins']],
  ['1Up Places',       ['1up places']],
  ['1Up Starts',       ['1up starts']],
  ['2Up Wins',         ['2up wins']],
  ['2Up Places',       ['2up places']],
  ['2Up Starts',       ['2up starts']],
  ['Last Finish Position',['last finish position']],
  ['Last-1 Finish Position',['last-1 finish position']],
  ['Last-2 Finish Position',['last-2 finish position']],
  ['Last-3 Finish Position',['last-3 finish position']],
  ['Win Jock Back On', ['win jock back on','win jock back']],
  ['Cur RFS Wins',     ['cur rfs wins']],
  ['Good Places',      ['good places','gd places']],
  ['Soft Places',      ['soft places']],
  ['Heavy Places',     ['heavy places']],
  ['Firm Wins',        ['firm wins']],
  ['Firm Places',      ['firm places']],
  ['Firm Starts',      ['firm starts']],
  ['TPPC-Front',       ['tppc-front']],
  ['TPPC-Onpc',        ['tppc-onpc']],
  ['TPPC-Mid',         ['tppc-mid']],
  ['TPPC-Back',        ['tppc-back']],
  ['Field Strength',   ['field strength']],
  ['Impact Form',      ['impact form']],
  ['Impact Dist',      ['impact dist']],
  ['Course/Dist Wins', ['course/dist wins']],
  ['Course/Dist Places',['course/dist places']],
  ['Course/Dist Starts',['course/dist starts']],
];

export function detectHeaders(hdrs) {
  const map = {};
  const lc = hdrs.map(h => h.trim().toLowerCase());
  HEADER_ALIASES.forEach(([key, aliases]) => {
    for (const a of aliases) {
      const i = lc.indexOf(a);
      if (i >= 0) { map[key] = hdrs[i].trim(); break; }
    }
  });
  return map;
}

export function safeNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s.toLowerCase() === 'na' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) || !isFinite(n) ? null : n;
}

function col(row, key, detectedHeaders) {
  const h = detectedHeaders[key];
  return h !== undefined ? row[h] : undefined;
}

export function parseRow(line) {
  const c = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; }
    else if (ch === ',' && !q) { c.push(cur); cur = ''; }
    else cur += ch;
  }
  c.push(cur);
  return c;
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const hdrs = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const v = parseRow(lines[i]);
    if (v.length < 3) continue;
    const o = {};
    hdrs.forEach((h, j) => { o[h.trim()] = (v[j] || '').trim(); });
    rows.push(o);
  }
  return { hdrs, rows };
}

// Pure function — returns {allRaces, allVenues, raceKeys} with no side effects
export function buildRaces({ hdrs, rows }) {
  const allRaces = {};
  const allVenues = {};
  const dh = detectHeaders(hdrs);
  const c = (row, key) => col(row, key, dh);

  rows.forEach(r => {
    const rnum = c(r, 'raceNum') || '';
    if (!rnum) return;
    const venue0 = c(r, 'venue') || 'Unknown';
    const key = venue0.replace(/\s+/g, '_') + '_R' + rnum;

    if (!allRaces[key]) {
      allRaces[key] = {
        num: rnum,
        name: c(r, 'raceName') || '',
        dist: c(r, 'distance') || '',
        cls: c(r, 'cls') || '',
        prize: (c(r, 'prize') || '').replace(/[",]/g, '').trim(),
        time: c(r, 'time') || '',
        date: c(r, 'date') || '',
        venue: venue0,
        horses: [],
      };
    }

    const scr = (c(r, 'scratched') || '').trim();
    const scratched = scr === '1' || scr.toLowerCase() === 'scratched' || /^(true|y|yes)$/i.test(scr);

    const starts   = safeNum(c(r, 'Starts'));
    const wins     = safeNum(c(r, 'Wins'));
    const seconds  = safeNum(c(r, 'Seconds'));
    const thirds   = safeNum(c(r, 'Thirds'));
    const places   = safeNum(c(r, 'Places'));
    const hasStarts = starts > 0;
    const sec2 = seconds !== null ? seconds : (places !== null ? Math.round(places / 2) : 0);
    const thr3 = thirds !== null ? thirds : (places !== null ? places - sec2 : 0);

    const cw = safeNum(c(r, 'Course Wins')) ?? 0;
    const cs = safeNum(c(r, 'Course Starts')) ?? 0;
    const dw = safeNum(c(r, 'Distance Wins')) ?? 0;
    const ds = safeNum(c(r, 'Distance Starts')) ?? 0;
    const gw = safeNum(c(r, 'Good Wins')) ?? 0;
    const gs = safeNum(c(r, 'Good Starts')) ?? 0;
    const sw = safeNum(c(r, 'Soft Wins')) ?? 0;
    const ss = safeNum(c(r, 'Soft Starts')) ?? 0;
    const hw = safeNum(c(r, 'Heavy Wins')) ?? 0;
    const hs = safeNum(c(r, 'Heavy Starts')) ?? 0;

    const spCols = ['Last SP', 'Last-1 SP', 'Last-2 SP', 'Last-3 SP'];
    const spVals = spCols.map(k => safeNum(c(r, k))).filter(v => v !== null && v > 0);
    const avgSP = spVals.length > 0 ? spVals.reduce((a, b) => a + b, 0) / spVals.length : null;
    const spWeight = spVals.length > 0 ? spVals.length / 4 : 0;

    const mgCols = ['Last Margin', 'Last-1 Margin', 'Last-2 Margin', 'Last-3 Margin'];
    const mgVals = mgCols.map(k => safeNum(c(r, k))).filter(v => v !== null);
    const avgFin = mgVals.length > 0 ? mgVals.reduce((a, b) => a + b, 0) / mgVals.length : null;
    const finWeight = mgVals.length > 0 ? mgVals.length / 4 : 0;

    const jocWins   = safeNum(c(r, 'Joc Loc12m Wins'));
    const jocStarts = safeNum(c(r, 'Joc Loc12m Starts'));
    const trnWins   = safeNum(c(r, 'Trn Loc12m Wins'));
    const trnStarts = safeNum(c(r, 'Trn Loc12m Starts'));

    const oddsNum = safeNum((c(r, 'odds') || '').trim());
    const oddsVal = oddsNum && oddsNum <= 200 ? oddsNum : null;

    const lastFin0 = safeNum(c(r, 'Last Finish Position')) || safeNum(c(r, 'Last Finish pos'));
    const lastFin1 = safeNum(c(r, 'Last-1 Finish Position')) || safeNum(c(r, 'Last-1 Finish pos'));
    const lastFin2 = safeNum(c(r, 'Last-2 Finish Position')) || safeNum(c(r, 'Last-2 Finish pos'));
    const lastFin3 = safeNum(c(r, 'Last-3 Finish Position')) || safeNum(c(r, 'Last-3 Finish pos'));

    const lastWFA0 = safeNum(c(r, 'Last WFA Rating'));
    const lastWFA1 = safeNum(c(r, 'Last-1 WFA Rating'));
    const lastWFA2 = safeNum(c(r, 'Last-2 WFA Rating'));
    const lastWFA3 = safeNum(c(r, 'Last-3 WFA Rating'));

    const lastRunDetails = [
      { date: c(r,'Last Date')||'',   dist: c(r,'Last Dist')||'',   crse: c(r,'Last Crse')||'',   cls: c(r,'Last Class')||'',   margin: safeNum(c(r,'Last Margin')),   wt: safeNum(c(r,'Last Weight')),   rating: safeNum(c(r,'Last Base Rating'))   || safeNum(c(r,'Last WFA Rating')) },
      { date: c(r,'Last-1 Date')||'', dist: c(r,'Last-1 Dist')||'', crse: c(r,'Last-1 Crse')||'', cls: c(r,'Last-1 Class')||'', margin: safeNum(c(r,'Last-1 Margin')), wt: safeNum(c(r,'Last-1 Weight')), rating: safeNum(c(r,'Last-1 Base Rating')) || safeNum(c(r,'Last-1 WFA Rating')) },
      { date: c(r,'Last-2 Date')||'', dist: c(r,'Last-2 Dist')||'', crse: c(r,'Last-2 Crse')||'', cls: c(r,'Last-2 Class')||'', margin: safeNum(c(r,'Last-2 Margin')), wt: safeNum(c(r,'Last-2 Weight')), rating: safeNum(c(r,'Last-2 Base Rating')) || safeNum(c(r,'Last-2 WFA Rating')) },
      { date: c(r,'Last-3 Date')||'', dist: c(r,'Last-3 Dist')||'', crse: c(r,'Last-3 Crse')||'', cls: c(r,'Last-3 Class')||'', margin: safeNum(c(r,'Last-3 Margin')), wt: safeNum(c(r,'Last-3 Weight')), rating: safeNum(c(r,'Last-3 Base Rating')) || safeNum(c(r,'Last-3 WFA Rating')) },
    ];

    allRaces[key].horses.push({
      name: c(r, 'horse') || '',
      tab:  c(r, 'tab') || '',
      jname: c(r, 'Jockey') || '',
      trainer: c(r, 'Trainer') || '',
      scratched,
      starts: starts || 0, wins: wins || 0, places: places || 0, seconds: sec2 || 0, thirds: thr3 || 0,
      form: c(r, 'Form') || '',
      sex:  c(r, 'sex') || '',
      allowance: safeNum(c(r, 'Allowance')) || 0,
      lastFin: [lastFin0, lastFin1, lastFin2, lastFin3],
      lastWFA: [lastWFA0, lastWFA1, lastWFA2, lastWFA3],
      lastSP:  [safeNum(c(r,'Last SP')), safeNum(c(r,'Last-1 SP')), safeNum(c(r,'Last-2 SP')), safeNum(c(r,'Last-3 SP'))],
      lastDist: c(r,'Last Dist') || '', lastClass: c(r,'Last Class') || '',
      lastCrse: c(r,'Last Crse') || '', lastMargin: safeNum(c(r,'Last Margin')),
      lastRunDetails,
      curPeak: safeNum(c(r,'Cur Peak')), lastPeak: safeNum(c(r,'Last Peak')),
      'Best Form Panel':    safeNum(c(r,'Best Form Panel')),
      'Recent Form Panel':  safeNum(c(r,'Recent Form Panel')),
      'Wtime Panel':        safeNum(c(r,'Wtime Panel')),
      'Wrat':               safeNum(c(r,'Wrat')),
      'Trat':               safeNum(c(r,'Trat')),
      'Average Prizemoney': safeNum(c(r,'Average Prizemoney')),
      'BP':                 safeNum(c(r,'BP')),
      'Weight':             safeNum(c(r,'Weight')),
      'Days Since Last Start': safeNum(c(r,'Days Since Last Start')),
      'age':  safeNum(c(r,'age')) || safeNum(c(r,' age')),
      'Last WFA Rating': lastWFA0,
      'odds': oddsVal,
      winpct:    hasStarts ? wins / starts : null,
      placepct:  hasStarts ? (wins + (places || 0)) / starts : null,
      courseWin: cs > 0 ? cw / cs : null,
      distWin:   ds > 0 ? dw / ds : null,
      goodWin:   gs > 0 ? gw / gs : null,
      softWin:   ss > 0 ? sw / ss : null,
      heavyWin:  hs > 0 ? hw / hs : null,
      classChange: (c(r,'Class Change') || '').trim().toLowerCase(),
      espd:        (c(r,'Espd') || '').trim(),
      pace:        (c(r,'Pace') || '').trim(),
      courseStarts: safeNum(c(r,'Course Starts')) || 0,
      courseWins: cw || 0,
      distWins: dw || 0, distStarts: ds || 0,
      goodWins: gw || 0, goodStarts: gs || 0, goodPlaces: safeNum(c(r,'Good Places')) || 0,
      softWins: sw || 0, softStarts: ss || 0, softPlaces: safeNum(c(r,'Soft Places')) || 0,
      heavyWins: hw || 0, heavyStarts: hs || 0, heavyPlaces: safeNum(c(r,'Heavy Places')) || 0,
      firmWins: safeNum(c(r,'Firm Wins')) || 0, firmStarts: safeNum(c(r,'Firm Starts')) || 0, firmPlaces: safeNum(c(r,'Firm Places')) || 0,
      avgSP, spWeight, avgFin, finWeight,
      jocWin: jocStarts > 0 ? jocWins / jocStarts : null,
      trnWin: trnStarts > 0 ? trnWins / trnStarts : null,
      rawOdds: oddsVal,
      tppcFront: safeNum(c(r,'TPPC-Front')) || null,
      tppcOnpc:  safeNum(c(r,'TPPC-Onpc'))  || null,
      tppcMid:   safeNum(c(r,'TPPC-Mid'))   || null,
      tppcBack:  safeNum(c(r,'TPPC-Back'))  || null,
      fieldStrength: safeNum(c(r,'Field Strength')) || null,
      jocTrnWins:   safeNum(c(r,'Joc/Trn Wins'))   || 0,
      jocTrnPlaces: safeNum(c(r,'Joc/Trn Places')) || 0,
      jocTrnStarts: safeNum(c(r,'Joc/Trn Starts')) || 0,
      prepRuns1W: safeNum(c(r,'1Up Wins'))   || 0, prepRuns1P: safeNum(c(r,'1Up Places')) || 0, prepRuns1S: safeNum(c(r,'1Up Starts')) || 0,
      prepRuns2W: safeNum(c(r,'2Up Wins'))   || 0, prepRuns2P: safeNum(c(r,'2Up Places')) || 0, prepRuns2S: safeNum(c(r,'2Up Starts')) || 0,
      curRFS: safeNum(c(r,'Cur RFS Wins')) || 0,
      impactForm: safeNum(c(r,'Impact Form')) || null,
      impactDist: safeNum(c(r,'Impact Dist')) || null,
      sire: (c(r,'Sire') || '').trim(), dam: (c(r,'Dam') || '').trim(), gsire: (c(r,'G Sire') || '').trim(),
      winDists: (c(r,'Win Distances') || '').trim(),
      jocLoc12mW: safeNum(c(r,'Joc Loc12m Wins'))   || 0,
      jocLoc12mP: safeNum(c(r,'Joc Loc12m Places')) || 0,
      jocLoc12mS: safeNum(c(r,'Joc Loc12m Starts')) || 0,
      trnLoc12mW: safeNum(c(r,'Trn Loc12m Wins'))   || 0,
      trnLoc12mP: safeNum(c(r,'Trn Loc12m Places')) || 0,
      trnLoc12mS: safeNum(c(r,'Trn Loc12m Starts')) || 0,
      coursePlaces: safeNum(c(r,'Course Places')) || 0,
      distPlaces:   safeNum(c(r,'Distance Places')) || safeNum(c(r,'Dist Places')) || 0,
      winJockBack:  (c(r,'Win Jock Back On') || '').trim(),
    });
  });

  const raceKeys = Object.keys(allRaces).sort((a, b) => {
    const [va, ra] = a.split('_R');
    const [vb, rb] = b.split('_R');
    return va < vb ? -1 : va > vb ? 1 : +ra - +rb;
  });

  raceKeys.forEach(k => {
    const venue = allRaces[k].venue;
    if (!allVenues[venue]) allVenues[venue] = [];
    allVenues[venue].push(k);
  });

  return { allRaces, allVenues, raceKeys };
}
