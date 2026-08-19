// "Beat the Model" daily-challenge race selection -- picks the single
// national race for the day: highest total prize money among races with
// enough starters and a late-enough post time, falling back to highest
// prize overall if nothing qualifies. Deterministic given the same input
// CSV, so every client computes the same race independently -- the same
// pattern the existing daily comp already relies on for its own race
// selection (app/competitions/page.js's pickMeetings/getCompRaces), no
// coordination table required for the choice itself. The btm_challenges
// row written from this result is a durable record for resolution/history,
// not a coordination mechanism.
import { brisbaneDateTimeToInstant } from './raceTime';
import { normaliseVenue } from './venues';

// Cutoff hour (24h, AEST) for Beat the Model race eligibility. Proposed
// from general AU racing traffic patterns (most weekday and Saturday
// metro/provincial cards jump from ~12:30-1pm AEST, so races before midday
// tend to be smaller early-card events with few people online yet) --
// NOT measured from real site analytics, which weren't available when this
// was set. Revisit this single constant once real traffic data exists.
export const BTM_CUTOFF_HOUR_AEST = 12;

export const BTM_MIN_STARTERS = 8;

function raceDateISO(race) {
  const parts = (race.date || '').split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(race.date || '') ? race.date : null;
}

function raceInstant(race) {
  const iso = raceDateISO(race);
  if (!iso) return null;
  return brisbaneDateTimeToInstant(iso, race.time);
}

function racePrize(race) {
  return parseFloat((race.prize || '0').replace(/[^0-9.]/g, '')) || 0;
}

function activeStarterCount(race) {
  return (race.horses || []).filter(h => !h.scratched).length;
}

export function selectBeatModelRace(allRaces) {
  const races = Object.values(allRaces || {});
  if (!races.length) return null;

  const eligible = races.filter(r => {
    if (activeStarterCount(r) < BTM_MIN_STARTERS) return false;
    const inst = raceInstant(r);
    if (!inst) return false;
    const aestHour = +new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Brisbane', hour: '2-digit', hour12: false,
    }).format(inst) % 24; // Intl can format midnight as "24" depending on locale data
    return aestHour >= BTM_CUTOFF_HOUR_AEST;
  });

  const pool = eligible.length ? eligible : races;
  const usedFallback = eligible.length === 0;

  let best = null, bestPrize = -1;
  for (const r of pool) {
    const p = racePrize(r);
    if (p > bestPrize) { bestPrize = p; best = r; }
  }
  if (!best) return null;

  return {
    venue: normaliseVenue(best.venue || ''),
    raceNum: +best.num,
    raceName: best.name || null,
    prize: bestPrize,
    starterCount: activeStarterCount(best),
    postTimeISO: raceInstant(best)?.toISOString() || null,
    usedFallback,
    race: best,
  };
}
