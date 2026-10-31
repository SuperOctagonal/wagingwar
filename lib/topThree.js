import 'server-only';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { normaliseVenue, isKnownAuVenue } from '@/lib/venues';
import { getDefaultWeights, SCORING_INPUT_KEYS, computeValueEdge } from '@/lib/scoring';
import { CALIBRATION_ENABLED } from '@/lib/livePricing';
import { fetchMarketMoveFlags, nameKey } from '@/lib/marketMoves';
import { cardFieldSelect, rebuildCardFields } from '@/lib/resultsRanks';
import { renumberBarriers, scoreField, trackCondKey } from '@/lib/fieldScoring';
import { sydneyDateTimeToInstant } from '@/lib/raceTime';
import { VALUE_EDGE_THRESHOLD } from '@/lib/valueBets';
import { createTtlCache } from '@/lib/ttlCache.mjs';
import { singleFlight } from '@/lib/singleFlight.mjs';

// Top 3 at a glance (/races/top-3, GET /api/top-three): every race today,
// its top 3 runners by model score. Ranking is lib/fieldScoring.js -- the
// same code the Races page Field tab runs -- with the meeting's stored
// track condition (today_meetings), scratchings removed before ranking,
// the active calibration curve, and the same live market flags
// (fetchMarketMoveFlags, 45s cache shared with Movers/Value Bets) for the
// first-starter blend and the displayed price. Default weights, as on the
// server-side Value Bets list (a user's own Races-page weights don't apply).
//
// Built at most once a minute for everyone (ttlCache + singleFlight); only
// the compact result is kept, never the cards. The page polls once a
// minute, so a new result shows within about 2 minutes of landing in
// race_results.
//
// Finished races never re-rank: their top 3 is field_rank 1-3 from
// race_feature_snapshots -- insert-only, captured at the jump (the same
// pre-race picks the Tip Record settles), so no restart or later data
// (track condition, scratchings, calibration) can change it -- marked with
// where those runners actually finished (1st-3rd). A finished race with no
// snapshot shows no ranking and no finish marks. Races still to run (and
// jumped, awaiting a result) keep the live ranking. Abandoned races aren't
// ranked.

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// Scoring inputs + the horse number shown in the tiles.
const CARD_KEYS = [...new Set([...SCORING_INPUT_KEYS, 'tab'])];
const CARD_SELECT = cardFieldSelect(CARD_KEYS);

const TTL_MS = 60 * 1000;
const cache = createTtlCache({ ttlMs: TTL_MS, max: 2 });

export function racingTodayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

function normName(n) {
  return (n || '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sb(path) {
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: HEADERS });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

const round1 = n => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const round2 = n => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

