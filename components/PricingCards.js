import CheckoutButton from '@/components/CheckoutButton';
import SignupCta from '@/components/SignupCta';

// Free / Pro plan cards, shared by the home page pricing section and
// /pricing so the wording can't drift between the two. `annual` adds a
// separate Pro annual card (/pricing); the home page shows the annual price
// as a line under the monthly one. Both Pro intervals get the 7-day trial,
// card required (app/api/create-checkout-session/route.js).
const GREEN = '#1B4332';
const GOLD  = '#B7791F';
const TEXT  = '#111827';

const FREE_FEATURES = [
  'Live bookmaker prices',
  'Move column (price moves)',
  'Firmer/Drifter chips',
  'Full odds comparison',
  'Race results',
];

const PRO_FEATURES = [
  'Full scores + edge',
  'Pace maps',
  'Movers & Value Bets',
  'Bet tracker & P&L',
  'Blackbook',
  'Community posting',
  'Daily competition',
];

function Check({ dark }) {
  return <span style={{ color: dark ? GREEN : '#86efac', flexShrink: 0 }}>✓</span>;
}

const proCard = { background: '#fff', border: `2px solid ${GOLD}`, borderRadius: 14, padding: '32px 28px', position: 'relative' };
const planLabel = { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 };
const trialButton = {
  display: 'block', textAlign: 'center',
  background: GREEN, color: '#fff',
  fontWeight: 800, fontSize: 14, padding: '13px 20px',
  borderRadius: 8,
  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
  width: '100%',
};

function ProFeatures() {
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 28 }}>
      {PRO_FEATURES.map(f => (
        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: TEXT }}>
          <Check dark />
          {f}
        </li>
      ))}
    </ul>
  );
}

function TrialNote() {
  return (
    <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', margin: '10px 0 0' }}>
      7-day free trial · card required · cancel anytime
    </p>
  );
}

export default function PricingCards({ annual = false, ctaLocation = 'pricing' }) {
  return (
    <div className={`grid grid-cols-1 ${annual ? 'lg:grid-cols-3' : 'md:grid-cols-2'} gap-6`} style={{ marginBottom: 24 }}>

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
          {FREE_FEATURES.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
              <Check />
              {f}
            </li>
          ))}
        </ul>

        <SignupCta
          location={ctaLocation}
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

      {/* Pro tier (monthly) */}
      <div style={proCard}>
        <div style={{
          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          background: GOLD, color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '4px 14px', borderRadius: 20,
          textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap',
        }}>
          Most Popular
        </div>

        <div style={planLabel}>Pro</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 38, fontWeight: 800, color: TEXT }}>$29</span>
          <span style={{ fontSize: 14, color: '#6b7280' }}>/month</span>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 28 }}>or $249/yr — save $99</div>

        <ProFeatures />
        <CheckoutButton interval="month" style={trialButton}>
          Start Free 7-Day Trial
        </CheckoutButton>
        <TrialNote />
      </div>

      {/* Pro tier (annual) — /pricing only */}
      {annual && (
        <div style={proCard}>
          <div style={planLabel}>Pro Annual</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 38, fontWeight: 800, color: TEXT }}>$249</span>
            <span style={{ fontSize: 14, color: '#6b7280' }}>/year</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 28 }}>save $99 vs monthly</div>

          <ProFeatures />
          <CheckoutButton interval="year" style={trialButton}>
            Start Free 7-Day Trial
          </CheckoutButton>
          <TrialNote />
        </div>
      )}
    </div>
  );
}
