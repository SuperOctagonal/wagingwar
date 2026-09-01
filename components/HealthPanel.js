'use client';

// Health tab — Phase 2 of the My Bets sidebar migration (2026-09).
// Status-monitoring only, no mug-bet suggestions or behavior-modification
// recommendations, per sign-off. Per bookmaker: win rate + turnover from
// settled bet_log rows, classified into a three-state flag using thresholds
// confirmed against real (aggregate) data before this shipped -- see the
// investigation report for the sanity-check numbers.
//
// Balance column reuses lib/bookmakerStats.js's computeBookmakerRows -- the
// exact same calculation and bookmaker_transactions query Bookies uses --
// rather than a second implementation, so the two pages can never diverge
// for the same bookmaker.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchBookmakerTransactions, computeBookmakerRows } from '@/lib/bookmakerStats';

// Thresholds signed off 2026-09 -- deliberate choices, not an existing
// convention. Order matters: at-risk is checked before watch since it's the
// stricter, more specific condition.
function classify(n, winRate, roi) {
  if (n < 10) return 'healthy';
  if (winRate >= 0.40 && roi >= 25) return 'at_risk';
  if (winRate >= 0.30 || roi >= 15) return 'watch';
  return 'healthy';
}

const STATUS_CFG = {
  at_risk: { label: 'At risk of limiting', bg: '#fee2e2', color: '#991b1b', dot: '#dc2626', rank: 0 },
  watch:   { label: 'Watch — high win rate', bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', rank: 1 },
  healthy: { label: 'Healthy', bg: '#d1fae5', color: '#065f46', dot: '#059669', rank: 2 },
};

export default function HealthPanel({ bets, userId }) {
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    if (!userId) return;
    setTxLoading(true);
    setTransactions(await fetchBookmakerTransactions(userId));
    setTxLoading(false);
  }, [userId]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const rows = useMemo(() => {
    return computeBookmakerRows(bets, transactions)
      .filter(r => r.n > 0) // Health is about settled-bet activity; a bookmaker with only transactions and no bets has nothing to assess.
      .map(r => ({ ...r, status: classify(r.n, r.winRate, r.roi ?? 0) }))
      .sort((a, b) => STATUS_CFG[a.status].rank - STATUS_CFG[b.status].rank || b.n - a.n);
  }, [bets, transactions]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Health</div>

      {txLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No settled bets yet.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left' }}>Bookmaker</th>
                <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right' }}>Win Rate</th>
                <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right' }}>Turnover</th>
                <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cfg = STATUS_CFG[r.status];
                return (
                  <tr key={r.bookmaker} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{r.bookmaker}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.n} settled bets</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: r.balance >= 0 ? '#059669' : '#dc2626' }}>
                      {r.balance >= 0 ? '+$' : '-$'}{Math.abs(r.balance).toFixed(2)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>
                      {(r.winRate * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>
                      ${r.staked.toFixed(0)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 10, color: '#9ca3af' }}>
        Status only — bookmakers under 10 settled bets always show Healthy (not enough data to assess). Balance is the same figure shown on Bookies. This is informational, not a recommendation to change how or where you bet.
      </div>
    </div>
  );
}
