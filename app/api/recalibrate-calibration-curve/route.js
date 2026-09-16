import { NextResponse } from 'next/server';
import { buildCalibrationSample } from '@/lib/calibrationSample';
import { fitCurve, validateOutOfSample } from '@/lib/calibrationCurve';
import { interpolateCurve } from '@/lib/isotonic';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.IMPORT_CSV_SECRET;

// Part C: scheduled (intended weekly) recalibration. No cron/scheduling
// infrastructure exists in this repo (same finding as Phase 1) -- this is
// a standalone route an external weekly cron needs to POST to, same
// pattern/secret as app/api/puntersedge-refs already uses. NOT wired into
// that route's frequent (~15-30min) poll -- refitting is comparatively
// expensive and has no reason to run that often.
//
// A refit only replaces the live curve if it (a) beats raw/uncalibrated
// probabilities out-of-sample (the Part A gate) AND (b) beats the
// CURRENTLY ACTIVE curve's own Brier score on the same held-out test
// sample -- a refit that validates worse than the current curve is
// inserted as inactive, with notes explaining why, for manual review,
// never auto-promoted.
function sbHeaders() {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
}

async function sb(path, init) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: sbHeaders(), ...init });
  return res;
}

export async function POST(request) {
  if (SECRET) {
    const incoming = request.headers.get('x-import-secret');
    if (incoming !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });

  const result = { promoted: false, errors: [] };

  // Uses the full available history each run (race_cards' own rolling
  // retention already bounds how far back this can go; race_results goes
  // back further but race_cards is the limiting factor for the re-score
  // half of the sample).
  const cardsRangeRes = await sb('race_cards?select=date&order=date.asc&limit=1');
  const earliest = cardsRangeRes.ok ? (await cardsRangeRes.json())[0]?.date : null;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' });
  const startDate = earliest || today;

  let sample;
  try {
    sample = await buildCalibrationSample({ startDate, endDate: today });
  } catch (err) {
    result.errors.push(`sample build failed: ${err.message}`);
    return NextResponse.json(result, { status: 502 });
  }
  result.sampleSize = sample.length;
  if (sample.length < 1000) {
    result.errors.push(`sample too small to refit (${sample.length} rows) -- skipping`);
    return NextResponse.json(result, { status: 200 });
  }

  const oos = validateOutOfSample(sample);
  if (!oos) {
    result.errors.push('validateOutOfSample returned null (insufficient date spread)');
    return NextResponse.json(result, { status: 200 });
  }
  result.oos = { rawBrier: oos.rawBrier, calBrier: oos.calBrier, improved: oos.improved, improvementPct: oos.improvementPct };

  if (!oos.improved) {
    await sb('score_calibration_curve', {
      method: 'POST',
      headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        date_range_start: sample[0]?.date, date_range_end: today, sample_size: sample.length,
        curve_points: fitCurve(sample), oos_metrics: oos, is_active: false,
        notes: `Refit did not beat raw/uncalibrated probabilities out-of-sample (calBrier ${oos.calBrier} >= rawBrier ${oos.rawBrier}) -- not promoted, pending manual review.`,
      }]),
    }).catch(err => result.errors.push(`insert failed: ${err.message}`));
    result.notes = 'refit failed the raw-vs-calibrated gate; not promoted';
    return NextResponse.json(result, { status: 200 });
  }

  // Compare against the currently active curve on the SAME held-out test
  // sample the candidate was itself validated against -- an apples-to-
  // apples comparison, not just "beats raw".
  const activeRes = await sb('score_calibration_curve?is_active=eq.true&select=id,curve_points&limit=1');
  const active = activeRes.ok ? (await activeRes.json())[0] : null;

  const dates = [...new Set(sample.map(s => s.date))].sort();
  const splitDate = dates[Math.floor(dates.length / 2)];
  const testSample = sample.filter(s => s.date >= splitDate);

  const candidateCurve = fitCurve(sample.filter(s => s.date < splitDate));
  const candidateTestBrier = oos.calBrier; // already computed on this exact split by validateOutOfSample

  let activeTestBrier = null;
  if (active?.curve_points) {
    const sq = testSample.reduce((a, s) => a + (interpolateCurve(active.curve_points, s.modelProb) - (s.won ? 1 : 0)) ** 2, 0);
    activeTestBrier = sq / testSample.length;
  }
  result.candidateTestBrier = candidateTestBrier;
  result.activeTestBrier = activeTestBrier;

  const beatsActive = activeTestBrier == null || candidateTestBrier < activeTestBrier;

  const finalCurve = fitCurve(sample); // deployable curve: fit on the FULL sample, same as the initial Part A fit
  const newRow = {
    date_range_start: dates[0], date_range_end: dates[dates.length - 1], sample_size: sample.length,
    curve_points: finalCurve, oos_metrics: oos, is_active: beatsActive,
    notes: beatsActive
      ? `Promoted: beat raw (Brier ${oos.rawBrier.toFixed(5)} -> ${oos.calBrier.toFixed(5)}) and beat the previously active curve on the same held-out test (${activeTestBrier != null ? activeTestBrier.toFixed(5) : 'n/a'} -> ${candidateTestBrier.toFixed(5)}).`
      : `Not promoted: beat raw probabilities but did NOT beat the currently active curve on the same held-out test (active ${activeTestBrier?.toFixed(5)} vs candidate ${candidateTestBrier.toFixed(5)}) -- pending manual review.`,
  };

  const insertRes = await sb('score_calibration_curve', {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([newRow]),
  });
  if (!insertRes.ok) {
    result.errors.push(`insert failed: ${insertRes.status} ${await insertRes.text()}`);
    return NextResponse.json(result, { status: 502 });
  }

  if (beatsActive && active) {
    const deactivateRes = await sb(`score_calibration_curve?id=eq.${active.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    if (!deactivateRes.ok) result.errors.push(`deactivate previous curve failed: ${deactivateRes.status}`);
  }

  result.promoted = beatsActive;
  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
