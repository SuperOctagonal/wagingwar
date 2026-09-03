// JS port of the fuzzy-matching logic validated in
// wagingwar-backend/database.py's settle_bets() against real PuntersEdge
// data (2026-09-02, 199 runner comparisons, 100% exact-tier). Kept as a
// faithful port (not a reimplementation from scratch) so behavior doesn't
// drift from the already-validated Python matcher.

// Mirrors wagingwar-backend/venues.py's strip_country_suffix().
export function stripCountrySuffix(name) {
  return (name || '').trim().toUpperCase().replace(/\s*\([A-Z]{2,3}\)\s*$/, '').trim();
}

function fuzzyNorm(s) {
  return (s || '').toUpperCase().replaceAll(' ', '').replaceAll('-', '').replaceAll("'", '');
}

// Faithful port of Python difflib.SequenceMatcher(None, a, b).ratio() --
// same "find longest matching block, recurse on the remainders" algorithm
// difflib uses, so results match the Python matcher exactly for the short,
// junk-free strings (horse names) this is used on.
function findLongestMatch(a, b, aLo, aHi, bLo, bHi) {
  let bestI = aLo, bestJ = bLo, bestSize = 0;
  const b2j = new Map();
  for (let j = bLo; j < bHi; j++) {
    const c = b[j];
    if (!b2j.has(c)) b2j.set(c, []);
    b2j.get(c).push(j);
  }
  let j2len = new Map();
  for (let i = aLo; i < aHi; i++) {
    const newj2len = new Map();
    const js = b2j.get(a[i]) || [];
    for (const j of js) {
      if (j < bLo) continue;
      if (j >= bHi) break;
      const k = (j2len.get(j - 1) || 0) + 1;
      newj2len.set(j, k);
      if (k > bestSize) {
        bestI = i - k + 1;
        bestJ = j - k + 1;
        bestSize = k;
      }
    }
    j2len = newj2len;
  }
  return [bestI, bestJ, bestSize];
}

function matchingBlocksLength(a, b, aLo, aHi, bLo, bHi) {
  const [i, j, k] = findLongestMatch(a, b, aLo, aHi, bLo, bHi);
  if (k === 0) return 0;
  let total = k;
  if (aLo < i && bLo < j) total += matchingBlocksLength(a, b, aLo, i, bLo, j);
  if (i + k < aHi && j + k < bHi) total += matchingBlocksLength(a, b, i + k, aHi, j + k, bHi);
  return total;
}

export function sequenceRatio(a, b) {
  if (!a.length && !b.length) return 1;
  const matches = matchingBlocksLength(a, b, 0, a.length, 0, b.length);
  return (2 * matches) / (a.length + b.length);
}

// Ports settle_bets()'s three-tier matcher: exact -> normalized/substring ->
// fuzzy (difflib ratio >= 0.85). `ourNames` is the list of race_cards
// horse_name values for one race. Returns the matched name, or null.
export function matchRunnerName(peName, ourNames) {
  const peStripped = stripCountrySuffix(peName);

  for (const our of ourNames) {
    if (stripCountrySuffix(our) === peStripped || our.toUpperCase() === (peName || '').toUpperCase()) {
      return our;
    }
  }

  const peNorm = fuzzyNorm(peStripped);
  let best = null, bestRatio = 0;
  for (const our of ourNames) {
    const ourNorm = fuzzyNorm(stripCountrySuffix(our));
    if (peNorm === ourNorm) return our;
    if (peNorm.includes(ourNorm) || ourNorm.includes(peNorm)) return our;
    const ratio = sequenceRatio(peNorm, ourNorm);
    if (ratio > bestRatio && ratio >= 0.85) {
      bestRatio = ratio;
      best = our;
    }
  }
  return best;
}
