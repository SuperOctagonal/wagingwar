// ─────────────────────────────────────────────────────────────────────────────
// SCORING ENGINE — mirrors the VBA exactly
// Extracted from index.html, refactored to be pure (no global state).
// All functions accept trackCond and weights as parameters.
// ─────────────────────────────────────────────────────────────────────────────

// ── Metric table ─────────────────────────────────────────────────────────────
export const MT = [
  ['age',1,2,2],['age',3,4,2.5],['age',5,6,2],['age',7,8,0.8],['age',9,10,0.2],['age',11,12,0.1],
  ['Score_Win%',0,0,0.5],['Score_Win%',0.01,0.03,0.8],['Score_Win%',0.04,0.05,0.9],
  ['Score_Win%',0.06,0.07,1],['Score_Win%',0.08,0.1,1.1],['Score_Win%',0.11,0.15,1.2],
  ['Score_Win%',0.16,0.19,1.3],['Score_Win%',0.2,0.24,1.4],['Score_Win%',0.25,0.29,1.5],
  ['Score_Win%',0.3,0.34,1.6],['Score_Win%',0.35,0.39,1.7],['Score_Win%',0.4,0.49,1.8],
  ['Score_Win%',0.5,0.59,2],['Score_Win%',0.6,0.69,2.4],['Score_Win%',0.7,0.79,2.6],
  ['Score_Win%',0.8,0.89,2.8],['Score_Win%',0.9,1.1,3],
  ['Score_Place%',0,0,0.4],['Score_Place%',0.01,0.03,0.5],['Score_Place%',0.04,0.05,0.6],
  ['Score_Place%',0.06,0.07,0.7],['Score_Place%',0.08,0.1,0.8],['Score_Place%',0.11,0.15,0.9],
  ['Score_Place%',0.16,0.19,1],['Score_Place%',0.2,0.24,1.1],['Score_Place%',0.25,0.29,1.2],
  ['Score_Place%',0.3,0.34,1.3],['Score_Place%',0.35,0.39,1.4],['Score_Place%',0.4,0.49,1.5],
  ['Score_Place%',0.5,0.59,1.6],['Score_Place%',0.6,0.69,1.7],['Score_Place%',0.7,0.79,1.8],
  ['Score_Place%',0.8,0.89,1.9],['Score_Place%',0.9,1.1,2],
  ['Average Prizemoney',0,499,0],['Average Prizemoney',500,999,0.1],['Average Prizemoney',1000,1499,0.2],
  ['Average Prizemoney',1500,1999,0.3],['Average Prizemoney',2000,2499,0.4],['Average Prizemoney',2500,2999,0.5],
  ['Average Prizemoney',3000,3499,0.6],['Average Prizemoney',3500,3999,0.7],['Average Prizemoney',4000,4499,0.8],
  ['Average Prizemoney',4500,4999,0.9],['Average Prizemoney',5000,5499,1],['Average Prizemoney',5500,5999,1.1],
  ['Average Prizemoney',6000,6499,1.2],['Average Prizemoney',6500,6999,1.3],['Average Prizemoney',7000,7499,1.4],
  ['Average Prizemoney',7500,7999,1.5],['Average Prizemoney',8000,8499,1.6],['Average Prizemoney',8500,8999,1.7],
  ['Average Prizemoney',9000,9499,1.9],['Average Prizemoney',9500,9999,2.1],['Average Prizemoney',10000,19999,2.3],
  ['Average Prizemoney',20000,29999,2.6],['Average Prizemoney',30000,49999,2.8],['Average Prizemoney',50000,500000,3],
  ['odds',1.01,400,0],
  ['Weight',63,68,1.6],['Weight',61,62.9,1.7],['Weight',60,60.9,1.8],['Weight',59,59.9,1.9],
  ['Weight',58,58.9,2],['Weight',57,57.9,2.4],['Weight',56,56.9,2.5],['Weight',55,55.9,2.7],
  ['Weight',54,54.9,2.8],['Weight',53,53.9,3],['Weight',52,52.9,3.1],['Weight',51,51.9,3.2],
  ['Weight',50,50.9,3.3],['Weight',49,49.9,3.4],['Weight',48,48.9,3.5],['Weight',47,47.9,3.6],
  ['Weight',46,46.9,3.7],
  ['BP',0,0,1.5],['BP',1,1,2.5],['BP',2,2,2.3],['BP',3,3,2.1],['BP',4,4,2],
  ['BP',5,5,1.9],['BP',6,6,1.8],['BP',7,7,1.7],['BP',8,8,1.6],['BP',9,9,1.5],
  ['BP',10,10,1.4],['BP',11,11,1.3],['BP',12,12,1.2],['BP',13,13,1.1],['BP',14,14,1],
  ['BP',15,15,0.9],['BP',16,16,0.8],['BP',17,17,0.7],['BP',18,18,0.6],['BP',19,19,0.5],
  ['BP',20,20,0.4],['BP',21,21,0.3],['BP',22,22,0.2],['BP',23,23,0.1],['BP',24,24,0],
  ['Score_Course Win %',0,0.1,0.5],['Score_Course Win %',0.1,0.2,1],['Score_Course Win %',0.2,0.3,1.5],
  ['Score_Course Win %',0.3,0.4,2],['Score_Course Win %',0.4,0.5,2.5],['Score_Course Win %',0.5,0.6,3],
  ['Score_Course Win %',0.6,1.1,3.5],
  ['Score_Distance Win %',0,0.1,0.5],['Score_Distance Win %',0.1,0.2,1],['Score_Distance Win %',0.2,0.3,1.5],
  ['Score_Distance Win %',0.3,0.4,2],['Score_Distance Win %',0.4,0.5,2.5],['Score_Distance Win %',0.5,0.6,3],
  ['Score_Distance Win %',0.6,1.1,3.5],
  ['Score_Good Win %',0,0.1,4],['Score_Good Win %',0.1,0.2,5],['Score_Good Win %',0.2,0.3,6],
  ['Score_Good Win %',0.3,0.4,7],['Score_Good Win %',0.4,0.5,8],['Score_Good Win %',0.5,0.6,9],
  ['Score_Good Win %',0.6,1.1,10],
  ['Score_Good Place %',0,0.1,0.3],['Score_Good Place %',0.1,0.2,1],['Score_Good Place %',0.2,0.3,1.9],
  ['Score_Good Place %',0.3,0.4,2.6],['Score_Good Place %',0.4,0.5,3.1],['Score_Good Place %',0.5,0.6,3.5],
  ['Score_Good Place %',0.6,1.1,4],
  ['Score_Soft Win %',0,0.1,4],['Score_Soft Win %',0.1,0.2,5],['Score_Soft Win %',0.2,0.3,6],
  ['Score_Soft Win %',0.3,0.4,7],['Score_Soft Win %',0.4,0.5,8],['Score_Soft Win %',0.5,0.6,9],
  ['Score_Soft Win %',0.6,1.1,10],
  ['Score_Heavy Win %',0,0.1,4],['Score_Heavy Win %',0.1,0.2,5],['Score_Heavy Win %',0.2,0.3,6],
  ['Score_Heavy Win %',0.3,0.4,7],['Score_Heavy Win %',0.4,0.5,8],['Score_Heavy Win %',0.5,0.6,9],
  ['Score_Heavy Win %',0.6,1.1,10],
  ['Wizard Panel',1,1,5],['Wizard Panel',2,2,4.8],['Wizard Panel',3,3,4.6],['Wizard Panel',4,4,4.4],
  ['Wizard Panel',5,5,4.2],['Wizard Panel',6,6,4],['Wizard Panel',7,7,3.8],['Wizard Panel',8,8,3.6],
  ['Wizard Panel',9,9,3.4],['Wizard Panel',10,10,3.2],['Wizard Panel',11,11,3],['Wizard Panel',12,12,2.8],
  ['Wizard Panel',13,13,2.6],['Wizard Panel',14,14,2.4],['Wizard Panel',15,24,2],
  ['Wtime Panel',1,1,5],['Wtime Panel',2,2,4.8],['Wtime Panel',3,3,4.6],['Wtime Panel',4,4,4.4],
  ['Wtime Panel',5,5,4.2],['Wtime Panel',6,6,4],['Wtime Panel',7,7,3.8],['Wtime Panel',8,8,3.6],
  ['Wtime Panel',9,9,3.4],['Wtime Panel',10,10,3.2],['Wtime Panel',11,11,3],['Wtime Panel',12,12,2.8],
  ['Wtime Panel',13,13,2.6],['Wtime Panel',14,14,2.4],['Wtime Panel',15,24,2],
  ['Best Form Panel',1,1,3],['Best Form Panel',2,2,2.8],['Best Form Panel',3,3,2.6],
  ['Best Form Panel',4,4,2.4],['Best Form Panel',5,5,2.2],['Best Form Panel',6,6,2],
  ['Best Form Panel',7,7,1.8],['Best Form Panel',8,8,1.6],['Best Form Panel',9,9,1.4],
  ['Best Form Panel',10,10,1.2],['Best Form Panel',11,11,1],['Best Form Panel',12,12,0.8],
  ['Best Form Panel',13,13,0.6],['Best Form Panel',14,14,0.4],['Best Form Panel',15,24,0.3],
  ['Recent Form Panel',1,1,3],['Recent Form Panel',2,2,2.8],['Recent Form Panel',3,3,2.6],
  ['Recent Form Panel',4,4,2.4],['Recent Form Panel',5,5,2.2],['Recent Form Panel',6,6,2],
  ['Recent Form Panel',7,7,1.8],['Recent Form Panel',8,8,1.6],['Recent Form Panel',9,9,1.4],
  ['Recent Form Panel',10,10,1.2],['Recent Form Panel',11,11,1],['Recent Form Panel',12,12,0.8],
  ['Recent Form Panel',13,13,0.6],['Recent Form Panel',14,14,0.4],['Recent Form Panel',15,24,0.3],
  ['Days Since Last Start',0,14,3],['Days Since Last Start',15,21,2.5],['Days Since Last Start',22,28,2],
  ['Days Since Last Start',29,42,1.5],['Days Since Last Start',43,89,1],['Days Since Last Start',90,999,0.5],
  ['Wrat',100,100,7],['Wrat',96,99,6.5],['Wrat',92,95,6],['Wrat',88,91,5.5],['Wrat',84,87,5],
  ['Wrat',80,83,4.5],['Wrat',76,79,4],['Wrat',72,75,3.5],['Wrat',68,71,3],['Wrat',0,67,2.5],
  ['Trat',100,100,7],['Trat',96,99,6.5],['Trat',92,95,6],['Trat',88,91,5.5],['Trat',84,87,5],
  ['Trat',80,83,4.5],['Trat',76,79,4],['Trat',72,75,3.5],['Trat',68,71,3],['Trat',0,67,2.5],
  ['AvgSPLast4',1,2.5,10],['AvgSPLast4',2.6,4,8],['AvgSPLast4',4.1,6,6],['AvgSPLast4',6.1,8,5.5],
  ['AvgSPLast4',8.1,10,5],['AvgSPLast4',10.1,15,4.5],['AvgSPLast4',15.1,25,3.5],['AvgSPLast4',25.1,999,2],
  ['4-Run Avg Finish Pos',0,1.9,8],['4-Run Avg Finish Pos',2,2.9,6],['4-Run Avg Finish Pos',3,3.9,5],
  ['4-Run Avg Finish Pos',4,4.9,4],['4-Run Avg Finish Pos',5,5.9,3.5],['4-Run Avg Finish Pos',6,6.9,3],
  ['4-Run Avg Finish Pos',7,20,1.5],
  ['Score_Joc Loc12m Win %',0.2,1,2],['Score_Joc Loc12m Win %',0.16,0.19,1.8],
  ['Score_Joc Loc12m Win %',0.12,0.15,1.6],['Score_Joc Loc12m Win %',0.08,0.11,1.4],
  ['Score_Joc Loc12m Win %',0.04,0.07,1],['Score_Joc Loc12m Win %',0,0.03,0.8],
  ['Score_Trn Loc12m Win %',0.2,1,2],['Score_Trn Loc12m Win %',0.16,0.19,1.8],
  ['Score_Trn Loc12m Win %',0.12,0.15,1.6],['Score_Trn Loc12m Win %',0.08,0.11,1.4],
  ['Score_Trn Loc12m Win %',0.04,0.07,1],['Score_Trn Loc12m Win %',0,0.03,0.8],
];

