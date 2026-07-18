'use client';

import { useMemo, useState } from 'react';

const STATUS_COLORS = {
  FREE:      { bg: '#f3f4f6', color: '#374151' },
  TRIAL:     { bg: '#dbeafe', color: '#1e40af' },
  PRO:       { bg: '#dcfce7', color: '#166534' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
  PAST_DUE:  { bg: '#fef3c7', color: '#92400e' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SubscribersTable({ rows }) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('signupDate');
  const [sortDir, setSortDir] = useState('desc');

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
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => {
              const colors = STATUS_COLORS[r.status] || STATUS_COLORS.FREE;
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
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No users match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
