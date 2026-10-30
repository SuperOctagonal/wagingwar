import PricingCards from '@/components/PricingCards';

export const metadata = {
  title: 'Pricing: Free and Pro Plans',
  description: "Free: live prices and race results. Pro: $29/month or $249/year, 7-day free trial (card required). Data and analytics only, we don't take bets.",
};

const GREEN = '#1B4332';

// Same plan cards (and wording) as the home page pricing section, plus the
// Pro annual plan as its own card. The 18+/Gambling Help line comes from the
// global footer (components/FooterChrome.js).
export default function PricingPage() {
  return (
    <main className="flex-1 overflow-y-auto flex flex-col">
      <section style={{ background: GREEN, padding: 'clamp(40px, 7vw, 80px) 24px', flex: 1 }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <h1 style={{
            fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: '#fff',
            textAlign: 'center', margin: '0 0 12px', letterSpacing: '-0.01em',
          }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.72)', margin: '0 0 48px' }}>
            Data and analytics. We don&apos;t take bets.
          </p>

          <PricingCards annual ctaLocation="pricing-page" />
        </div>
      </section>
    </main>
  );
}