export function mtLookup(metricName, val) {
  if (val === null || val === undefined || isNaN(+val)) return null;
  const v = +val;
  for (const [m, lo, hi, score] of MT) {
    if (m === metricName && v >= lo && v <= hi) return score;
  }
  return null;
}

// ── Factor definitions ────────────────────────────────────────────────────────
export const FACTORS = [
  { key:'bestfrm',   label:'Best Form',   grp:'Form',        csvCol:'Best Form Panel',          metric:'Best Form Panel' },
  { key:'recentfrm', label:'Recent Frm',  grp:'Form',        csvCol:'Recent Form Panel',        metric:'Recent Form Panel' },
  { key:'wtimeP',    label:'Time Panel',  grp:'Form',        csvCol:'Wtime Panel',              metric:'Wtime Panel' },
  { key:'winpct',    label:'Win %',       grp:'Form',        derived:'winpct',                  metric:'Score_Win%' },
  { key:'placepct',  label:'Place %',     grp:'Form',        derived:'placepct',                metric:'Score_Place%' },
  { key:'avgsp',     label:'Avg SP L4',   grp:'Form',        derived:'avgsp',                   metric:'AvgSPLast4' },
  { key:'avgfin',    label:'Avg Finish',  grp:'Form',        derived:'avgfin',                  metric:'4-Run Avg Finish Pos' },
  { key:'wrat',      label:'Wrat',        grp:'Speed',       csvCol:'Wrat',                     metric:'Wrat' },
  { key:'trat',      label:'Trat',        grp:'Speed',       csvCol:'Trat',                     metric:'Trat' },
  { key:'avgprize',  label:'Avg Prize',   grp:'Speed',       csvCol:'Average Prizemoney',       metric:'Average Prizemoney' },
  { key:'bp',        label:'Barrier',     grp:'Conditions',  csvCol:'BP',                       metric:'BP' },
  { key:'weight',    label:'Weight',      grp:'Conditions',  csvCol:'Weight',                   metric:'Weight' },
  { key:'days',      label:'Days Since',  grp:'Conditions',  csvCol:'Days Since Last Start',    metric:'Days Since Last Start' },
  { key:'coursew',   label:'Course Win%', grp:'Conditions',  derived:'courseWin',               metric:'Score_Course Win %' },
  { key:'distw',     label:'Dist Win%',   grp:'Conditions',  derived:'distWin',                 metric:'Score_Distance Win %' },
  { key:'trackw',    label:'Track Win%',  grp:'Conditions',  derived:'trackCondWin',            metric:'Score_Good Win %', trackCond:true },
  { key:'jocrat',    label:'Jockey',      grp:'Connections', derived:'jocWin',                  metric:'Score_Joc Loc12m Win %' },
  { key:'trnrat',    label:'Trainer',     grp:'Connections', derived:'trnWin',                  metric:'Score_Trn Loc12m Win %' },
  { key:'odds',      label:'Market $',    grp:'Reference',   csvCol:'odds',                     metric:'odds', scoreZero:true },
];

