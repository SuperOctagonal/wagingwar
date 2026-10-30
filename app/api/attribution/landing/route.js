import { NextResponse } from 'next/server';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { cleanUtm } from '@/lib/attribution';

// Anonymous landing hit from components/AttributionCapture.js (sendBeacon).
// Stores utm_content + a timestamp in ad_landings -- nothing else: no IP,
// no user or session id. Not consent-gated (nothing is stored on the
// visitor's device and the row identifies no one).
//
// Light in-memory rate limit per client IP so the public endpoint can't be
// used to flood the table. The IP is only held in this process's memory
// for the window, never written anywhere.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) { hits.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  entry.count++;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return new NextResponse(null, { status: 429 });

  let body;
  try { body = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 400 }); }
  const utmContent = cleanUtm(body?.utm_content);
  if (!utmContent) return new NextResponse(null, { status: 400 });

  const { ok, status } = await sbAdminRaw('ad_landings', {
    method: 'POST',
    body: { utm_content: utmContent },
    prefer: 'return=minimal',
  });
  // Table missing (migration not applied yet) or DB error: tell the caller,
  // but a beacon never retries, so nothing else to do.
  if (!ok) return new NextResponse(null, { status: status === 404 ? 503 : 502 });
  return new NextResponse(null, { status: 204 });
}
