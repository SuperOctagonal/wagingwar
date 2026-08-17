import { ImageResponse } from 'next/og';
import { auth } from '@clerk/nextjs/server';
import { normaliseVenue } from '@/lib/venues';
import { findBattleCardStats } from '@/lib/edgeZone';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const runtime = 'nodejs';

const SIZE = 1080;
const PAD = 64; // canvas margin so the card's rounded corners are visible against transparency
const CARD = SIZE - PAD * 2;

// Fetched once per server instance and reused -- Satori (next/og's renderer)
// doesn't use system/browser fonts, so weights have to be supplied explicitly
// or bold text silently renders as regular weight.
//
// Confirmed by direct testing (not assumed): Google Fonts' variable-font
// Inter file (the only format the google/fonts GitHub repo ships now) fails
// to parse in @vercel/og's font parser -- "Cannot read properties of
// undefined (reading '256')" in parseFvarAxis, i.e. it does NOT reliably
// support arbitrary variable fonts despite `weight` being a documented
// fonts[] field. Static per-weight TTFs (fetched live from the same CSS2 API
// browsers use, not a hardcoded CDN hash URL that could go stale) render
// correctly -- verified end-to-end against real user data before this
// shipped, not just assumed to work.
let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, // gstatic serves TTF only for non-modern UAs; woff2 isn't usable here
    }).then(r => r.text());
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
    if (urls.length < 2) throw new Error(`expected 2 font URLs, got ${urls.length}`);
    const [regular, bold] = await Promise.all(urls.map(u => fetch(u).then(r => r.arrayBuffer())));
    fontCache = [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ];
  } catch (err) {
    console.error('[battle-card] font load failed:', err.message);
    fontCache = [];
  }
  return fontCache;
}

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

  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div style={{ width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <div
          style={{
            width: CARD, height: CARD, borderRadius: 48, display: 'flex', flexDirection: 'column',
            padding: 56, backgroundImage: 'linear-gradient(160deg, #0d2416 0%, #0a1a10 100%)',
            fontFamily: 'Inter',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#e8b84a', letterSpacing: 1 }}>WAGING WAR</div>
            <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, border: '2px solid #2f9e44' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#7ecb85', letterSpacing: 1 }}>BATTLE CARD</span>
            </div>
          </div>

          {/* Body */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#7ecb85', letterSpacing: 3 }}>YOUR STRONGEST ZONE</div>
            <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, maxWidth: CARD - 40 }}>
              {zoneLabel(bestZone)}
            </div>
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 400, color: '#a8d4ae' }}>
              {`${bestZone.roi >= 0 ? '+' : ''}${Math.round(bestZone.roi)}% ROI across ${bestZone.n} bets`}
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', gap: 20, marginTop: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 28, gap: 8 }}>
                <div style={{ display: 'flex', fontSize: 16, fontWeight: 700, color: '#7ecb85', letterSpacing: 2 }}>BEST VENUE</div>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#ffffff' }}>{bestVenue.label}</div>
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 400, color: '#a8d4ae' }}>
                  {`${Math.round(bestVenue.sr)}% strike rate · ${bestVenue.n} bets`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 28, gap: 8 }}>
                <div style={{ display: 'flex', fontSize: 16, fontWeight: 700, color: '#7ecb85', letterSpacing: 2 }}>SHARPEST READ</div>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#ffffff' }}>{conditionLabel(bestCondition)}</div>
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 400, color: '#a8d4ae' }}>
                  {`${Math.round(bestCondition.top3Rate)}% top-3 rate · ${bestCondition.n} bets`}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28, borderTop: '2px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 400, color: '#7a9a80' }}>wagingwar.com.au</div>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#e8b84a' }}>Find your edge →</div>
          </div>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
