import CheckoutButton from '@/components/CheckoutButton';
import PuntersEdgeCredit from '@/components/PuntersEdgeCredit';
import SignupCta from '@/components/SignupCta';
import { getHomepageModelStats } from '@/lib/homepageModelStats';
import { landingVariant } from '@/lib/landingVariants';

export const metadata = {
  title: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
  description: 'Live bookmaker prices free for every punter. Score and rank every runner, track your bets with real P&L, and follow daily tipping competitions - built for serious Australian punters.',
};

const GREEN = '#1B4332';
const GOLD  = '#B7791F';
const TEXT  = '#111827';

function StepCard({ step, icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 12px' }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: '#f0fdf4', border: `2px solid ${GREEN}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', fontSize: 26,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 7 }}>
        Step {step}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 9 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65, maxWidth: 220, margin: '0 auto' }}>{desc}</div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, free }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12,
      padding: '24px 20px', boxShadow: '0 1px 5px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 28 }}>{icon}</div>
        {free && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#dcfce7', color: '#166534', letterSpacing: '0.3px' }}>FREE</span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function Check({ dark }) {
  return <span style={{ color: dark ? GREEN : '#86efac', flexShrink: 0 }}>✓</span>;
}

function fmtDateAU(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Real phone-style stats card replacing the old hero video -- computed
// server-side (app/page.js, see getHomepageModelStats) from the exact same
// Daily Model Summary calculation the Results page uses, never hard-coded.
// `stats` is null on a query failure or an empty window, in which case this
// hides the numbers entirely rather than showing anything fabricated.
function ModelStatsPhone({ stats }) {
  const GRID = 40;
  const filled = stats ? Math.round(GRID * stats.winPct) : 0;

  return (
    <div style={{
      width: '100%', maxWidth: 340, aspectRatio: '9 / 16',
      borderRadius: 22, border: '1px solid rgba(255,255,255,0.18)',
      display: 'flex', flexDirection: 'column', margin: '0 auto',
      boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#0f2e1e',
      padding: '28px 24px', boxSizing: 'border-box', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
        Top-rated runner, last {stats?.days || 30} days
      </div>
      {stats && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 18 }}>
          {fmtDateAU(stats.dateFrom)} – {fmtDateAU(stats.dateTo)}
        </div>
      )}

      {stats ? (
        <>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
            {stats.wins} / {stats.total} won
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
            {Math.round(stats.winPct * 100)}% win · {Math.round(stats.top3Pct * 100)}% top-3
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5, marginBottom: 'auto' }}>
            {Array.from({ length: GRID }, (_, i) => (
              <div key={i} style={{
                aspectRatio: '1 / 1', borderRadius: 3,
                background: i < filled ? GOLD : 'rgba(255,255,255,0.1)',
              }} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ margin: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Model results updating — check back shortly.
        </div>
      )}

      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 16, lineHeight: 1.5 }}>
        Past performance is not a guide to the future.
      </div>
    </div>
  );
}

// Mirrors pipStyle() from app/races/page.js exactly
function Pip({ n }) {
  const s = n === 1 ? { background: '#fbbf24', color: '#78350f' }
           : n === 2 ? { background: '#d1d5db', color: '#374151' }
           : n === 3 ? { background: '#cd7f32', color: '#fff' }
           : { background: '#f3f4f6', color: '#374151' };
  return (
    <span style={{ width: 15, height: 15, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0, ...s }}>
      {n}
    </span>
  );
}