export const FACTOR_GROUPS_DEF = [
  { key:'form',  label:'Form',        color:'#d97706', factors:[
    {key:'bestfrm',label:'Best Form'},{key:'recentfrm',label:'Recent Form'},
    {key:'wtimeP',label:'Time Panel'},{key:'winpct',label:'Win %'},
    {key:'placepct',label:'Place %'},{key:'avgsp',label:'Avg SP L4'},
    {key:'avgfin',label:'Avg Finish'},
  ]},
  { key:'speed', label:'Speed',       color:'#2563eb', factors:[
    {key:'wrat',label:'Wrat'},{key:'trat',label:'Trat'},{key:'avgprize',label:'Avg Prize'},
  ]},
  { key:'cond',  label:'Conditions',  color:'#0891b2', factors:[
    {key:'bp',label:'Barrier'},{key:'weight',label:'Weight'},{key:'days',label:'Days Since'},
    {key:'coursew',label:'Course Win%'},{key:'distw',label:'Dist Win%'},{key:'trackw',label:'Track Win%'},
  ]},
  { key:'conn',  label:'Connections', color:'#7c3aed', factors:[
    {key:'jocrat',label:'Jockey Win%'},{key:'trnrat',label:'Trainer Win%'},
  ]},
];

export const GRP_KEYS = ['form', 'speed', 'cond', 'conn'];

