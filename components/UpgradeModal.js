'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useIsMobile from '@/hooks/useIsMobile';
import BottomSheet from '@/components/BottomSheet';

const PLAN = {
  label: 'Pro', monthly: 29, annual: 249,
  features: ['Full race scores & rankings', 'Movers', 'Value bets', 'Pace Maps', 'Blackbook', 'Bet tracker', 'Community posting', 'Sectionals'],
};

function annualSavings() {
  const fullYear = PLAN.monthly * 12;
  return Math.round(fullYear - PLAN.annual);
}

function ProModal() {
  const [interval, setInterval_] = useState('year'); // annual default
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const price = interval === 'year' ? PLAN.annual : PLAN.monthly;
  const priceLabel = interval === 'year' ? `$${price}/yr` : `$${price}/mo`;

  async function checkout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout — try again');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start checkout — try again');
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Pro feature</div>
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

      <div style={{ border: '2px solid #00471b', borderRadius: 10, padding: 14, position: 'relative', background: '#f0fdf4', marginBottom: 14 }}>
        {interval === 'year' && (
          <div style={{ position: 'absolute', top: -9, right: 10, background: '#fbbf24', color: '#111827', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
            Save ${annualSavings()}/yr
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{PLAN.label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#00471b', margin: '4px 0 10px' }}>{priceLabel}</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {PLAN.features.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#374151' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#16a34a', flexShrink: 0, fontWeight: 700, marginTop: 1 }}>✓</span>
              {f}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={loading}
          onClick={checkout}
          style={{
            display: 'block', width: '100%', padding: '10px 0', background: '#00471b',
            color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Redirecting…' : 'Start free trial'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
    </>
  );
}

export default function UpgradeModal({ onClose }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(true); }, []);

  const content = <ProModal />;

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
          style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', maxWidth: 380, width: '100%', pointerEvents: 'auto', position: 'relative' }}
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
