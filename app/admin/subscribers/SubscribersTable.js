'use client';

import { useEffect, useMemo, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import { Chip, DateRange, ToggleButton, C, fmtDate } from '@/components/admin/AdminUi';
import { aestDay } from '@/lib/aestDay';

export const STATUS_COLORS = {
  FREE:      { bg: '#f3f4f6', color: '#374151' },
  TRIAL:     { bg: '#dbeafe', color: '#1e40af' },
  PRO:       { bg: '#dcfce7', color: '#166534' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
  PAST_DUE:  { bg: '#fef3c7', color: '#92400e' },
  UNKNOWN:   { bg: '#e5e7eb', color: '#374151' },
};

const INTERVAL_LABELS = { month: 'Monthly', year: 'Yearly' };

// Mirrors Stripe dashboard's own payment-status wording/coloring: paid
// invoices show green "Succeeded", other invoice statuses get their own
// neutral treatment. (No refund-specific label — Invoice.charge, the
// field that would carry that, is deprecated on recent Stripe API
// versions; see route.js for why it's not expanded.)
function paymentDisplay(entry) {
  if (!entry) return null;
  const amount = ((entry.amountPaid ?? entry.amountDue ?? 0) / 100).toFixed(2);
  const symbol = (entry.currency || '').toUpperCase() === 'AUD' ? 'A$' : `${(entry.currency || '').toUpperCase()} `;
  if (entry.status === 'paid') return { label: `Succeeded ${symbol}${amount}`, bg: '#dcfce7', color: '#166534' };
  if (entry.status === 'open') return { label: `Open ${symbol}${amount}`, bg: '#fef3c7', color: '#92400e' };
  if (entry.status === 'void') return { label: 'Void', bg: '#f3f4f6', color: '#6b7280' };
  if (entry.status === 'uncollectible') return { label: `Uncollectible ${symbol}${amount}`, bg: '#fee2e2', color: '#991b1b' };
  return { label: entry.status || '—', bg: '#f3f4f6', color: '#374151' };
}

export default function SubscribersTable({ rows }) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [range, setRange] = useState({ from: '', to: '' });
  const [billing, setBilling] = useState({}); // customerId -> { status, amountPaid, amountDue, currency } | null

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

  const inRange = useMemo(() => rows.filter(r => {
    if (!range.from && !range.to) return true;
    const d = r.signupDate ? aestDay(r.signupDate) : null;
    if (!d) return false;
    return (!range.from || d >= range.from) && (!range.to || d <= range.to);
  }), [rows, range]);

  const counts = useMemo(() => {
    const c = { ALL: inRange.length, FREE: 0, TRIAL: 0, PRO: 0, CANCELLED: 0, PAST_DUE: 0 };
    for (const r of inRange) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [inRange]);

  const visible = statusFilter === 'ALL' ? inRange : inRange.filter(r => r.status === statusFilter);

  const columns = [
    { key: 'email', label: 'Email' },
    { key: 'name', label: 'Name', render: r => <span style={{ color: C.ink2 }}>{r.name}</span> },
    { key: 'signupDate', label: 'Signup date', render: r => <span style={{ color: C.muted }}>{fmtDate(r.signupDate)}</span>, csv: r => r.signupDate },
    { key: 'status', label: 'Status', render: r => { const s = STATUS_COLORS[r.status] || STATUS_COLORS.FREE; return <Chip bg={s.bg} color={s.color}>{r.status}</Chip>; } },
    { key: 'trialEnd', label: 'Trial ends', sort: r => (r.status === 'TRIAL' ? r.trialEnd : null), render: r => <span style={{ color: C.muted }}>{r.status === 'TRIAL' ? fmtDate(r.trialEnd) : '—'}</span>, csv: r => (r.status === 'TRIAL' ? r.trialEnd : '') },
    { key: 'nextBilling', label: 'Next billing', sort: r => (r.status === 'PRO' ? r.nextBilling : null), render: r => <span style={{ color: C.muted }}>{r.status === 'PRO' ? fmtDate(r.nextBilling) : '—'}</span>, csv: r => (r.status === 'PRO' ? r.nextBilling : '') },
    { key: 'billingInterval', label: 'Billing interval', render: r => (INTERVAL_LABELS[r.billingInterval] ? <Chip bg="#f3f4f6" color="#374151">{INTERVAL_LABELS[r.billingInterval]}</Chip> : <span style={{ color: C.faint }}>—</span>), csv: r => INTERVAL_LABELS[r.billingInterval] || '' },
    { key: 'lastPayment', label: 'Last payment', sort: r => billing[r.stripeCustomerId]?.status || null, render: r => { const p = r.stripeCustomerId ? paymentDisplay(billing[r.stripeCustomerId]) : null; return p ? <Chip bg={p.bg} color={p.color}>{p.label}</Chip> : <span style={{ color: C.faint }}>—</span>; }, csv: r => paymentDisplay(billing[r.stripeCustomerId])?.label || '' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['ALL', 'FREE', 'TRIAL', 'PRO', 'CANCELLED', 'PAST_DUE', ...(counts.UNKNOWN ? ['UNKNOWN'] : [])].map(s => (
            <ToggleButton key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{s} ({counts[s] || 0})</ToggleButton>
          ))}
        </div>
        <DateRange from={range.from} to={range.to} onChange={setRange} presets={[7, 30, 90, 365]} />
      </div>
      <DataTable columns={columns} rows={visible} initialSort="signupDate" csvName="subscribers" emptyText="No users match this filter." maxHeight={640} />
    </div>
  );
}
