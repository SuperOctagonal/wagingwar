// Pace Map "Analysis" text -- a combinatorial phrase bank instead of one
// generic template. Three independent axes (pace shape, distance framing,
// today's track bias) each contribute one sentence, picked from several
// real-terminology variants and combined at generation time. ~20 maintained
// phrases combine into hundreds of distinct outputs rather than hundreds of
// hand-written paragraphs.
//
// Picks are seeded by venue+race (not Math.random()) so the SAME race shows
// the SAME sentence across re-renders -- PaceMapView re-renders on every
// livePrices/marketMoves poll (every 60s), and a plain random pick would
// make the analysis text visibly change underneath the reader every minute.
// Different races get (usually) different phrases because their seeds
// differ, which is the actual goal here, not true randomness.

function seededIndex(seedStr, len) {
  if (len <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return h % len;
}

function pickSeeded(arr, seedStr) {
  return arr[seededIndex(seedStr, arr.length)];
}

function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

// ── Axis 1: pace shape ──────────────────────────────────────────────────────

const LONE_SPEED = [
  '{horse} is out there on its own at the top of this speed map — a lone leader with every chance to get a soft, uncontested lead.',
  'No pressure in store for {horse} in front — with the only genuine gate speed in this field, it can dictate terms from the get-go.',
  '{horse} looks the standout leader on pace figures alone — expect a soft, unpressured tempo that suits it perfectly.',
  'This looks a race for {horse} to control from the front — no obvious pressure to disrupt an easy lead.',
  'A clear-cut leader in {horse} sets up for a soft pace scenario — hard to run down without genuine heat applied.',
];

const SPEED_DUEL = [
  '{horse1} and {horse2} both want this on their own terms — expect a genuine speed duel that could set up the closers.',
  'With {horse1} and {horse2} both keen to lead, this has the makings of a hot, pressured tempo up front.',
  'Two horses with genuine gate speed in {horse1} and {horse2} rarely share the lead peacefully — a taxing pace looks likely.',
  'The presence of both {horse1} and {horse2} up front suggests an honest-to-hot pace, giving backmarkers something to run at.',
  'Expect fireworks early with {horse1} and {horse2} both wanting the front spot — a pace collapse late is a real possibility.',
];

const CONTESTED_UNEVEN = [
  '{horse1} looks to have the edge on early speed over the others engaged up front, but a moderate pressure scenario can’t be ruled out.',
  'While {horse1} rates strongest on pace figures, it won’t be entirely alone — expect a workmanlike, moderately-run affair.',
  '{horse1} shapes as the most likely to lead of those on-pace here, though it may need to work a little to get there uncontested.',
  'On pace figures {horse1} holds a clear edge over its rivals for the lead, but a moderately-run race is still the more likely shape.',
];

const NO_LEADER = [
  'No standout leader emerges from this pace map — someone will likely be dragged forward reluctantly, making the shape hard to predict.',
  'This looks a genuine free-for-all up front — with no natural leader, the tempo is anyone’s guess.',
  'A rare scenario with no confirmed leader type in the field — watch for a presser to be forced into an unfamiliar front-running role.',
  'Nothing in this field profiles as a genuine leader — the pace could be shaped by whichever presser jumps best.',
  'With no true pace on offer, this has the hallmarks of a truly-run, tactical affair rather than a genuine speed test.',
];

// ── Axis 2: distance framing ─────────────────────────────────────────────────

const SPRINT_PHRASES = [
  'At this trip, uncontested gate speed is close to unbeatable — hard to see a closer getting there in time.',
  'Sprinting trips like this reward tactical speed heavily — ground lost early is rarely made up.',
  'Short of ground for the backmarkers to work with here — position early matters more than raw closing ability.',
  'Over this sprint trip there’s little time to make up lost ground — being handy is close to essential.',
];

const MIDDLE_PHRASES = [
  'At this intermediate trip, tactical speed still counts for plenty, but a strong closer with the right gap can still get involved.',
  'Neither pure speed nor a deep close is guaranteed the edge at this trip — this could come down to who travels most efficiently.',
  'This in-between trip asks a fair question of both on-pace types and closers alike — barrier and gate speed still matter, but so does how the race is run.',
];

const ROUTE_PHRASES = [
  'Over this longer trip, energy efficiency compounds — a horse that races too keenly up front risks paying for it late.',
  'Stamina and a well-timed sprint matter more than gate speed at this distance — closers get real time to wind up.',
  'This trip gives backmarkers plenty of ground to make up if the tempo up front gets away from the leaders.',
  'At this distance the true test comes over the concluding stages — how the race is run matters as much as who leads it.',
];

// ── Axis 3: today's track/meeting pace bias ─────────────────────────────────

const BIAS_ONPACE = [
  'Today’s meeting has already leaned toward on-pace runners, which reinforces the advantage for {leader}.',
  'On-pace runners have been getting the run of things at this meeting today, adding further weight behind {leader}.',
  'The track has favoured forward-placed runners so far today — another factor in {leader}’s corner.',
];

const BIAS_CLOSERS = [
  'Backmarkers have found this track hard going today, adding further weight to a forward-placed runner like {leader}.',
  'Today’s bias has favoured closers, which tempers the usual advantage of racing on the speed here.',
  'Closers have made good late ground at this meeting today, so an on-pace edge here shouldn’t be overstated.',
];

function classifyPaceShape(byBarrier) {
  const leaders = (byBarrier || []).filter(h => h.pm?.role === 'Leader' && h.pm?.pct != null);
  if (leaders.length === 0) return { shape: 'none' };
  if (leaders.length === 1) return { shape: 'lone', leaders };
  const sorted = [...leaders].sort((a, b) => b.pm.pct - a.pm.pct);
  const gap = sorted[0].pm.pct - sorted[1].pm.pct;
  return { shape: gap <= 10 ? 'duel' : 'uneven', leaders: sorted };
}

function classifyDistance(dist) {
  const d = +dist;
  if (!d) return 'middle';
  if (d < 1200) return 'sprint';
  if (d <= 1600) return 'middle';
  return 'route';
}

// null (no lean shown) unless one side clearly outweighs the other and
// there's enough of today's results in to say anything at all.
function classifyBias(paceBiasPoints) {
  if (!paceBiasPoints) return null;
  const onPace = (paceBiasPoints.Leader || 0) + (paceBiasPoints.Presser || 0);
  const back = (paceBiasPoints.Midfield || 0) + (paceBiasPoints.Closer || 0) + (paceBiasPoints.Backmarker || 0);
  const total = onPace + back;
  if (total < 3) return null;
  if (onPace >= back * 1.5) return 'onpace';
  if (back >= onPace * 1.5) return 'closers';
  return null;
}

// seedBase should uniquely identify the race (e.g. `${venue}||${raceNum}`)
// so the same race always renders the same combination of phrases.
export function generatePaceAnalysis({ byBarrier, dist, paceBiasPoints, seedBase }) {
  const seed = seedBase || 'race';
  const shapeInfo = classifyPaceShape(byBarrier);
  const distCat = classifyDistance(dist);
  const biasCat = classifyBias(paceBiasPoints);

  const vars = {};
  let shapeBank;
  switch (shapeInfo.shape) {
    case 'lone':
      shapeBank = LONE_SPEED;
      vars.horse = shapeInfo.leaders[0].name;
      break;
    case 'duel':
      shapeBank = SPEED_DUEL;
      vars.horse1 = shapeInfo.leaders[0].name;
      vars.horse2 = shapeInfo.leaders[1].name;
      break;
    case 'uneven':
      shapeBank = CONTESTED_UNEVEN;
      vars.horse1 = shapeInfo.leaders[0].name;
      break;
    default:
      shapeBank = NO_LEADER;
  }
  const shapeSentence = fillTemplate(pickSeeded(shapeBank, `${seed}|shape`), vars);

  const distBank = distCat === 'sprint' ? SPRINT_PHRASES : distCat === 'route' ? ROUTE_PHRASES : MIDDLE_PHRASES;
  const distSentence = pickSeeded(distBank, `${seed}|dist`);

  let biasSentence = '';
  if (biasCat) {
    const leaderName = shapeInfo.leaders?.[0]?.name;
    const biasBank = biasCat === 'onpace' ? BIAS_ONPACE : BIAS_CLOSERS;
    const tpl = pickSeeded(biasBank, `${seed}|bias`);
    // Every BIAS_ONPACE variant uses {leader}; skip entirely (rather than
    // leave a blank placeholder) on the rare no-leader race where there's
    // nobody to attribute the on-pace advantage to.
    if (biasCat === 'closers' || leaderName) {
      biasSentence = ' ' + fillTemplate(tpl, { leader: leaderName || '' });
    }
  }

  return `${shapeSentence} ${distSentence}${biasSentence}`;
}