async function buildTopThree(date) {
  if (!SURL || !SKEY) return null;
  const [cardsResult, scrRows, meetingRows, scheduleRows, placeResult, curveRows, snapResult] = await Promise.all([
    fetchAllRows(`${SURL}/rest/v1/race_cards?date=eq.${date}&select=${CARD_SELECT}&order=venue,race_num,horse_name`, HEADERS),
    sb(`scratchings?date=eq.${date}&select=venue,race_num,horse_name`),
    sb(`today_meetings?date=eq.${date}&select=venue,track_condition,condition_override,is_abandoned`),
    sb(`race_schedule?date=eq.${date}&select=venue,race_num,post_time`),
    // fetchAllRows: 1st-3rd for every race is ~330 rows on a big day, but
    // dead heats and late-day volume must never hit the 1,000-row page cap.
    fetchAllRows(`${SURL}/rest/v1/race_results?date=eq.${date}&finish_pos=in.(1,2,3)&select=venue,race_num,horse_name,finish_pos&order=venue,race_num,horse_name`, HEADERS),
    sb('score_calibration_curve?is_active=eq.true&select=curve_points&limit=1'),
    // Pre-race picks for finished races (~3 rows per race).
    fetchAllRows(`${SURL}/rest/v1/race_feature_snapshots?date=eq.${date}&field_rank=lte.3&select=venue,race_num,horse_name,field_rank,total_score,ww_price,market_price&order=venue,race_num,field_rank,horse_name`, HEADERS),
  ]);
  if (!cardsResult.ok || !placeResult.ok || !snapResult.ok) return null;

  const curvePoints = CALIBRATION_ENABLED ? curveRows[0]?.curve_points || null : null;
  const weights = getDefaultWeights();

  const meetings = {};
  meetingRows.forEach(m => {
    const v = normaliseVenue(m.venue);
    const raw = m.condition_override || m.track_condition || null;
    meetings[v] = { trackCond: trackCondKey(raw), trackCondLabel: raw, abandoned: !!m.is_abandoned };
  });
  const jumpAt = {};
  scheduleRows.forEach(r => {
    const t = sydneyDateTimeToInstant(date, r.post_time);
    if (t) jumpAt[`${normaliseVenue(r.venue)}||${r.race_num}`] = t;
  });
  const scratched = new Set(scrRows.map(r => `${normaliseVenue(r.venue)}||${r.race_num}||${normName(r.horse_name)}`));
  // race -> { normName: finish position 1-3 }
  const placings = {};
  placeResult.rows.forEach(r => {
    const k = `${normaliseVenue(r.venue)}||${r.race_num}`;
    (placings[k] = placings[k] || {})[normName(r.horse_name)] = r.finish_pos;
  });

  // race -> [rank 1, rank 2, rank 3] from the snapshot (first row per rank)
  const snapTop = {};
  snapResult.rows.forEach(r => {
    const k = `${normaliseVenue(r.venue)}||${r.race_num}`;
    const list = (snapTop[k] = snapTop[k] || []);
    if (!list[r.field_rank - 1]) list[r.field_rank - 1] = r;
  });

  const races = {};
  cardsResult.rows.forEach(row => {
    if (!isKnownAuVenue(row.venue)) return;
    const h = rebuildCardFields(row, CARD_KEYS);
    if (!h) return;
    const venue = normaliseVenue(row.venue);
    const k = `${venue}||${row.race_num}`;
    (races[k] = races[k] || { venue, raceNum: String(row.race_num), horses: [] }).horses.push(h);
  });

  const out = await Promise.all(Object.entries(races).map(async ([k, { venue, raceNum, horses }]) => {
    const mtg = meetings[venue] || {};
    const at = jumpAt[k] ? new Date(jumpAt[k]).toISOString() : null;
    const race = {
      key: `${venue.replace(/\s+/g, '_')}_R${raceNum}`, // the Races page's own ?select= key
      venue, raceNum, jumpAt: at, status: 'upcoming', winners: [], top: [],
    };
    if (mtg.abandoned) return { ...race, status: 'abandoned' };
    const placed = placings[k];
    const tabOf = n => horses.find(h => normName(h.name) === normName(n))?.tab ?? null;
    if (placed) {
      const snap = snapTop[k] || [];
      const top = snap.length === 3 && snap.every(Boolean)
        ? snap.map(r => ({
          tab: tabOf(r.horse_name),
          name: r.horse_name,
          score: round1(Number(r.total_score)),
          wwPrice: round2(r.ww_price != null ? Number(r.ww_price) : null),
          price: round2(r.market_price != null ? Number(r.market_price) : null),
          valuePct: null,
          finishPos: placed[normName(r.horse_name)] ?? null,
        }))
        : [];
      return {
        ...race,
        status: 'finished',
        winners: Object.entries(placed).filter(([, pos]) => pos === 1).map(([n]) => ({ tab: tabOf(n), name: n })),
        top,
      };
    }
    // Card (horse number) order, as the Races page scores it -- equal
    // scores keep their input order, so this keeps ties in the same order.
    const active = horses
      .filter(h => !h.scratched && !scratched.has(`${k}||${normName(h.name)}`))
      .sort((a, b) => (+a.tab || 99) - (+b.tab || 99));
    if (active.length < 2) return race;
    const liveFlags = await fetchMarketMoveFlags({ venue, raceNum, date });
    const ranked = scoreField(renumberBarriers(active), {
      trackCond: mtg.trackCond || 'good', weights, liveFlags, nameKeyFn: nameKey, curvePoints,
    });
    race.top = ranked.slice(0, 3).map(r => {
      const price = liveFlags[nameKey(r.name)]?.current ?? null;
      const edge = price && r.myOdds ? computeValueEdge(price, r.myOdds) : null;
      return {
        tab: r.tab ?? null,
        name: r.name,
        score: round1(r.totalFromGroups),
        wwPrice: round2(r.myOdds),
        price: round2(price),
        valuePct: edge && edge.pct >= VALUE_EDGE_THRESHOLD ? Math.round(edge.pct) : null,
      };
    });
    return race;
  }));

  out.sort((a, b) => (a.jumpAt || '9').localeCompare(b.jumpAt || '9') || a.venue.localeCompare(b.venue) || a.raceNum - b.raceNum);
  const venueList = [...new Set(out.map(r => r.venue))];
  return {
    date,
    generatedAt: new Date().toISOString(),
    meetings: venueList.map(v => ({
      venue: v,
      trackCond: meetings[v]?.trackCond || null,
      trackCondLabel: meetings[v]?.trackCondLabel || null,
      abandoned: !!meetings[v]?.abandoned,
    })),
    races: out,
  };
}

const buildOnce = singleFlight(buildTopThree);

export async function fetchTopThree(date = racingTodayISO()) {
  const hit = cache.get(date);
  if (hit) return hit;
  let result = await buildOnce(date);
  // a build already in flight for the previous day (just after midnight)
  if (result && result.date !== date) result = await buildTopThree(date);
  if (result) cache.set(date, result);
  return result;
}
