import Link from 'next/link';

export const metadata = {
  title: 'Waging War — Australian Horse Racing Analytics',
  description: "Australia's most advanced horse racing analytics platform. Score and rank every runner in every race in seconds.",
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

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12,
      padding: '24px 20px', boxShadow: '0 1px 5px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function Check({ dark }) {
  return <span style={{ color: dark ? GREEN : '#86efac', flexShrink: 0 }}>✓</span>;
}

export default function HomePage() {
  const stripeMonthlyUrl = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '/sign-up';

  return (
    <main className="flex-1 overflow-y-auto flex flex-col">

      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      <section style={{ background: GREEN, padding: 'clamp(56px, 10vw, 96px) 24px clamp(64px, 11vw, 104px)', textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {/* Logo mark */}
          <div
            className="font-bebas"
            style={{ fontSize: 'clamp(52px, 12vw, 88px)', letterSpacing: '0.06em', lineHeight: 1, marginBottom: 32 }}
          >
            <span style={{ color: '#fff' }}>WAGING</span>
            <span style={{ color: GOLD }}> WAR</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(22px, 5vw, 38px)', fontWeight: 800, color: '#fff',
            margin: '0 0 18px', letterSpacing: '-0.02em', lineHeight: 1.2,
          }}>
            Back Winners With Data,<br />Not Hunches
          </h1>

          <p style={{
            fontSize: 'clamp(13px, 2vw, 16px)', color: 'rgba(255,255,255,0.72)',
            margin: '0 auto 40px', maxWidth: 520, lineHeight: 1.7,
          }}>
            Australia&apos;s most advanced horse racing analytics platform.
            Score and rank every runner in every race in seconds.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
            <Link
              href="/sign-up"
              style={{
                background: '#fff', color: GREEN, fontWeight: 800, fontSize: 14,
                padding: '14px 30px', borderRadius: 9, textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              }}
            >
              Start Free 7-Day Trial
            </Link>
            <Link
              href="/sign-in"
              style={{
                background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 14,
                padding: '13px 30px', borderRadius: 9, textDecoration: 'none',
                border: '1.5px solid rgba(255,255,255,0.55)',
              }}
            >
              Sign In
            </Link>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            No credit card required
          </p>
        </div>
      </section>

      {/* ── 2. How It Works ──────────────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: 'clamp(56px, 8vw, 88px) 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: TEXT,
            textAlign: 'center', marginBottom: 56, letterSpacing: '-0.01em',
          }}>
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <StepCard step={1} icon="🏇" title="Load Your Races"         desc="Upload the daily race fields in seconds" />
            <StepCard step={2} icon="📊" title="Model Scores Everything" desc="Every runner ranked by form, speed, class, pace and connections" />
            <StepCard step={3} icon="💰" title="Find the Value"          desc="Compare model prices against live market odds to find the edge" />
          </div>
        </div>
      </section>

      {/* ── 3. Key Features ──────────────────────────────────────────────── */}
      <section style={{ background: '#F9FAFB', padding: 'clamp(56px, 8vw, 88px) 24px' }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: TEXT,
            textAlign: 'center', marginBottom: 48, letterSpacing: '-0.01em',
          }}>
            Everything You Need on Race Day
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard icon="🎯" title="Race Scoring"    desc="Proprietary algorithm ranks every runner instantly" />
            <FeatureCard icon="🗺️" title="Pace Maps"       desc="Visualise how each race will be run before it starts" />
            <FeatureCard icon="📈" title="Bet Tracker"     desc="Log bets and track P&L with full analytics" />
            <FeatureCard icon="👥" title="Community"       desc="Share tips and follow top punters" />
            <FeatureCard icon="📖" title="Blackbook"       desc="Track horses you want to follow across meetings" />
            <FeatureCard icon="💹" title="Model vs Market" desc="See exactly where your price differs from the TAB" />
          </div>
        </div>
      </section>

      {/* ── 4. About ─────────────────────────────────────────────────────── */}
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

      {/* ── 5. Pricing ───────────────────────────────────────────────────── */}
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
                  '3 meetings per day',
                  'Basic scores',
                  'Community (read-only)',
                  'Bet tracker (10 bets/month)',
                ].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/sign-up"
                style={{
                  display: 'block', textAlign: 'center',
                  background: 'rgba(255,255,255,0.1)', color: '#fff',
                  fontWeight: 700, fontSize: 13, padding: '12px 20px',
                  borderRadius: 8, textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                Get Started Free
              </Link>
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
                  'Unlimited meetings',
                  'Full scores + edge',
                  'Pace maps',
                  'Unlimited bet tracker',
                  'Blackbook',
                  'Community posting',
                  'Model vs market odds',
                ].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: TEXT }}>
                    <Check dark />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={stripeMonthlyUrl}
                style={{
                  display: 'block', textAlign: 'center',
                  background: GREEN, color: '#fff',
                  fontWeight: 800, fontSize: 14, padding: '13px 20px',
                  borderRadius: 8, textDecoration: 'none',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                }}
              >
                Start Free 7-Day Trial
              </a>
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            7-day free trial. Cancel anytime.
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
            Ready to Find More Winners?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 36, lineHeight: 1.7 }}>
            Join punters who use data to beat the market.
          </p>
          <Link
            href="/sign-up"
            style={{
              display: 'inline-block', background: '#fff', color: GREEN,
              fontWeight: 800, fontSize: 15, padding: '16px 40px',
              borderRadius: 10, textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            }}
          >
            Start Free Trial
          </Link>
        </div>
      </section>

    </main>
  );
}
