export const metadata = {
  title: 'FAQ — Waging War',
  description: 'Answers to common questions about Waging War — how the model works, Free vs Pro, bet tracking, and responsible gambling support.',
};

const FAQS = [
  {
    q: 'What is Waging War?',
    a: "Waging War is a horse racing analytics platform for serious Australian punters. We score and rank every runner in every race using a proprietary model, then give you the tools to track your bets and measure your actual results against it.",
  },
  {
    q: 'Is this a tipping service?',
    a: "No. We don't tell you what to bet — we give you a data-driven ranking of every runner so you can make your own informed decision. Our Daily Model Summary shows the model's real performance, including the races it gets wrong.",
  },
  {
    q: 'How does the ranking model work?',
    a: "Our algorithm scores every runner using form, speed, class, and track/condition data, updated as fields and conditions change. We don't publish the exact formula, but we do publish our results — see our Model Performance page for daily strike rate, streaks, and odds-band breakdowns.",
  },
  {
    q: "What's the difference between Free and Pro?",
    a: 'Free gives you access to basic race fields and results. Pro ($29/month) unlocks full model scores and rankings, bet tracking with P&L analysis, tipping competitions, and community features.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — Pro is a monthly subscription with no lock-in contract. Cancel anytime from your account settings.',
  },
  {
    q: 'Which races does Waging War cover?',
    a: 'All major Australian thoroughbred meetings, metro through provincial and country, updated daily as fields are finalised.',
  },
  {
    q: 'How does bet tracking work?',
    a: 'Log your bets (stake, odds, bookmaker) as you place them, and Waging War automatically settles them against official results — giving you real P&L, ROI, and strike rate over time, not guesswork.',
  },
  {
    q: 'Does Waging War place bets for me?',
    a: "No. We don't hold funds or place bets on your behalf. You bet directly with your own bookmaker; Waging War is purely an analytics and tracking tool.",
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your bets, picks, and account data are private to you unless you explicitly choose to share them (e.g. in a tipping competition).',
  },
  {
    q: "I'm worried about my gambling — where can I get help?",
    a: "Waging War is a tool for punters who already bet — it's not designed to encourage betting, and we include responsible gambling messaging and helpline information (1800 858 858) throughout the site. If gambling is causing you harm, please reach out for support.",
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
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

export default function FaqPage() {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      {/* ── Header ── */}
      <div style={{ background: '#1B4332', padding: '44px 24px 36px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Frequently Asked Questions
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.65 }}>
            Everything you need to know about Waging War.
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 48px' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {FAQS.map(({ q, a }) => (
            <Section key={q} title={q}>
              <P>{a}</P>
            </Section>
          ))}
        </div>
      </div>
    </div>
  );
}
