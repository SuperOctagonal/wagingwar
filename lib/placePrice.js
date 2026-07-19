// Each-way place-price estimation from win SP, by paid-places column.
// Col A = 2 places paid (fields of 7 or fewer non-scratched runners).
// Col B = 3 places paid (fields of 8 or more).
const TABLE = [
  [1.50, 1.15, 1.10],
  [2.00, 1.30, 1.20],
  [2.50, 1.45, 1.30],
  [3.00, 1.60, 1.40],
  [3.50, 1.75, 1.50],
  [4.00, 1.90, 1.60],
  [4.50, 2.05, 1.70],
  [5.00, 2.20, 1.80],
  [6.00, 2.50, 1.95],
  [7.00, 2.80, 2.20],
  [8.00, 3.15, 2.40],
  [9.00, 3.50, 2.65],
  [10.00, 3.90, 2.90],
  [12.00, 4.60, 3.35],
  [14.00, 5.30, 3.85],
  [16.00, 6.00, 4.45],
  [18.00, 6.75, 5.00],
  [20.00, 7.45, 5.60],
  [26.00, 9.75, 7.25],
  [31.00, 11.50, 8.80],
  [41.00, 15.00, 11.80],
  [51.00, 19.00, 15.00],
  [61.00, 22.00, 18.00],
  [81.00, 28.00, 24.00],
  [101.00, 34.00, 31.00],
];

export function paidPlacesForFieldSize(fieldSize) {
  return fieldSize >= 8 ? 3 : 2;
}

export function estimatePlacePrice(sp, paidPlaces) {
  const col = paidPlaces >= 3 ? 2 : 1;
  const s = Math.max(TABLE[0][0], Math.min(TABLE[TABLE.length - 1][0], +sp || 0));

  if (s <= TABLE[0][0]) return TABLE[0][col];
  if (s >= TABLE[TABLE.length - 1][0]) return TABLE[TABLE.length - 1][col];

  for (let i = 0; i < TABLE.length - 1; i++) {
    const [sp1] = TABLE[i];
    const [sp2] = TABLE[i + 1];
    if (s >= sp1 && s <= sp2) {
      const frac = sp2 === sp1 ? 0 : (s - sp1) / (sp2 - sp1);
      return TABLE[i][col] + frac * (TABLE[i + 1][col] - TABLE[i][col]);
    }
  }
  return TABLE[TABLE.length - 1][col];
}
