'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useIsMobile from '@/hooks/useIsMobile';
import BottomSheet from '@/components/BottomSheet';

const MONTHLY_URL = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '#upgrade';
const ANNUAL_URL  = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_URL  || '#upgrade';

const FEATURES = [
  'Full race scores & rankings',
  'Value bets',
  'Pace maps',
  'Blackbook',
  'Community posting & points',
];

export default function UpgradeModal({ onClose }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(true); }, []);

  const content = (
    <>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Pro feature</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>Unlock full access with a 7-day free trial</div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FEATURES.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#16a34a', flexShrink: 0, fontWeight: 700 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, marginTop: -8 }}>...and more coming soon</div>

      <
        href={MONTHLY_URL}
        style={{ display: 'block', width: '100%', padding: '13px 0', background: '#00471b', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
      >
        Start free trial — $29/month
      </a>
      <div style={{ textAlign: 'center', marginTop: 10, paddingBottom: isMobile ? 8 : 0 }}>
        <a href={ANNUAL_URL} style={{ fontSize: 12, color: '#6b7280', textDecoration: 'underline', cursor: 'pointer' }}>
          View annual plan ($249/year)
        </a>
      </div>
    </>
  );

  if (isMobile) {
    return createPortal(
      <BottomSheet isOpen={open} onClose={onClose} title="Waging War Pro">
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