export const GRP_LABELS = {
  form:  { label:'Form',        color:'#d97706' },
  speed: { label:'Speed',       color:'#2563eb' },
  cond:  { label:'Conditions',  color:'#0891b2' },
  conn:  { label:'Connections', color:'#7c3aed' },
};

export function getDefaultWeights() {
  const w = {};
  FACTORS.forEach(f => { if (!f.scoreZero) w[f.key] = 10; });
  return w;
}

// Returns raw value and metric name for a factor, given a horse and trackCond
function getRawAndMetric(h, f, trackCond) {
  let rawVal = null, wt = 1, metric = f.metric;

  if (f.derived === 'winpct')       rawVal = h.winpct;
  else if (f.derived === 'placepct') rawVal = h.placepct;
  else if (f.derived === 'courseWin') rawVal = h.courseWin;
  else if (f.derived === 'distWin')  rawVal = h.distWin;
  else if (f.derived === 'goodWin')  rawVal = h.goodWin;
  else if (f.derived === 'trackCondWin') {
    const tc = trackCond || 'good';
    rawVal  = tc === 'soft' ? h.softWin : tc === 'heavy' ? h.heavyWin : h.goodWin;
    metric  = tc === 'soft' ? 'Score_Soft Win %' : tc === 'heavy' ? 'Score_Heavy Win %' : 'Score_Good Win %';
  }
  else if (f.derived === 'avgsp')  { rawVal = h.avgSP;  wt = h.spWeight  || 0; }
  else if (f.derived === 'avgfin') { rawVal = h.avgFin; wt = h.finWeight || 0; }
  else if (f.derived === 'jocWin') rawVal = h.jocWin;
  else if (f.derived === 'trnWin') rawVal = h.trnWin;
  else rawVal = h[f.csvCol || f.metric];

  return { rawVal, wt, metric };
}

