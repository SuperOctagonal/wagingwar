export const metadata = {
  title: 'Responsible Gambling — Waging War',
};

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 10, paddingBottom: 8, borderBottom: '0.5px solid #e5e7eb' }}>
        {title}
      </h2>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }) {
  return <p style={{ marginBottom: 10 }}>{children}</p>;
}

function Ul({ items }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <li key={i} style={{ listStyleType: 'disc', color: '#374151' }}>{item}</li>
      ))}
    </ul>
  );
}

function HelpCard({ name, number, href, desc }) {
  return (
    <a
      href={href}
      style={{ display: 'block', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', textDecoration: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s' }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 3 }}>{name}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#00471b', marginBottom: 5, letterSpacing: '-0.01em' }}>{number}</div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{desc}</div>
    </a>
  );
}

export default function ResponsibleGamblingPage() {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1B4332', padding: '44px 24px 36px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛑</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Responsible Gambling
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.65 }}>
            Gambling should be fun. If it stops being fun, help is available right now.
          </p>
        </div>
      </div>

      {/* ── Help numbers — prominent at top ── */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e7eb', padding: '28px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14, textAlign: 'center' }}>
            Free, confidential support — 24 hours a day
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HelpCard
              name="Gambling Help Online"
              number="1800 858 858"
              href="tel:1800858858"
              desc="Free counselling and support for people affected by gambling. Available 24/7."
            />
            <HelpCard
              name="Lifeline Australia"
              number="13 11 14"
              href="tel:131114"
              desc="Crisis support and suicide prevention. Available 24 hours a day, 7 days a week."
            />
            <HelpCard
              name="BetStop — National Register"
              number="1800 238 786"
              href="https://www.betstop.gov.au"
              desc="Australia's free national self-exclusion register. Block yourself from all licensed bookmakers at once."
            />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 48px' }}>

        {/* Disclaimer card */}
        <div style={{ background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: 10, padding: '20px 24px', marginBottom: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>Important disclaimer</div>
          <p style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.75, margin: 0 }}>
            Waging War is a horse racing <strong>analytics and information tool only</strong>. It does not
            provide financial advice, betting tips, or recommendations to place any wager. All analysis,
            scores, and model outputs are for informational purposes only. You are solely responsible for
            any betting decisions you make.
          </p>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

          <Section title="Gambling Involves Risk">
            <P>
              All forms of gambling carry financial risk. The house edge means that over time, most
              gamblers lose money. No system, tool, or analytical model — including Waging War — can
              guarantee profits or remove the inherent risk of betting.
            </P>
            <P>
              <strong>Never bet more than you can afford to lose.</strong> This is the single most
              important principle of responsible gambling. Your rent, bills, groceries, and financial
              obligations must always come before gambling.
            </P>
          </Section>

          <Section title="Signs of Problem Gambling">
            <P>Gambling may be becoming a problem if you:</P>
            <Ul items={[
              'Spend more time or money gambling than you intended',
              'Borrow money or sell possessions to fund gambling',
              'Feel anxious, irritable or restless when not gambling',
              'Chase losses by placing bigger or more frequent bets',
              'Hide your gambling activity from family or friends',
              'Neglect work, study, or personal relationships because of gambling',
              'Continue gambling despite wanting to stop',
            ]} />
            <P>
              If any of these apply to you or someone you know, please reach out for support.
              Help is free, confidential, and available right now.
            </P>
          </Section>

          <Section title="How to Stay in Control">
            <Ul items={[
              'Set a strict budget before you start and stick to it',
              'Treat gambling as entertainment, not a way to make money',
              'Take regular breaks — never gamble for extended periods',
              'Do not gamble when tired, stressed, or emotionally vulnerable',
              'Never chase losses — accept them as the cost of entertainment',
              'Set time limits and use your bookmaker\'s responsible gambling tools',
              'Keep a record of your bets so you have an honest picture of your spending',
            ]} />
          </Section>

          <Section title="BetStop — National Self-Exclusion Register">
            <P>
              <strong>BetStop</strong> is Australia&apos;s free national self-exclusion register,
              operated by the Australian Communications and Media Authority (ACMA). It allows you to
              exclude yourself from all licensed Australian online wagering services in a single step.
            </P>
            <Ul items={[
              'Free to use — no cost to register',
              'Covers all licensed online bookmakers in Australia simultaneously',
              'You choose the exclusion period: 3 months, 1 year, 5 years, or permanent',
              'Bookmakers are legally required to close your account and return your funds',
            ]} />
            <P>
              Register at{' '}
              <a href="https://www.betstop.gov.au" style={{ color: '#00471b', fontWeight: 600 }}>
                betstop.gov.au
              </a>{' '}
              or call <a href="tel:1800238786" style={{ color: '#00471b', fontWeight: 600 }}>1800 238 786</a>.
            </P>
          </Section>

          <Section title="Waging War Is Not Financial Advice">
            <P>
              Waging War provides horse racing data analysis, scoring models, and community discussion.
              Nothing on this platform should be interpreted as:
            </P>
            <Ul items={[
              'A recommendation to place any bet or wager',
              'Financial, investment, or professional advice of any kind',
              'A guarantee of profit or positive returns',
              'A system that removes the risk of gambling',
            ]} />
            <P>
              Our scoring models analyse historical form, track conditions, and statistical factors.
              They do not predict race outcomes and cannot account for the full uncertainty of
              horse racing. Past model performance does not guarantee future results.
            </P>
          </Section>

          <Section title="Your Responsibility">
            <P>
              By using Waging War you confirm that:
            </P>
            <Ul items={[
              'You are of legal gambling age in your state or territory',
              'You gamble only with money you can afford to lose',
              'You make all betting decisions independently and at your own risk',
              'You understand that Waging War does not recommend or facilitate any bet',
            ]} />
          </Section>

          <Section title="Further Resources">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Gambling Help Online', url: 'https://www.gamblinghelponline.org.au', desc: 'Online chat, forums, and self-help tools for gambling issues' },
                { label: 'BetStop — National Self-Exclusion', url: 'https://www.betstop.gov.au', desc: 'Exclude yourself from all licensed Australian bookmakers at once' },
                { label: 'Lifeline Australia', url: 'https://www.lifeline.org.au', desc: 'Crisis support for people in emotional distress — 13 11 14' },
                { label: 'Relationships Australia', url: 'https://www.relationships.org.au', desc: 'Support for families and relationships affected by problem gambling' },
                { label: 'MindSpot Clinic', url: 'https://www.mindspot.org.au', desc: 'Free online mental health assessment and treatment programs' },
              ].map(r => (
                <div key={r.url} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: '#f9fafb', borderRadius: 7, border: '0.5px solid #e5e7eb' }}>
                  <i className="ti ti-external-link" style={{ fontSize: 14, color: '#00471b', marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <a href={r.url} style={{ fontSize: 13, fontWeight: 700, color: '#00471b', textDecoration: 'none' }}>{r.label}</a>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
