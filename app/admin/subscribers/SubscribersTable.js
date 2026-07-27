'use client';

import { useEffect, useMemo, useState } from 'react';

const STATUS_COLORS = {
  FREE:      { bg: '#f3f4f6', color: '#374151' },
  TRIAL:     { bg: '#dbeafe', color: '#1e40af' },
  PRO:       { bg: '#dcfce7', color: '#166534' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
  PAST_DUE:  { bg: '#fef3c7', color: '#92400e' },
};

const INTERVAL_LABELS = { month: 'Monthly', year: 'Yearly' };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Mirrors Stripe dashboard's own payment-status wording/coloring: paid
// invoices show green "Succeeded", other invoice statuses get their own
// neutral treatment. (No refund-specific label — Invoice.charge, the
// field that would carry that, is deprecated on recent Stripe API
// versions; see route.js for why it's not expanded.)
function paymentDisplay(entry) {
  if (!entry) return null;
  const amount = ((entry.amountPaid ?? entry.amountDue ?? 0) / 100).toFixed(2);
  const symbol = (entry.currency || '').toUpperCase() === 'AUD' ? '$' : `${(entry.currency || '').toUpperCase()} `;
  if (entry.status === 'paid') return { label: `Succeeded ${symbol}${amount}`, bg: '#dcfce7', color: '#166534' };
  if (entry.status === 'open') return { label: `Open ${symbol}${amount}`, bg: '#fef3c7', color: '#92400e' };
  if (entry.status === 'void') return { label: 'Void', bg: '#f3f4f6', color: '#6b7280' };
  if (entry.status === 'uncollectible') return { label: `Uncollectible ${symbol}${amount}`, bg: '#fee2e2', color: '#991b1b' };
  return { label: entry.status || '—', bg: '#f3f4f6', color: '#374151' };
}

export default function SubscribersTable({ rows }) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('signupDate');
  const [sortDir, setSortDir] = useState('desc');
  const [billing, setBilling] = useState({}); // customerId -> { status, refunded, amountPaid, amountDue, currency } | null

  // Last Payment requires a live Stripe call per subscriber (no bulk
  // "latest invoice per customer" endpoint exists), so it's fetched
  // separately from the initial server-rendered rows rather than blocking
  // the page load — this route independently re-checks isSiteAdmin()
  // server-side, since it's a real client-reachable endpoint.
  useEffect(() => {
    const customerIds = [...new Set(rows.map(r => r.stripeCustomerId).filter(Boolean))];
    if (!customerIds.length) return;
    let cancelled = false;
    fetch(`/api/admin/subscriber-billing?customerIds=${customerIds.join(',')}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (!cancelled) setBilling(data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rows]);

  const counts = useMemo(() => {
    const c = { ALL: rows.length, FREE: 0, TRIAL: 0, PRO: 0, CANCELLED: 0, PAST_DUE: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    let out = statusFilter === 'ALL' ? rows : rows.filter(r => r.status === statusFilter);
    out = [...out].sort((a, b) => {
      let av, bv;
      if (sortBy === 'status') { av = a.status; bv = b.status; }
      else { av = a.signupDate || ''; bv = b.signupDate || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return out;
  }, [rows, statusFilter, sortBy, sortDir]);

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Subscribers</h1>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{rows.length} total users</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['ALL', 'FREE', 'TRIAL', 'PRO', 'CANCELLED', 'PAST_DUE'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 6,
              border: statusFilter === s ? '1.5px solid #00471b' : '1px solid #e5e7eb',
              background: statusFilter === s ? '#f0fdf4' : '#fff',
              color: statusFilter === s ? '#00471b' : '#374151',
              cursor: 'pointer',
            }}
          >
            {s} ({counts[s] || 0})
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto', border: '0.5px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Email</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Name</th>
              <th
                onClick={() => toggleSort('signupDate')}
                style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}
              >
                Signup date {sortBy === 'signupDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                onClick={() => toggleSort('status')}
                style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}
              >
                Status {sortBy === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Trial ends</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Next billing</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Billing interval</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Last payment</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => {
              const colors = STATUS_COLORS[r.status] || STATUS_COLORS.FREE;
              const intervalLabel = INTERVAL_LABELS[r.billingInterval] || '—';
              const payment = r.stripeCustomerId ? paymentDisplay(billing[r.stripeCustomerId]) : null;
              return (
                <tr key={r.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', color: '#111827' }}>{r.email}</td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{r.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{fmtDate(r.signupDate)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: colors.bg, color: colors.color }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.status === 'TRIAL' ? fmtDate(r.trialEnd) : '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.status === 'PRO' ? fmtDate(r.nextBilling) : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {intervalLabel === '—' ? (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#374151' }}>
                        {intervalLabel}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {payment ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: payment.bg, color: payment.color }}>
                        {payment.label}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No users match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