export function scoreHorse(h, trackCond = 'good', weights = null) {
  const w = weights || getDefaultWeights();
  const scores = {};
  let total = 0;

  FACTORS.forEach(f => {
    const { rawVal, wt, metric } = getRawAndMetric(h, f, trackCond);
    let scoreVal = null;
    if (rawVal !== null && !isNaN(rawVal)) {
      scoreVal = mtLookup(metric, rawVal);
      if (scoreVal !== null && wt < 1) scoreVal *= wt;
    }
    scores[f.key] = { raw: rawVal, score: scoreVal };
    if (!f.scoreZero && scoreVal !== null) {
      const wMult = (w[f.key] ?? 5) / 10;
      total += scoreVal * wMult;
    }
  });

  return { scores, total };
}

export function scoreGroup(h, grpKey, weights = null, trackCond = 'good') {
  const w = weights || getDefaultWeights();
  const grp = FACTOR_GROUPS_DEF.find(g => g.key === grpKey);
  if (!grp) return { total: 0, details: [] };
  let total = 0;
  const details = [];

  grp.factors.forEach(fd => {
    const f = FACTORS.find(x => x.key === fd.key);
    if (!f || f.scoreZero) return;
    const { rawVal, wt, metric } = getRawAndMetric(h, f, trackCond);
    let score = null;
    if (rawVal !== null && !isNaN(rawVal)) {
      score = mtLookup(metric, rawVal);
      if (score !== null && wt < 1) score *= wt;
    }
    const wMult = (w[f.key] ?? 10) / 10;
    if (score !== null) total += score * wMult;
    details.push({ label: fd.label, score: score !== null ? score.toFixed(2) : null, raw: rawVal });
  });

  return { total, details };
}

