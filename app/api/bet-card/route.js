import { ImageResponse } from 'next/og';
import { SIZE, loadCardFonts, CardShell, StatBlock } from '@/lib/cardImage';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const runtime = 'nodejs';

// Bet Share has no authenticated live-render path (unlike Battle Card) --
// the snapshot itself IS the source of truth, created directly from the Log
// Bet modal's in-progress form state by /api/bet-card/share, independent of
// whether the bet was ever saved to bet_log. So this route only ever reads
// the stored snapshot.
async function fetchShareSnapshot(id) {
  const SKEY = process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(
    `${SURL}/rest/v1/bet_card_shares?id=eq.${encodeURIComponent(id)}&select=horse_name,venue,race_number,odds,stake,potential_return`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const shareId = searchParams.get('shareId');
  if (!shareId) return new Response('Missing shareId', { status: 400 });
  if (!SURL) return new Response('Server config missing', { status: 500 });

  const snap = await fetchShareSnapshot(shareId);
  if (!snap) return new Response('Not found', { status: 404 });

  const { horse_name: horseName, venue, race_number: raceNumber, odds, stake, potential_return: potentialReturn } = snap;
  const raceLabel = [raceNumber ? `R${raceNumber}` : null, venue].filter(Boolean).join(' · ');
  const fonts = await loadCardFonts();

  return new ImageResponse(
    (
      <CardShell badgeText="MY BET">
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
          {raceLabel && (
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#7ecb85', letterSpacing: 3 }}>{raceLabel.toUpperCase()}</div>
          )}
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
            {horseName}
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', gap: 16, marginTop: 24 }}>
            <StatBlock label="ODDS" value={`$${(+odds).toFixed(2)}`} />
            <StatBlock label="STAKE" value={`$${(+stake).toFixed(2)}`} />
            <StatBlock label="POTENTIAL RETURN" value={`$${(+potentialReturn).toFixed(2)}`} />
          </div>
        </div>
      </CardShell>
    ),
    { width: SIZE, height: SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
