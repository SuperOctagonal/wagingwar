'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useIsMobile from '@/hooks/useIsMobile';
import BottomSheet from '@/components/BottomSheet';

// Old static Payment Links -- kept as the fallback path while
// NEXT_PUBLIC_LITE_ENABLED is off (default), so the modal/pricing behave
// exactly as they did before the Lite tier existed. Once the flag flips on,
// these are unused (checkout goes through /api/create-checkout-session
// instead, which can express trial_period_days/payment_method_collection/
// metadata in code -- a static Payment Link can't).
const MONTHLY_URL = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '#upgrade';
const ANNUAL_URL  = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_URL  || '#upgrade';
const LITE_ENABLED = process.env.NEXT_PUBLIC_LITE_ENABLED === 'true' || process.env.NEXT_PUBLIC_LITE_ENABLED === '1';

const OLD_FEATURES = [
  'Full race scores & rankings',
  'Value bets',
  'Pace maps',
  'Blackbook',
  'Community posting & points',
];

const PLANS = {
  lite: {
    label: 'Lite', monthly: 14.99, annual: 129,
    features: ['Full race scores & rankings', 'Live odds', 'Movers', 'Value bets'],
  },
  pro: {
    label: 'Pro', monthly: 29, annual: 249,
    features: ['Everything in Lite', 'Pace Maps', 'Blackbook', 'Bet tracker', 'Community posting', 'Sectionals'],
  },
};

function annualSavings(plan) {
  const fullYear = PLANS[plan].monthly * 12;
  return Math.round(fullYear - PLANS[plan].annual);
}

function OldStaticModal() {
  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Pro feature</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>Unlock full access with a 7-day free trial</div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OLD_FEATURES.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#16a34a', flexShrink: 0, fontWeight: 700 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, marginTop: -8 }}>...and more coming soon</div>

      <a
        href={MONTHLY_URL}
        style={{ display: 'block', width: '100%', padding: '13px 0', background: '#00471b', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
      >
        Start free trial — $29/month
      </a>
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <a href={ANNUAL_URL} style={{ fontSize: 12, color: '#6b7280', textDecoration: 'underline', cursor: 'pointer' }}>
          View annual plan ($249/year)
        </a>
      </div>
    </>
  );
}

function PlanCard({ plan, interval, selected, onSelect, onCheckout, loadingPlan }) {
  const p = PLANS[plan];
  const price = interval === 'year' ? p.annual : p.monthly;
  const priceLabel = interval === 'year' ? `$${price}/yr` : `$${price}/mo`;
  const isLoading = loadingPlan === plan;
  return (
    <div
      onClick={() => onSelect(plan)}
      style={{
        flex: 1, border: `2px solid ${selected ? '#00471b' : '#e5e7eb'}`, borderRadius: 10, padding: 14,
        cursor: 'pointer', position: 'relative', background: selected ? '#f0fdf4' : '#fff',
      }}
    >
      {interval === 'year' && (
        <div style={{ position: 'absolute', top: -9, right: 10, background: '#fbbf24', color: '#111827', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
          Save ${annualSavings(plan)}/yr
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{p.label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#00471b', margin: '4px 0 10px' }}>{priceLabel}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {p.features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#374151' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#16a34a', flexShrink: 0, fontWeight: 700, marginTop: 1 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={isLoading}
        onClick={e => { e.stopPropagation(); onCheckout(plan); }}
        style={{
          display: 'block', width: '100%', padding: '10px 0', background: selected ? '#00471b' : '#f3f4f6',
          color: selected ? '#fff' : '#374151', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700,
          cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? 'Redirecting…' : `Start ${p.label}`}
      </button>
    </div>
  );
}

function TwoPlanModal({ onClose }) {
  const [interval, setInterval_] = useState('year'); // annual default
  const [selected, setSelected] = useState('pro');
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);

  async function checkout(plan) {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout — try again');
        setLoadingPlan(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start checkout — try again');
      setLoadingPlan(null);
    }
  }

  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Choose your plan</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>7-day free trial, card required, cancel anytime</div>

      <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 14 }}>
        {['month', 'year'].map(iv => (
          <button
            key={iv}
            type="button"
            onClick={() => setInterval_(iv)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: interval === iv ? '#fff' : 'transparent',
              color: interval === iv ? '#111827' : '#6b7280',
              boxShadow: interval === iv ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {iv === 'month' ? 'Monthly' : 'Annual'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <PlanCard plan="lite" interval={interval} selected={selected === 'lite'} onSelect={setSelected} onCheckout={checkout} loadingPlan={loadingPlan} />
        <PlanCard plan="pro" interval={interval} selected={selected === 'pro'} onSelect={setSelected} onCheckout={checkout} loadingPlan={loadingPlan} />
      </div>

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
    </>
  );
}

export default function UpgradeModal({ onClose }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(true); }, []);

  const content = LITE_ENABLED ? <TwoPlanModal onClose={onClose} /> : <OldStaticModal />;

  if (isMobile) {
    return createPortal(
      <BottomSheet isOpen={open} onClose={onClose} title="Waging War">
        <div style={{ padding: '16px 20px 24px' }}>
          {content}
        </div>
      </BottomSheet>,
      document.body
    );
  }

  const modal = (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
        onClick={onClose}
      />
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
        <div
          style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', maxWidth: LITE_ENABLED ? 460 : 380, width: '100%', pointerEvents: 'auto', position: 'relative' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', lineHeight: 1, padding: 0 }}
            aria-label="Close"
          >✕</button>

          <div style={{ fontSize: 17, fontWeight: 800, color: '#00471b', letterSpacing: '0.04em', marginBottom: 14 }}>
            Waging War
          </div>

          {content}
        </div>
      </div>
    </>
  );
  return createPortal(modal, document.body);
}
