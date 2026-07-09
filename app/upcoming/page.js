const MONTHLY_URL = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '#upgrade';
const ANNUAL_URL  = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_URL  || '#upgrade';

const STATUS = {
  live:    { emoji: '✅', label: 'Live',            bg: '#dcfce7', color: '#15803d' },
  dev:     { emoji: '🔨', label: 'In Development', bg: '#fef3c7', color: '#92400e' },
  soon:    { emoji: '🔜', label: 'Coming Soon',    bg: '#dbeafe', color: '#1e40af' },
  planned: { emoji: '💡', label: 'Planned',         bg: '#f3f4f6', color: '#374151' },
};

const SECTIONS = [
  {
    title: 'Data & Automation',
    icon: 'ti-database',
    features: [
      { icon: 'ti-calendar-event', title: 'Auto-loaded daily race fields',  desc: 'Race fields load automatically each morning — no more manual CSV uploads.',                          status: 'live',    subscriber: true  },
      { icon: 'ti-bell-ringing',   title: 'Live scratchings display',       desc: 'See scratched horses marked instantly on every race card as they come in.',                          status: 'live',    subscriber: true  },
      { icon: 'ti-cloud',          title: 'Track condition auto-updates',   desc: 'Track conditions update automatically throughout the day as official reports come in.',                status: 'dev',     subscriber: false },
    ],
  },
  {
    title: 'Mobile App',
    icon: 'ti-device-mobile',
    features: [
      { icon: 'ti-brand-android', title: 'Android app',   desc: 'Native Android app with full access to race analysis, blackbook and community.',               status: 'planned', subscriber: false },
      { icon: 'ti-brand-apple',   title: 'iOS app',       desc: 'Native iPhone and iPad app — designed for quick race-day decisions on the go.',                status: 'soon',    subscriber: false },
      { icon: 'ti-wifi-off',      title: 'Offline mode',  desc: 'Download race fields ahead of time and use the app without an internet connection.',           status: 'planned', subscriber: true  },
    ],
  },
  {
    title: 'Betting Tools',
    icon: 'ti-currency-dollar',
    features: [
      { icon: 'ti-arrows-exchange', title: 'Live odds vs model price',             desc: 'Side-by-side comparison of live market odds against our model price in real time.',              status: 'soon',    subscriber: true  },
      { icon: 'ti-calculator',      title: 'Kelly criterion staking calculator',   desc: 'Calculate optimal bet sizing based on your edge and bank size using the Kelly formula.',        status: 'soon',    subscriber: true  },
      { icon: 'ti-divide',          title: 'Dutching calculator',                  desc: 'Spread risk across multiple runners to guarantee a target return regardless of the winner.',   status: 'planned', subscriber: true  },
      { icon: 'ti-list-numbers',    title: 'Multi/parlay builder',                 desc: 'Build and analyse multi bets with combined probability and expected value calculations.',       status: 'planned', subscriber: true  },
    ],
  },
  {
    title: 'Analytics & Results',
    icon: 'ti-chart-bar',
    features: [
      { icon: 'ti-flag-check',   title: 'Auto-populated results',                  desc: 'Race results flow in automatically after each race — no manual entry required.',                            status: 'live',    subscriber: false },
      { icon: 'ti-chart-line',   title: 'Performance breakdown by jockey/trainer', desc: 'Filter your results by jockey, trainer, and track to find your strongest angles.',                        status: 'soon',    subscriber: true  },
      { icon: 'ti-target',       title: 'Model accuracy tracking',                 desc: 'See how often our model\'s top-ranked horse wins across different race types and conditions.',             status: 'live',    subscriber: false },
      { icon: 'ti-users-group',  title: 'Tipster comparison',                      desc: 'Compare your ROI against other members and public tipsters on the platform leaderboard.',                  status: 'planned', subscriber: false },
    ],
  },
  {
    title: 'Community',
    icon: 'ti-users',
    features: [
      { icon: 'ti-messages', title: 'Live race day chat',        desc: 'Real-time chat room active during race meetings — discuss races as they happen.',    status: 'soon', subscriber: true  },
      { icon: 'ti-trophy',   title: 'Tipping competitions',      desc: 'Weekly and monthly competitions where members tip races for points and prizes.',     status: 'live', subscriber: false },
      { icon: 'ti-podium',   title: 'Weekly P&L leaderboard',   desc: 'See the top performing bettors each week ranked by profit and loss.',               status: 'soon', subscriber: false },
      { icon: 'ti-badge',    title: 'Verified subscriber badge', desc: 'A gold badge on your community profile showing you\'re a paying subscriber.',       status: 'planned', subscriber: true  },
    ],
  },
  {
    title: 'Syndicate & Social',
    icon: 'ti-share',
    features: [
      { icon: 'ti-share-3',   title: 'Share selections',              desc: 'Share your race day picks with a link — let others see your analysis before the jump.',      status: 'planned', subscriber: true },
      { icon: 'ti-lock-open', title: 'Private group syndicates',      desc: 'Create a private group, pool selections, and track shared performance together.',           status: 'planned', subscriber: true },
      { icon: 'ti-copy',      title: 'Copy-bet from top tipsters',    desc: 'Follow top-performing members and mirror their bets automatically at your stake size.',    status: 'planned', subscriber: true },
    ],
  },
];

export default function UpcomingPage() {
  return (
    <div className="flex-1 overflow-y-auto mob-page">

      {/* ── Hero ── */}
      <div style={{ background: '#1B4332', padding: '52px 24px 44px', textAlign: 'center' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '4px 14px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 18 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', flexShrink: 0, display: 'inline-block' }} />
            Product Roadmap
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '0 0 14px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            What&apos;s Coming to Waging War
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.65 }}>
            We&apos;re constantly building. Here&apos;s what&apos;s in the pipeline for subscribers.
          </p>
        </div>
      </div>

      {/* ── Status legend ── */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e7eb', padding: '10px 20px', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
        {Object.values(STATUS).map(s => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.emoji} {s.label}
          </span>
        ))}
      </div>

      {/* ── Sections ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 8px' }}>
        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 52 }}>

            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#1B4332', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${section.icon}`} style={{ fontSize: 17, color: '#fff' }} />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.01em' }}>{section.title}</h2>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>

            {/* Feature cards — 3-col desktop / 1-col mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {section.features.map(feature => {
                const st = STATUS[feature.status];
                return (
                  <div
                    key={feature.title}
                    style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  >
                    {/* Icon + text */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`ti ${feature.icon}`} style={{ fontSize: 17, color: '#00471b' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 5, lineHeight: 1.35 }}>{feature.title}</div>
                        <p style={{ fontSize: 11, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>{feature.desc}</p>
                      </div>
                    </div>

                    {/* Footer: status + subscriber badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                        {st.emoji} {st.label}
                      </span>
                      {feature.subscriber && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#fef3c7', color: '#B7791F', border: '1px solid #fcd34d', whiteSpace: 'nowrap' }}>
                          ★ Subscriber Only
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── CTA banner ── */}
      <div style={{ background: '#1B4332', padding: '52px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Get early access to everything
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: '0 0 28px', lineHeight: 1.65 }}>
            Subscribe now and be first to access every feature as it launches.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a
              href={MONTHLY_URL}
              style={{ display: 'inline-block', padding: '13px 28px', background: '#fff', color: '#1B4332', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Subscribe — $29/mo
            </a>
            <a
              href={ANNUAL_URL}
              style={{ display: 'inline-block', padding: '13px 28px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Best Value — $249/yr
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}
