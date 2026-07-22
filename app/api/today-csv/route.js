import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { parseRow, detectHeaders } from '@/lib/csvParser';
import { FREE_RACE_LEVEL_HEADER_KEYS, FREE_HORSE_HEADER_KEYS } from '@/lib/freeTierFields';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Real server-side gate for free tier — drops every column not on the
// allowlist (default-deny: an unrecognised column is dropped, not kept) before
// the CSV ever reaches the client, so lib/csvParser.js/buildRaces() on the
// client literally has no scoring-input columns to parse in the first place.
function stripCsvForFreeTier(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return text;
  const hdrs = parseRow(lines[0]);
  const detected = detectHeaders(hdrs);
  const allowedActualHeaders = new Set(
    [...FREE_RACE_LEVEL_HEADER_KEYS, ...FREE_HORSE_HEADER_KEYS]
      .map(k => detected[k])
      .filter(Boolean)
  );
  const keepIdx = hdrs.map((h, i) => allowedActualHeaders.has(h.trim()) ? i : -1).filter(i => i !== -1);

  const outLines = [keepIdx.map(i => csvField(hdrs[i])).join(',')];
  for (let li = 1; li < lines.length; li++) {
    const v = parseRow(lines[li]);
    outLines.push(keepIdx.map(i => csvField(v[i])).join(','));
  }
  return outLines.join('\n');
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  if (!SURL || !SKEY) {
    return new NextResponse('Supabase env vars not set', { status: 500 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isPro = user?.publicMetadata?.plan === 'pro';

  const todayAEST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const path = `${todayAEST}.csv`;

  try {
    const res = await fetch(`${SURL}/storage/v1/object/wizard-csv/${path}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    if (!res.ok) {
      return new NextResponse('CSV not available', { status: 404 });
    }
    let text = await res.text();
    if (!isPro) text = stripCsvForFreeTier(text);
    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Failed to fetch CSV from storage', { status: 500 });
  }
}
