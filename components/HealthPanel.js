'use client';

// Health tab — Phase 2 of the My Bets sidebar migration (2026-09).
// Status-monitoring only, no mug-bet suggestions or behavior-modification
// recommendations, per sign-off. Per bookmaker: win rate + turnover from
// settled bet_log rows, classified into a three-state flag using thresholds
// confirmed against real (aggregate) data before this shipped -- see the
// investigation report for the sanity-check numbers.
import { useMemo } from 'react';

const SETTLED = new Set(['win', 'loss', 'place']);
// Mirrors app/mybets/page.js's computePnl -- see the same note in
// components/BookiesPanel.js.
function betPnl(b) {
  const isEW = (b.bet_type || '').toLowerCase().includes('each');
  const stk = +(b.stake || 0);
  if (b.profit_loss !== null && b.profit_loss !== undefined) return +b.profit_loss;
  if (b.return_amt !== null && b.return_amt !== undefined) return +b.return_amt - (isEW ? stk * 2 : stk);
  if (b.status === 'loss') return isEW ? -(stk * 2) : -stk;
  return 0;
}

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

export default function HealthPanel({ bets }) {
  const rows = useMemo(() => {
    const byBookmaker = {};
    (bets || []).forEach(b => {
      if (!b.bookmaker || !SETTLED.has(b.status)) return;
      const row = (byBookmaker[b.bookmaker] ||= { bookmaker: b.bookmaker, n: 0, wins: 0, staked: 0, pnl: 0 });
      row.n += 1;
      if (b.status === 'win') row.wins += 1;
      row.staked += +(b.stake || 0);
      row.pnl += betPnl(b);
    });
    return Object.values(byBookmaker).map(r => {
      const winRate = r.n > 0 ? r.wins / r.n : 0;
      const roi = r.staked > 0 ? (r.pnl / r.staked) * 100 : 0;
      const status = classify(r.n, winRate, roi);
      return { ...r, winRate, roi, status };
    }).sort((a, b) => STATUS_CFG[a.status].rank - STATUS_CFG[b.status].rank || b.n - a.n);
  }, [bets]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Health</div>

      {rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No settled bets yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const cfg = STATUS_CFG[r.status];
            return (
              <div key={r.bookmaker} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{r.bookmaker}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{r.n} settled bets</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em' }}>Win Rate</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#374151' }}>{(r.winRate * 100).toFixed(1)}%</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em' }}>Turnover</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#374151' }}>${r.staked.toFixed(0)}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#9ca3af' }}>
        Status only — bookmakers under 10 settled bets always show Healthy (not enough data to assess). This is informational, not a recommendation to change how or where you bet.
      </div>
    </div>
  );
}
