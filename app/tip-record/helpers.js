// Pure maths/aggregation helpers for the Tip Record page -- ported from
// scratch_research/tip-record-mockups/helpers.js, adapted from the
// mockup's fake day-offset dates to real ISO date strings and to the
// actual API row shape:
// [date, venue, state, race, horse, score, ww_price, market_price, sp,
//  finish_pos, field_size, edge_pct, field_rank, dead_heat_winners]
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dstr(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[m - 1]}`;
}
export function dowOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  // UTC noon to sidestep any DST edge case affecting getDay().
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function weekStart(iso) {
  return addDays(iso, -dowOf(iso));
}

// units() -- $1 win at official SP. On a win the stake itself is split
// between dead-heat winners, so the payout is sp / dead_heat_winners - 1
// (not (sp-1)/dead_heat_winners -- that under-splits the profit only,
// not the stake). r[13] is 1 for every normal, non-dead-heat win.
// Otherwise -1.
export function pl(r) {
  return r[9] === 1 ? r[8] / (r[13] || 1) - 1 : -1;
}

export function agg(rows) {
  let w = 0, p = 0, u = 0;
  for (const r of rows) {
    if (r[9] === 1) { w++; u += r[8] - 1; } else { u -= 1; }
    if (r[9] <= 3) p++;
  }
  const n = rows.length;
  return { n, w, p, u, roi: n ? (u / n) * 100 : 0, sr: n ? (w / n) * 100 : 0, pr: n ? (p / n) * 100 : 0 };
}

export function band(v, cuts, labels) {
  for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return labels[i];
  return labels[labels.length - 1];
}

export const PL = ['Under $2.50', '$2.50 to $4', '$4 to $6', '$6 to $10', '$10 to $20', '$20 or more'];
export const SL = ['Under 50', '50 to 54', '55 to 59', '60 to 64', '65 or more'];
export const FL = ['4 to 7 runners', '8 to 9', '10 to 11', '12 or more'];
export const RL = ['Races 1 to 2', 'Races 3 to 4', 'Races 5 to 6', 'Race 7 or later'];

export const DIMS = {
  state: { label: 'State', get: r => r[2], order: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'] },
  price: { label: 'Tip price', get: r => (r[7] == null ? 'No price' : band(r[7], [2.5, 4, 6, 10, 20], PL)), order: PL.concat(['No price']) },
  score: { label: 'Score', get: r => band(r[5], [50, 55, 60, 65], SL), order: SL },
  field: { label: 'Field size', get: r => band(r[10], [8, 10, 12], FL), order: FL },
  race: { label: 'Race number', get: r => band(r[3], [3, 5, 7], RL), order: RL },
  dow: { label: 'Day of week', get: r => DOW[dowOf(r[0])], order: DOW },
  week: { label: 'Week', get: r => 'w/c ' + dstr(weekStart(r[0])), order: null },
  venue: { label: 'Venue', get: r => r[1], order: null },
};

export function group(rows, key) {
  const d = DIMS[key];
  const m = {}, ks = [];
  for (const r of rows) {
    const k = d.get(r);
    if (!m[k]) { m[k] = []; ks.push(k); }
    m[k].push(r);
  }
  if (d.order) {
    ks.sort((a, b) => {
      const x = d.order.indexOf(a), y = d.order.indexOf(b);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });
  } else {
    ks.sort((a, b) => m[b].length - m[a].length);
  }
  return ks.map(k => ({ key: k, rows: m[k], a: agg(m[k]) }));
}

export function sg(n, dp) {
  const s = Math.abs(n).toFixed(dp);
  if (n > 0.00001) return '+' + s;
  if (n < -0.00001) return '−' + s;
  return s;
}
export function pc(n, dp) {
  return sg(n, dp == null ? 1 : dp) + '%';
}
export function ni(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function money(v) {
  if (v == null) return '–';
  return '$' + (v >= 100 ? v.toFixed(0) : v.toFixed(2));
}
export function ordn(n) {
  return n === 1 ? 'Won' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
}
export function cum(rows) {
  let s = 0;
  const o = [];
  for (const r of rows) { s += pl(r); o.push(s); }
  return o;
}

// Sparkline point-string builder -- same downsampling approach as the
// mockup (cap at ~140 points so a 1,000+ bet selection doesn't choke SVG).
export function spark(arr, W, H, pad) {
  if (arr.length < 2) return { pts: '', zy: (H / 2).toFixed(1) };
  const step = Math.max(1, Math.ceil(arr.length / 140));
  const b = [];
  for (let i = 0; i < arr.length; i += step) b.push(arr[i]);
  if ((arr.length - 1) % step) b.push(arr[arr.length - 1]);
  const mn = Math.min(0, ...b), mx = Math.max(0, ...b), rg = mx - mn || 1;
  const y = v => pad + ((mx - v) / rg) * (H - 2 * pad);
  return {
    pts: b.map((v, i) => `${((i / (b.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    zy: y(0).toFixed(1),
  };
}
