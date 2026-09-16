import { NextResponse } from 'next/server';
import { buildTrustSample } from '@/lib/trustSample';
import { fitAndValidateBlend } from '@/lib/trustBlend';
import { FIRST_STARTER_LIVE_WEIGHT } from '@/lib/scoring';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;

// Part D: extends Phase 2's weekly-recalibration pattern to Phase 3's
// trust ratios. Same standalone-route/external-cron situation as
// app/api/recalibrate-calibration-curve -- no in-repo scheduler exists,
// this needs its own weekly trigger (same x-import-secret), intended to
// run alongside that route, not instead of it (they refit two different
// things). Each bucket is promoted independently: a refit only replaces
// that bucket's active ratio if it beats the bucket's OWN currently-live
// value on the same held-out test -- for 'first_starter' that's the real
// hardcoded FIRST_STARTER_LIVE_WEIGHT (0.8) actually affecting live
// prices today, not a previous preview row; for every other bucket it's
// whatever preview ratio is currently active. A refit that doesn't beat
// the current value is inserted inactive, for manual review, never
// auto-promoted -- and per the standing rule, even a first_starter
// refit that WOULD beat 0.8 is only ever written as a preview row here;
// this route never touches the live FIRST_STARTER_LIVE_WEIGHT constant
// itself.
function sbHeaders() {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
}
async function sb(path, init) {
  return fetch(`${SURL}/rest/v1/${path}`, { headers: sbHeaders(), ...init });
}

const BUCKETS = [
  { key: 'first_starter', filter: s => s.starts === 0, currentLive: () => FIRST_STARTER_LIVE_WEIGHT },
  { key: 'experienced_all', filter: s => s.starts != null && s.starts > 0, currentLive: active => active?.experienced_all ?? null },
  { key: 'experienced_favourite', filter: s => s.starts > 0 && (1 / s.calProb) < 5, currentLive: active => active?.experienced_favourite ?? null },
  { key: 'experienced_mid', filter: s => s.starts > 0 && (1 / s.calProb) >= 5 && (1 / s.calProb) < 20, currentLive: active => active?.experienced_mid ?? null },
  { key: 'experienced_long', filter: s => s.starts > 0 && (1 / s.calProb) >= 20, currentLive: active => active?.experienced_long ?? null },
];

export async function POST(request) {
  if (SECRET) {
    const incoming = request.headers.get('x-import-secret');
    if (incoming !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SURL || !SKEY || !ANON_KEY) return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });

  const result = { buckets: {}, errors: [] };

  const curveRes = await sb('score_calibration_curve?is_active=eq.true&select=curve_points&limit=1');
  const curve = curveRes.ok ? (await curveRes.json())[0]?.curve_points : null;
  if (!curve) {
    result.errors.push('no active calibration curve (Phase 2) -- cannot compute calibrated model probability, aborting');
    return NextResponse.json(result, { status: 502 });
  }

  const activeRes = await sb('trust_blend_ratios?is_active=eq.true&select=bucket_key,id,learned_live_weight');
  const activeRows = activeRes.ok ? await activeRes.json() : [];
  const activeByKey = Object.fromEntries(activeRows.map(r => [r.bucket_key, r]));
  const activeWeights = Object.fromEntries(activeRows.map(r => [r.bucket_key, r.learned_live_weight]));

  // odds_snapshot's own coverage window bounds the earliest usable date
  // (a real market price is required for every row in this sample,
  // unlike Phase 2's calibration sample which doesn't need one).
  const snapRes = await sb('odds_snapshot?select=race_date&order=race_date.asc&limit=1');
  const earliest = snapRes.ok ? (await snapRes.json())[0]?.race_date : null;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' });
  const startDate = earliest || today;

  let sample;
  try {
    sample = await buildTrustSample({ startDate, endDate: today, calibrationCurve: curve });
  } catch (err) {
    result.errors.push(`sample build failed: ${err.message}`);
    return NextResponse.json(result, { status: 502 });
  }
  const withMarket = sample.filter(s => s.marketProb != null);
  result.sampleSize = withMarket.length;

  for (const { key, filter, currentLive } of BUCKETS) {
    const bucketSample = withMarket.filter(filter);
    const currentLiveWeight = currentLive(activeWeights);
    const val = fitAndValidateBlend(bucketSample, { currentLiveWeight });

    if (!val.viable) {
      await sb('trust_blend_ratios', {
        method: 'POST',
        headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          bucket_key: key, sample_size: bucketSample.length, viable: false, is_active: false,
          notes: `Not viable: ${val.reason} (train=${val.trainN || 0}, test=${val.testN || 0}). Previous active row (if any) left untouched.`,
        }]),
      }).catch(err => result.errors.push(`${key}: insert failed: ${err.message}`));
      result.buckets[key] = { viable: false, reason: val.reason, testN: val.testN, trainN: val.trainN };
      continue;
    }

    const beatsCurrent = currentLiveWeight == null || val.learnedBeatsCurrent;
    const dates = [...new Set(bucketSample.map(s => s.date))].sort();

    const newRow = {
      bucket_key: key,
      date_range_start: dates[0], date_range_end: dates[dates.length - 1],
      sample_size: bucketSample.length,
      learned_live_weight: val.learnedLiveWeight,
      viable: true,
      test_brier_at_learned: val.testBrierAtLearned,
      test_brier_pure_model: val.testBrierPureModel,
      test_brier_pure_market: val.testBrierPureMarket,
      test_brier_at_current_live: val.testBrierAtCurrentLive,
      is_active: beatsCurrent,
      notes: beatsCurrent
        ? `Promoted (preview only -- ${key === 'first_starter' ? 'does NOT change the live 0.8 constant' : 'no live blend exists for this bucket'}): learned ${val.learnedLiveWeight} beat current ${currentLiveWeight ?? 'n/a'} on held-out test (${val.testBrierAtCurrentLive?.toFixed(5) ?? 'n/a'} -> ${val.testBrierAtLearned.toFixed(5)}).`
        : `Not promoted: learned ${val.learnedLiveWeight} did not beat current ${currentLiveWeight} on held-out test (current ${val.testBrierAtCurrentLive?.toFixed(5)} vs learned ${val.testBrierAtLearned.toFixed(5)}) -- pending manual review.`,
    };

    const insertRes = await sb('trust_blend_ratios', {
      method: 'POST',
      headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify([newRow]),
    });
    if (!insertRes.ok) {
      result.errors.push(`${key}: insert failed: ${insertRes.status} ${await insertRes.text()}`);
      continue;
    }

    if (beatsCurrent && activeByKey[key]) {
      const deactivateRes = await sb(`trust_blend_ratios?id=eq.${activeByKey[key].id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!deactivateRes.ok) result.errors.push(`${key}: deactivate previous failed: ${deactivateRes.status}`);
    }

    result.buckets[key] = {
      viable: true, promoted: beatsCurrent,
      learnedLiveWeight: val.learnedLiveWeight, currentLiveWeight,
      testBrierAtLearned: val.testBrierAtLearned, testBrierAtCurrentLive: val.testBrierAtCurrentLive,
      trainN: val.trainN, testN: val.testN,
    };
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
