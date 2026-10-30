import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSiteAdmin } from '@/lib/admin';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { cleanUtm } from '@/lib/attribution';
import { aestDay } from '@/lib/aestDay';

// Admin-only: set the AUD spend for one ad on one day (dashboard form).
// Upsert on (date, utm_content): entering the same day/ad again replaces
// the amount. Negative amounts (credits/refunds) are allowed.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const utmContent = cleanUtm(body?.utm_content);
  const amount = Number(body?.amount_aud);
  if (!date || isNaN(new Date(`${date}T00:00:00Z`)) || date > aestDay()) {
    return NextResponse.json({ error: 'Date must be a valid day, not in the future (AEST).' }, { status: 400 });
  }
  if (!utmContent) return NextResponse.json({ error: 'Ad (utm_content) is required.' }, { status: 400 });
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000 || Math.round(amount * 100) !== amount * 100) {
    return NextResponse.json({ error: 'Amount must be a number in A$ with at most 2 decimals.' }, { status: 400 });
  }

  const { ok, status, data } = await sbAdminRaw('ad_spend?on_conflict=date,utm_content', {
    method: 'POST',
    body: { date, utm_content: utmContent, amount_aud: amount, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (!ok) {
    return NextResponse.json(
      { error: status === 404 ? 'ad_spend table not found (migration not applied yet).' : 'Could not save.' },
      { status: status === 404 ? 503 : 502 },
    );
  }
  return NextResponse.json({ ok: true, row: Array.isArray(data) ? data[0] : data });
}