// ── Pace map ──────────────────────────────────────────────────────────────────
export function calcPaceMap(horse, raceVenue, raceDist, trackCond) {
  const espdStr = (horse.espd || '').toUpperCase().trim();
  const espdNum = espdStr ? parseInt(espdStr.replace(/[A-Z]/g, ''), 10) || 5 : 5;
  let role, color;

  if (espdNum <= 3)      { role = 'Leader';    color = '#00b050'; }
  else if (espdNum <= 5) { role = 'Presser';   color = '#7ec820'; }
  else if (espdNum === 6){ role = 'Midfield';  color = '#ffc000'; }
  else if (espdNum <= 8) { role = 'Closer';    color = '#ff8000'; }
  else                   { role = 'Backmarker';color = '#dc3545'; }

  function turnMult(v, d) {
    v = (v || '').toUpperCase();
    if (v.includes('IPSWICH'))                             return d <= 1050 ? 1.6 : d <= 1300 ? 1.3 : 1.0;
    if (v.includes('DOOMBEN'))                             return d <= 1050 ? 1.8 : d <= 1300 ? 1.45 : d <= 1420 ? 1.0 : d <= 1650 ? 1.5 : 1.0;
    if (v.includes('EAGLE') || v.includes('EAGLEFARM'))   return 0.8;
    if (v.includes('SUNSHINE'))                            return 0.8;
    if (v.includes('GOLD'))                                return d <= 1200 ? 1.2 : 1.0;
    if (v.includes('TOOWOOMBA'))                           return 1.3;
    return 1.0;
  }
  const tm = turnMult(raceVenue, raceDist);
  const espdScore = Math.max(0, (10 - espdNum) / 9) * 50;
  const earlyScore = Math.max(0, (10 - espdNum) / 9) * 18;
  const bp = +(horse['BP'] || horse.BP || 5);
  const styleM = espdNum <= 4 ? 1.0 : espdNum <= 6 ? 0.5 : 0.2;
  const barrierScore = Math.max(0, (16 - bp) / 15) * 14 * styleM * tm;
  const tc = (trackCond || 'good').toLowerCase();
  const condScore = (tc === 'soft' || tc === 'heavy') ? (espdNum <= 4 ? 12 : espdNum >= 8 ? 7 : 10) : 10;
  const cs = horse.courseStarts || 0;
  const courseScore = cs === 0 ? 0 : cs === 1 ? 1 : cs <= 4 ? 2.5 : 4;
  const pct = Math.min(100, Math.max(2, espdScore + earlyScore + barrierScore + condScore + courseScore));

  return { pct: Math.round(pct), role, color, espdNum, espdStr };
}

// ── Matrix odds ───────────────────────────────────────────────────────────────
export function formatRacingOdds(o) {
  if (o < 10)  return o.toFixed(2);
  if (o < 100) return o.toFixed(1);
  return o.toFixed(0);
}

export const PM = {
  2:  ['1.21-2.20','1.80-3.12'],
  3:  ['1.32-2.50','2.00-2.80','3.30-6.64'],
  4:  ['1.43-3.00','2.20-3.44','4.00-7.06','7.90-17.85'],
  5:  ['1.43-3.00','2.20-3.44','4.00-5.81','6.30-9.35','10.20-18.27'],
  6:  ['1.43-3.00','2.20-3.44','4.00-5.40','5.80-7.65','8.30-11.31','12.20-18.69'],
  7:  ['1.43-3.00','2.20-3.44','4.00-4.98','5.40-6.80','7.30-9.14','9.70-12.91','13.60-22.75'],
  8:  ['1.65-3.80','3.00-4.80','4.80-6.23','6.80-8.08','8.80-10.44','11.20-13.35','14.10-17.29','18.00-24.18'],
  9:  ['1.65-3.80','3.00-4.80','4.80-6.23','6.80-8.08','8.80-10.44','11.20-12.91','13.60-16.38','17.00-20.46','20.90-28.50'],
  10: ['1.65-3.80','3.00-4.80','4.80-6.23','6.80-8.08','8.80-10.01','10.70-12.46','13.10-15.47','16.00-19.53','19.90-24.70','24.70-33.95'],
  11: ['1.65-3.80','3.00-4.80','4.80-6.23','6.80-8.08','8.80-10.01','10.70-12.02','12.70-15.02','15.50-18.60','18.90-22.80','22.80-28.13','28.50-38.00'],
  12: ['1.87-4.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.57','10.20-12.02','12.70-15.02','15.50-18.60','18.90-22.80','22.80-28.13','28.50-35.00','34.50-45.00'],
  13: ['1.87-4.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.57','10.20-11.57','12.20-14.56','15.00-17.67','18.00-21.85','21.80-26.19','26.50-32.00','31.50-39.00','38.50-50.00'],
  14: ['1.87-4.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.57','10.20-11.57','12.20-14.11','14.60-17.21','17.50-20.90','20.90-25.22','25.50-31.00','30.50-37.00','36.50-44.00','43.50-55.00'],
  15: ['1.87-4.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.57','10.20-11.57','12.20-14.11','14.60-16.74','17.00-19.95','19.90-24.25','24.50-29.00','28.50-34.00','33.50-40.00','39.50-48.00','47.50-60.00'],
  16: ['1.98-5.00','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.65','14.10-16.74','17.00-20.90','20.90-26.19','26.50-33.00','32.50-40.00','39.50-49.00','48.50-60.00','59.50-75.00','74.50-95.00'],
  17: ['1.98-5.00','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.65','14.10-16.74','17.00-19.95','19.90-24.25','24.50-30.00','29.50-36.00','35.50-43.00','42.50-52.00','51.50-63.00','62.50-77.00','76.50-95.00'],
  18: ['1.98-5.00','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.65','14.10-16.28','16.50-19.95','19.90-24.25','24.50-29.00','28.50-35.00','34.50-42.00','41.50-50.00','49.50-59.00','58.50-70.00','69.50-84.00','83.50-101.00'],
  19: ['2.09-5.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.20','13.60-15.81','16.00-19.00','18.90-23.28','23.50-28.00','27.50-33.00','32.50-39.00','38.50-46.00','45.50-54.00','53.50-64.00','63.50-76.00','75.50-90.00','89.50-108.00'],
  20: ['2.09-5.40','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.20','13.60-15.81','16.00-19.00','18.90-22.31','22.50-27.00','26.50-32.00','31.50-37.00','36.50-43.00','42.50-50.00','49.50-59.00','58.50-69.00','68.50-81.00','80.50-95.00','94.50-115.00'],
  24: ['2.20-6.20','3.00-4.80','4.80-6.23','6.80-7.65','8.30-9.14','9.70-11.13','11.70-13.20','13.60-15.35','15.50-17.58','17.50-20.37','20.50-24.00','23.50-27.00','26.50-31.00','30.50-35.00','34.50-40.00','39.50-46.00','45.50-52.00','51.50-60.00','59.50-69.00','68.50-79.00','78.50-91.00','90.50-105.00','104.50-121.00','120.50-141.00'],
};

