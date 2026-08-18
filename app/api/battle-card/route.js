import { ImageResponse } from 'next/og';
import { auth } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';
import { findBattleCardStats } from '@/lib/edgeZone';
import { SIZE, CARD, loadCardFonts, CardShell, StatBlock } from '@/lib/cardImage';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const runtime = 'nodejs';

async function fetchAllBets(clerkId) {
  const headers = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
  const res = await fetch(
    `${SURL}/rest/v1/bet_log?clerk_id=eq.${encodeURIComponent(clerkId)}&select=*&order=date.asc`,
    { headers },
  );
  if (!res.ok) return [];
  return res.json();
}

function zoneLabel(bestZone) {
  return `${bestZone.rankLabel} · ${bestZone.oddsLabel}`;
}

// track_condition is stored lowercase ("good"/"soft"/...) -- uppercase in
// code, not via CSS text-transform (Satori's support for it is unreliable,
// same reason the eyebrow label below is a literal uppercase string).
function conditionLabel(bestCondition) {
  return (bestCondition.label || '').toUpperCase();
}

// A public share snapshot ({id} -> {best_zone,best_venue,best_condition})
// stored at share-time by /api/battle-card/share, read with the service key
// since battle_card_shares has no RLS policies for the anon role. Used so a
// crawler (Facebook/X fetching og:image) or a logged-out visitor can render
// the exact same image without authenticating.
async function fetchShareSnapshot(id) {
  const SVC_KEY = process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(
    `${SURL}/rest/v1/battle_card_shares?id=eq.${encodeURIComponent(id)}&select=best_zone,best_venue,best_condition`,
    { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const shareId = searchParams.get('shareId');

  let bestZone, bestVenue, bestCondition;

  if (shareId) {
    if (!SURL) return new Response('Server config missing', { status: 500 });
    const snap = await fetchShareSnapshot(shareId);
    if (!snap) return new Response('Not found', { status: 404 });
    ({ best_zone: bestZone, best_venue: bestVenue, best_condition: bestCondition } = snap);
  } else {
    const { userId } = await auth();
    if (!userId) return new Response('Unauthorized', { status: 401 });
    if (!SURL || !SKEY) return new Response('Server config missing', { status: 500 });

    const bets = await fetchAllBets(userId);
    const stats = findBattleCardStats(bets, { minSample: 10, normaliseVenueFn: normaliseVenue });
    if (!stats.qualifies) return new Response('Not enough data yet', { status: 404 });
    ({ bestZone, bestVenue, bestCondition } = stats);
  }

  const fonts = await loadCardFonts();

  return new ImageResponse(
    (
      <CardShell badgeText="BATTLE CARD">
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#7ecb85', letterSpacing: 3 }}>YOUR STRONGEST ZONE</div>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, maxWidth: CARD - 40 }}>
            {zoneLabel(bestZone)}
          </div>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 400, color: '#a8d4ae' }}>
            {`${bestZone.roi >= 0 ? '+' : ''}${Math.round(bestZone.roi)}% ROI across ${bestZone.n} bets`}
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', gap: 20, marginTop: 24 }}>
            <StatBlock label="BEST VENUE" value={bestVenue.label} sub={`${Math.round(bestVenue.sr)}% strike rate · ${bestVenue.n} bets`} />
            <StatBlock label="SHARPEST READ" value={conditionLabel(bestCondition)} sub={`${Math.round(bestCondition.top3Rate)}% top-3 rate · ${bestCondition.n} bets`} />
          </div>
        </div>
      </CardShell>
    ),
    { width: SIZE, height: SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
