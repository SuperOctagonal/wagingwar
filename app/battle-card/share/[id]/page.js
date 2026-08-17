import Link from 'next/link';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

async function fetchSnapshot(id) {
  const res = await fetch(
    `${SURL}/rest/v1/battle_card_shares?id=eq.${encodeURIComponent(id)}&select=best_zone,best_venue,best_condition`,
    { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` }, cache: 'no-store' },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

// metadataBase is set in app/layout.js, so the relative image URL below
// resolves to an absolute https://wagingwar.com.au/... URL, which is what
// Facebook/X crawlers require for og:image.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const snap = await fetchSnapshot(id);
  if (!snap) return { title: 'Battle Card — Waging War' };

  const { best_zone: bestZone, best_venue: bestVenue } = snap;
  const title = `${bestZone.rankLabel} · ${bestZone.oddsLabel} — My Waging War Battle Card`;
  const description = `${bestZone.roi >= 0 ? '+' : ''}${Math.round(bestZone.roi)}% ROI across ${bestZone.n} bets. Best venue: ${bestVenue.label}. Find your edge on Waging War.`;
  const imageUrl = `/api/battle-card?shareId=${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 1080, height: 1080 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function BattleCardSharePage({ params }) {
  const { id } = await params;
  const snap = await fetchSnapshot(id);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, background: '#0a1a10', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center' }}>
      {snap ? (
        <img
          src={`/api/battle-card?shareId=${id}`}
          alt="Battle Card"
          style={{ width: '100%', maxWidth: 480, borderRadius: 24 }}
        />
      ) : (
        <div style={{ fontSize: 18, color: '#a8d4ae' }}>This Battle Card couldn&apos;t be found.</div>
      )}
      <Link
        href="/"
        style={{ display: 'inline-flex', padding: '12px 28px', borderRadius: 999, background: '#e8b84a', color: '#0a1a10', fontWeight: 700, textDecoration: 'none' }}
      >
        Find your edge on Waging War →
      </Link>
    </div>
  );
}