// Mirrors GrpCell coloring from app/races/page.js + GRP_LABELS from lib/scoring.js
function FakeGrpCell({ val, isBest, isWorst, grpColor }) {
  const color = isBest ? grpColor : isWorst ? '#b91c1c' : '#1e293b';
  const bg    = isBest ? '#f0fdf4' : isWorst ? '#fef2f2' : 'transparent';
  return (
    <td style={{ padding: '2px 3px', textAlign: 'right', fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace,monospace', color, background: bg, whiteSpace: 'nowrap' }}>
      {val}
    </td>
  );
}

function ProductScreenshot() {
  // Header style mirrors th = { background:'#f8fafc', color:'#374151', fontSize:9, fontWeight:700,
  //   textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #e5e7eb' }
  const th = { background: '#f8fafc', color: '#374151', fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e5e7eb',
    padding: '3px 3px', whiteSpace: 'nowrap' };
  // Rank colors from RunnerRow: rank1=#d97706, rank2=#6b7280, rank3=#b45309, else=#9ca3af
  const rankColor = [null, '#d97706', '#6b7280', '#b45309', '#9ca3af', '#9ca3af'];
  // Pace role colors from races/page.js lines 132-136
  const paceColor = { LDR: '#00b050', PRE: '#7ec820', MID: '#ffc000', CLO: '#ff8000', BAC: '#dc3545' };
  // GRP_LABELS colors from lib/scoring.js
  const grpColor = { form: '#d97706', speed: '#2563eb', cond: '#0891b2', conn: '#7c3aed' };

  const rows = [
    // rank, tab, name, jockey, trainer, lastFin[newest→oldest], record, form, speed, cond, conn, score, ww, price, move, moveColor, valPct, pace
    // Best: form=row0, speed=row1, cond=row2, conn=row0 | Worst: form=row4, speed=row4, cond=row4, conn=row4
    { rank:1, tab:5,  name:'Sunfire Prince', j:'J. McDonald', t:'C. Waller',    pips:[1,2,1,3], rec:'24-8-4-3',  form:18.4, speed:16.2, cond:14.8, conn:12.1, score:72.4, ww:'$4.50', price:'$6.00', move:'▲18%', moveColor:'#059669', val:'+33%', valColor:'#059669', pace:'LDR', bestForm:true,  bestConn:true  },
    { rank:2, tab:2,  name:'Storm King',     j:'D. Oliver',   t:'P. Moody',     pips:[2,1,3,4], rec:'31-11-6-4', form:15.2, speed:18.6, cond:12.3, conn: 9.8, score:65.8, ww:'$5.20', price:'$5.50', move:'—',    moveColor:'#9ca3af', val: '+6%', valColor:'#374151', pace:'PRE', bestSpeed:true },
    { rank:3, tab:8,  name:'Golden Arrow',   j:'T. Berry',    t:'G. Waterhouse', pips:[3,2,1,2], rec:'18-5-4-4',  form:14.1, speed:12.4, cond:16.7, conn:11.3, score:63.2, ww:'$6.00', price:'$4.50', move:'▼9%',  moveColor:'#dc2626', val:'-25%', valColor:'#dc2626', pace:'MID', bestCond:true  },
    { rank:4, tab:1,  name:'Rapid River',    j:'R. Bayliss',  t:'L. Maher',     pips:[4,3,2,5], rec:'27-7-5-6',  form:12.8, speed:14.1, cond:11.9, conn:10.2, score:58.4, ww:'$8.00', price:'$9.00', move:'—',    moveColor:'#9ca3af', val:'+13%', valColor:'#374151', pace:'CLO' },
    { rank:5, tab:11, name:'Misty Belle',    j:'J. Bowman',   t:'M. Moroney',   pips:[5,6,3,1], rec:'22-4-3-5',  form:10.2, speed:11.8, cond: 9.4, conn: 8.7, score:48.7, ww:'$12.00',price:'$14.00',move:'▲22%', moveColor:'#059669', val:'+17%', valColor:'#374151', pace:'BAC', worstForm:true, worstSpeed:true, worstCond:true, worstConn:true },
  ];

  return (
    <div style={{
      // width:100% so the frame fits its column and clips the mock nav,
      // instead of growing to the nav's min-content (overflowed 375px phones).
      width: '100%', maxWidth: 780, margin: '40px auto 0',
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      border: '1px solid rgba(255,255,255,0.1)',
      fontSize: 11,
    }}>
      {/* Browser-style address bar */}
      <div style={{ background: '#e8eaed', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#bfc1c4' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#bfc1c4' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#bfc1c4' }} />
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 10, color: '#6b7280', fontFamily: 'ui-monospace,monospace' }}>
          wagingwar.com.au/races
        </div>
      </div>
      {/* App top nav strip */}
      <div style={{ background: '#1B4332', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, color: '#fff', fontSize: 11, letterSpacing: '0.06em' }}>WAGING WAR</span>
        <span style={{ color: '#fbbf24', fontSize: 9, letterSpacing: '0.1em', fontWeight: 600 }}>RACING ANALYTICS</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 9, color: 'rgba(255,255,255,0.55)', fontWeight: 600, minWidth: 0, overflow: 'hidden' }}>
          {['Races','Today','My Bets','Insights','Results','Community'].map(l => (
            <span key={l} style={{ color: l === 'Races' ? '#fff' : undefined, borderBottom: l === 'Races' ? '2px solid #fbbf24' : '2px solid transparent', paddingBottom: 1 }}>{l}</span>
          ))}
        </div>
      </div>
      {/* Race selector bar */}
      <div style={{ background: '#f0fdf4', borderBottom: '1px solid #d1fae5', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: GREEN }}>FLEMINGTON</span>
        <span style={{ fontSize: 9, color: '#6b7280' }}>R7 · 1200m · Good (3) · {rows.length} runners</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['Field','Form','Pace Map'].map((t, i) => (
            <span key={t} style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: i === 0 ? GREEN : 'transparent', color: i === 0 ? '#fff' : '#6b7280', border: `1px solid ${i === 0 ? GREEN : '#e5e7eb'}` }}>{t}</span>
          ))}
        </div>
      </div>
      {/* Field table — column set mirrors FieldView thead exactly */}
      <div style={{ overflowX: 'auto', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'center',  width: 36 }}>Rank</th>
              <th style={{ ...th, textAlign: 'left',    minWidth: 160 }}>Horse / Jockey / Trainer</th>
              <th style={{ ...th, textAlign: 'center',  width: 72 }}>Last 4 →</th>
              <th style={{ ...th, textAlign: 'center',  width: 64 }}>Record</th>
              <th style={{ ...th, textAlign: 'right',   width: 48, color: grpColor.form  }}>Form</th>
              <th style={{ ...th, textAlign: 'right',   width: 48, color: grpColor.speed }}>Speed</th>
              <th style={{ ...th, textAlign: 'right',   width: 48, color: grpColor.cond  }}>Good</th>
              <th style={{ ...th, textAlign: 'right',   width: 48, color: grpColor.conn  }}>Conn</th>
              <th style={{ ...th, textAlign: 'right',   width: 48 }}>Score</th>
              <th style={{ ...th, textAlign: 'right',   width: 52 }}>WW $</th>
              <th style={{ ...th, textAlign: 'right',   width: 56 }}>Price $</th>
              <th style={{ ...th, textAlign: 'right',   width: 48 }}>Move</th>
              <th style={{ ...th, textAlign: 'right',   width: 52 }}>Value</th>
              <th style={{ ...th, textAlign: 'left',    width: 52 }}>Pace</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} style={{ background: r.rank === 1 ? '#fffbeb' : '#fff', borderBottom: '1px solid #f3f4f6' }}>
                {/* Rank */}
                <td style={{ padding: '3px 3px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: rankColor[r.rank] }}>{r.rank}</td>
                {/* Horse / Jockey / Trainer — two-line cell */}
                <td style={{ padding: '3px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ background: '#1e3a8a', color: '#fff', fontSize: 8, fontWeight: 700, fontFamily: 'ui-monospace,monospace', padding: '1px 4px', borderRadius: 2, lineHeight: 1.4, flexShrink: 0 }}>{r.tab}</span>
                    <span style={{ fontWeight: 600, fontSize: 11, color: '#111827' }}>{r.name}</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#374151', marginTop: 1 }}>
                    {r.j} · {r.t}
                  </div>
                </td>
                {/* Last 4 form dots */}
                <td style={{ padding: '3px 3px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    {r.pips.map((n, i) => <Pip key={i} n={n} />)}
                  </div>
                </td>
                {/* Career record */}
                <td style={{ padding: '3px 3px', textAlign: 'center', fontSize: 9, fontFamily: 'ui-monospace,monospace', color: '#111827', whiteSpace: 'nowrap' }}>{r.rec}</td>
                {/* Group scores */}
                <FakeGrpCell val={r.form.toFixed(1)}  isBest={!!r.bestForm}  isWorst={!!r.worstForm}  grpColor={grpColor.form}  />
                <FakeGrpCell val={r.speed.toFixed(1)} isBest={!!r.bestSpeed} isWorst={!!r.worstSpeed} grpColor={grpColor.speed} />
                <FakeGrpCell val={r.cond.toFixed(1)}  isBest={!!r.bestCond}  isWorst={!!r.worstCond}  grpColor={grpColor.cond}  />
                <FakeGrpCell val={r.conn.toFixed(1)}  isBest={!!r.bestConn}  isWorst={!!r.worstConn}  grpColor={grpColor.conn}  />
                {/* Total score — mirrors: font-bold text-[12px], color=rankColor */}
                <td style={{ padding: '3px 3px', textAlign: 'right', fontWeight: 700, fontSize: 12, fontFamily: 'ui-monospace,monospace', color: rankColor[r.rank], whiteSpace: 'nowrap' }}>{r.score.toFixed(1)}</td>
                {/* WW $ — mirrors: text-[11px] font-semibold text-emerald-600 */}
                <td style={{ padding: '3px 3px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#059669', fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap' }}>{r.ww}</td>
                {/* Price $ — live bookmaker price, with the same LIVE tag used on the Races page */}
                <td style={{ padding: '3px 3px', textAlign: 'right', fontSize: 11, color: '#111827', fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap' }}>
                  {r.price}
                  <span style={{ marginLeft: 3, fontSize: 6, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '1px 3px', borderRadius: 3, letterSpacing: '0.3px' }}>LIVE</span>
                </td>
                {/* Move — price move since open, free for every signed-in user */}
                <td style={{ padding: '3px 3px', textAlign: 'right', fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace,monospace', color: r.moveColor, whiteSpace: 'nowrap' }}>{r.move}</td>
                {/* Value — mirrors: text-[10px] font-semibold, color by threshold */}
                <td style={{ padding: '3px 3px', textAlign: 'right', fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace,monospace', color: r.valColor, whiteSpace: 'nowrap' }}>{r.val}</td>
                {/* Pace — mirrors: text-[8px] font-bold, color=pm.color */}
                <td style={{ padding: '3px 4px', fontSize: 8, fontWeight: 700, color: paceColor[r.pace], whiteSpace: 'nowrap' }}>{r.pace}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// `variant` comes from app/landing/[variant]/page.js (ad traffic, via the
// utm_content rewrite in middleware.js); plain / gets the default copy.
export default async function HomePage({ variant } = {}) {
  const copy = landingVariant(variant);
  const modelStats = copy.noFigures ? null : await getHomepageModelStats();
  return (
    <main className="flex-1 overflow-y-auto flex flex-col">

      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      {/* Tighter top spacing on phones so the sign-up button sits in the first screen. */}
      <section style={{ background: GREEN, padding: 'clamp(32px, 8vw, 96px) 24px clamp(64px, 11vw, 104px)', textAlign: 'center' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          <div className={copy.noFigures ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-10 md:items-center'}>
            <div>
              <div
                className="font-bebas"
                style={{ fontSize: 'clamp(48px, 12vw, 88px)', letterSpacing: '0.06em', lineHeight: 1, marginBottom: 'clamp(18px, 4vw, 32px)' }}
              >
                <span style={{ color: '#fff' }}>WAGING</span>
                <span style={{ color: GOLD }}> WAR</span>
              </div>

              <h1 style={{
                fontSize: 'clamp(22px, 5vw, 38px)', fontWeight: 800, color: '#fff',
                margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.2,
                whiteSpace: 'pre-line',
              }}>
                {copy.headline}
              </h1>

              <p style={{
                fontSize: 'clamp(13px, 2vw, 16px)', color: 'rgba(255,255,255,0.72)',
                margin: '0 auto 24px', maxWidth: 520, lineHeight: 1.6,
              }}>
                {copy.sub}
              </p>

              {/* Free accounts are Clerk-only (no Stripe step); a card is only
                  asked for in the separate Pro trial checkout below. */}
              <SignupCta
                location="hero"
                style={{
                  display: 'inline-block',
                  background: '#fff', color: GREEN, fontWeight: 800, fontSize: 16,
                  padding: '15px 30px', borderRadius: 9, textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                }}
              >
                Sign up free, no card needed
              </SignupCta>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', margin: '12px 0 0' }}>
                Data and analytics. We don&apos;t take bets.
              </p>
            </div>

            {!copy.noFigures && (
              <div>
                <ModelStatsPhone stats={modelStats} />
              </div>
            )}
          </div>

          {/* Mockup shows prices, so it always travels with the PuntersEdge credit. */}
          {!copy.noFigures && (
            <>
              <ProductScreenshot />
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <div style={{ display: 'inline-block', background: '#fff', borderRadius: 6, padding: '4px 10px' }}>
                  <PuntersEdgeCredit />
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── 2. Pricing ───────────────────────────────────────────────────── */}
      <section style={{ background: GREEN, padding: 'clamp(56px, 8vw, 88px) 24px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: '#fff',
            textAlign: 'center', marginBottom: 52, letterSpacing: '-0.01em',
          }}>
            Simple, Transparent Pricing
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ marginBottom: 24 }}>

            {/* Free tier */}
            <div style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 14, padding: '32px 28px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
                Free
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', marginBottom: 4 }}>$0</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 28 }}>Forever free</div>

              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 28 }}>
                {[
                  'Live bookmaker prices',
                  'Move column (price moves)',
                  'Firmer/Drifter chips',
                  'Full odds comparison',
                  'Race results',
                ].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>

              <SignupCta
                location="pricing"
                style={{
                  display: 'block', textAlign: 'center',
                  background: 'rgba(255,255,255,0.1)', color: '#fff',
                  fontWeight: 700, fontSize: 13, padding: '12px 20px',
                  borderRadius: 8, textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                Get Started Free
              </SignupCta>
            </div>

            {/* Pro tier */}
            <div style={{
              background: '#fff', border: `2px solid ${GOLD}`,
              borderRadius: 14, padding: '32px 28px', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                background: GOLD, color: '#fff', fontSize: 10, fontWeight: 800,
                padding: '4px 14px', borderRadius: 20,
                textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap',
              }}>
                Most Popular
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
                Pro
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: TEXT }}>$29</span>
                <span style={{ fontSize: 14, color: '#6b7280' }}>/month</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 28 }}>or $249/yr — save $99</div>

              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 28 }}>
                {[
                  'Full scores + edge',
                  'Pace maps',
                  'Movers & Value Bets',
                  'Bet tracker & P&L',
                  'Blackbook',
                  'Community posting',
                  'Daily competition',
                ].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: TEXT }}>
                    <Check dark />
                    {f}
                  </li>
                ))}
              </ul>

              <CheckoutButton
                interval="month"
                style={{
                  display: 'block', textAlign: 'center',
                  background: GREEN, color: '#fff',
                  fontWeight: 800, fontSize: 14, padding: '13px 20px',
                  borderRadius: 8,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                  width: '100%',
                }}
              >
                Start Free 7-Day Trial
              </CheckoutButton>
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', margin: '10px 0 0' }}>
                7-day free trial · card required · cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. How It Works ──────────────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: 'clamp(56px, 8vw, 88px) 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: TEXT,
            textAlign: 'center', marginBottom: 56, letterSpacing: '-0.01em',
          }}>
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <StepCard step={1} icon="🏇" title="Races Load Automatically"  desc="Every morning's fields are ready before you open the app — no uploads, no setup" />
            <StepCard step={2} icon="📊" title="Model Scores Everything"   desc="Every runner ranked by form, speed, class, pace and connections" />
            <StepCard step={3} icon="💰" title="Find the Value"            desc="See where the model's rating differs from each runner's estimated price to spot value" />
          </div>
        </div>
      </section>

      {/* ── 4. Key Features ──────────────────────────────────────────────── */}
      <section style={{ background: '#F9FAFB', padding: 'clamp(56px, 8vw, 88px) 24px' }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: TEXT,
            textAlign: 'center', marginBottom: 48, letterSpacing: '-0.01em',
          }}>
            Everything You Need on Race Day
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard icon="💹" title="Live Bookmaker Prices" desc="Live prices with the Move column and Firmer/Drifter alerts, free for every signed-in punter" free />
            <FeatureCard icon="🎯" title="Race Scoring"    desc="Proprietary algorithm ranks every runner instantly" />
            <FeatureCard icon="🗺️" title="Pace Maps"       desc="Visualise how each race will be run before it starts" />
            <FeatureCard icon="📈" title="Bet Tracker"     desc="Log bets and track P&L with full analytics" />
            <FeatureCard icon="👥" title="Community"       desc="Share tips and follow top punters" />
            <FeatureCard icon="📖" title="Blackbook"       desc="Track horses you want to follow across meetings" />
            <FeatureCard icon="🏆" title="Daily Competition" desc="Pick winners, earn points and climb the daily leaderboard" />
          </div>
        </div>
      </section>

      {/* ── 5. About ─────────────────────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: 'clamp(56px, 8vw, 88px) 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: TEXT,
            marginBottom: 24, letterSpacing: '-0.01em',
          }}>
            Built By a Punter, For Punters
          </h2>
          <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.85, margin: 0 }}>
            Waging War started as an Excel spreadsheet 5 years ago. After hundreds of hours refining
            the model across thousands of races, it&apos;s now available to serious punters who want
            an edge. This isn&apos;t a tipster service — it&apos;s a tool that helps you make better
            decisions with your own money.
          </p>
        </div>
      </section>

      {/* ── 6. Final CTA ─────────────────────────────────────────────────── */}
      <section style={{
        background: '#0f2e1e',
        padding: 'clamp(64px, 9vw, 100px) 24px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 800, color: '#fff',
            marginBottom: 14, letterSpacing: '-0.01em',
          }}>
            Ready to See Every Race Scored?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 36, lineHeight: 1.7 }}>
            Free account, no card needed. Live prices from day one.
          </p>
          <SignupCta
            location="final"
            style={{
              display: 'inline-block', background: '#fff', color: GREEN,
              fontWeight: 800, fontSize: 15, padding: '16px 40px',
              borderRadius: 10, textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            }}
          >
            Sign Up Free
          </SignupCta>
        </div>
      </section>

    </main>
  );
}
