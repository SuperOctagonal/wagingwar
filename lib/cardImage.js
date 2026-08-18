// Shared next/og (Satori) rendering pieces for shareable card images --
// extracted from app/api/battle-card/route.js so app/api/bet-card/route.js
// reuses the exact same font-loading and visual shell instead of
// duplicating it. See app/api/battle-card/route.js's original comment for
// why Google Fonts' variable-font Inter file doesn't work here and static
// per-weight TTFs (fetched live from the CSS2 API) are used instead --
// verified by direct testing, not assumed.
export const SIZE = 1080;
export const PAD = 64; // canvas margin so the card's rounded corners are visible against transparency
export const CARD = SIZE - PAD * 2;

let fontCache = null;
export async function loadCardFonts() {
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
    console.error('[cardImage] font load failed:', err.message);
    fontCache = [];
  }
  return fontCache;
}

// The dark-green gradient card shell (header wordmark+badge, footer CTA)
// shared by Battle Card and Bet Share -- badgeText is the only thing that
// differs at the header level ("BATTLE CARD" vs "MY BET"); children is the
// body content between header and footer.
export function CardShell({ badgeText, children }) {
  return (
    <div style={{ width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
      <div
        style={{
          width: CARD, height: CARD, borderRadius: 48, display: 'flex', flexDirection: 'column',
          padding: 56, backgroundImage: 'linear-gradient(160deg, #0d2416 0%, #0a1a10 100%)',
          fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#e8b84a', letterSpacing: 1 }}>WAGING WAR</div>
          <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, border: '2px solid #2f9e44' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#7ecb85', letterSpacing: 1 }}>{badgeText}</span>
          </div>
        </div>

        {children}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28, borderTop: '2px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 400, color: '#7a9a80' }}>wagingwar.com.au</div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#e8b84a' }}>Find your edge →</div>
        </div>
      </div>
    </div>
  );
}

// One of the translucent-panel stat blocks (BEST VENUE / SHARPEST READ on
// the Battle Card, ODDS / STAKE / POTENTIAL RETURN on the Bet Share card).
export function StatBlock({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 28, gap: 8 }}>
      <div style={{ display: 'flex', fontSize: 16, fontWeight: 700, color: '#7ecb85', letterSpacing: 2 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#ffffff' }}>{value}</div>
      {sub && <div style={{ display: 'flex', fontSize: 20, fontWeight: 400, color: '#a8d4ae' }}>{sub}</div>}
    </div>
  );
}