function getMatrixRange(fieldSize, rank) {
  const key = Math.min(Math.max(fieldSize, 2), 24);
  const rows = PM[key] || PM[16];
  if (rank > rows.length) return [51, 181];
  const parts = rows[rank - 1].split('-');
  return [parseFloat(parts[0]), parseFloat(parts[1])];
}

function getDynamicMinGap(gap) {
  if (gap <= 0.5) return 0.07;
  if (gap <= 1)   return 0.1;
  if (gap <= 2)   return 0.15;
  if (gap <= 4)   return 0.2;
  return 0.25;
}

function calcOddsInRange(minO, maxO, gap) {
  let mult;
  if (gap <= 0.1)      mult = 0.03;
  else if (gap <= 0.4) mult = 0.1;
  else if (gap <= 0.8) mult = 0.2;
  else if (gap <= 1.2) mult = 0.3;
  else if (gap <= 1.8) mult = 0.45;
  else if (gap <= 2.5) mult = 0.6;
  else if (gap <= 3.5) mult = 0.75;
  else if (gap <= 5)   mult = 0.88;
  else                  mult = 0.96;
  let o = minO + (maxO - minO) * mult;
  o += o * 0.02 * (Math.random() * 2 - 1);
  return Math.min(Math.max(o, minO), maxO);
}

// sortedHorses must already be sorted by totalFromGroups descending
export function calculateMatrixOdds(sortedHorses) {
  const n = sortedHorses.length;
  const odds = [];
  let prevOdds = 0;

  for (let i = 0; i < n; i++) {
    const rank = i + 1;
    const [minO, maxO] = getMatrixRange(n, rank);
    const gap = i === 0 ? 0 : (sortedHorses[i - 1].totalFromGroups - sortedHorses[i].totalFromGroups);
    let o;

    if (rank === 1) {
      const favGap = n > 1 ? sortedHorses[0].totalFromGroups - sortedHorses[1].totalFromGroups : 2;
      let mult;
      if (favGap >= 15)       mult = 0.10;
      else if (favGap >= 10)  mult = 0.15;
      else if (favGap >= 6)   mult = 0.25;
      else if (favGap >= 3)   mult = 0.40;
      else if (favGap >= 1.5) mult = 0.55;
      else if (favGap >= 0.8) mult = 0.70;
      else                    mult = 0.85;
      o = minO + (maxO - minO) * mult;
      o *= 1.07 + Math.random() * 0.02;
      if (o > maxO) o = maxO;
    } else {
      o = calcOddsInRange(minO, maxO, gap);
      const minGap = getDynamicMinGap(gap);
      if (o <= prevOdds + minGap - 0.01) {
        o = prevOdds + minGap;
        if (o > maxO) o = maxO;
      }
    }

    if (o < 1.1) o = 1.1;
    prevOdds = o;
    odds.push(o);
  }
  return odds;
}
