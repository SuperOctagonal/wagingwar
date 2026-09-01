'use client';

// Bookies tab — Phase 2 of the My Bets sidebar migration (2026-09).
// Per-bookmaker balance tracking: bookmaker_transactions (manual deposit/
// withdrawal/adjustment entries, since real balance includes money movement
// bet_log can't capture) joined against bet_log P&L for a computed running
// balance. Schema and page layout signed off before this was built.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { BOOKMAKERS, ALL_KNOWN_BOOKMAKERS } from '@/lib/bookmakers';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Same settled-bet definition used across My Bets/Insights (calcRow,
// computeInsightsSummary, etc.) -- win/loss/place, excluding
// pending/unresolved/scratched/abandoned.
const SETTLED = new Set(['win', 'loss', 'place']);
function isOpenBet(b) {
  return !SETTLED.has(b.status) && b.status !== 'scratched' && b.status !== 'abandoned';
}
// Mirrors app/mybets/page.js's computePnl exactly -- duplicated locally
// rather than imported since page.js isn't meant to be imported as a module.
function betPnl(b) {
  const isEW = (b.bet_type || '').toLowerCase().includes('each');
  const stk = +(b.stake || 0);
  if (b.profit_loss !== null && b.profit_loss !== undefined) return +b.profit_loss;
  if (b.return_amt !== null && b.return_amt !== undefined) return +b.return_amt - (isEW ? stk * 2 : stk);
  if (b.status === 'loss') return isEW ? -(stk * 2) : -stk;
  return 0;
}

const inp = { fontSize: 12, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, color: '#111827', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' };

export default function BookiesPanel({ bets, userId }) {
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [sortCol, setSortCol] = useState('balance');
  const [sortDir, setSortDir] = useState('desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [formBookmaker, setFormBookmaker] = useState(BOOKMAKERS[0]);
  const [formType, setFormType] = useState('deposit');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNote, setFormNote] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!userId || !SURL || !SKEY) return;
    setTxLoading(true);
    const { ok, rows } = await fetchAllRows(
      `${SURL}/rest/v1/bookmaker_transactions?clerk_id=eq.${encodeURIComponent(userId)}&order=occurred_at.desc`,
      { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    );
    setTransactions(ok ? rows : []);
    setTxLoading(false);
  }, [userId]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const rows = useMemo(() => {
    const byBookmaker = {};
    const ensure = bk => (byBookmaker[bk] ||= { bookmaker: bk, txTotal: 0, n: 0, wins: 0, staked: 0, pnl: 0, open: 0 });

    transactions.forEach(t => { ensure(t.bookmaker).txTotal += +t.amount; });
    (bets || []).forEach(b => {
      if (!b.bookmaker) return;
      const row = ensure(b.bookmaker);
      if (isOpenBet(b)) { row.open += +(b.stake || 0); return; }
      if (!SETTLED.has(b.status)) return;
      row.n += 1;
      if (b.status === 'win') row.wins += 1;
      row.staked += +(b.stake || 0);
      row.pnl += betPnl(b);
    });

    return Object.values(byBookmaker).map(r => ({
      ...r,
      balance: r.txTotal + r.pnl,
      roi: r.staked > 0 ? (r.pnl / r.staked) * 100 : null,
    }));
  }, [transactions, bets]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'bookmaker': va = a.bookmaker.toLowerCase(); vb = b.bookmaker.toLowerCase(); break;
        case 'bets':       va = a.n; vb = b.n; break;
        case 'roi':        va = a.roi ?? -Infinity; vb = b.roi ?? -Infinity; break;
        case 'open':       va = a.open; vb = b.open; break;
        default:           va = a.balance; vb = b.balance;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sortCol, sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  };

  const resetForm = () => {
    setFormBookmaker(BOOKMAKERS[0]); setFormType('deposit'); setFormAmount('');
    setFormDate(new Date().toISOString().slice(0, 10)); setFormNote(''); setFormError('');
  };

  const handleSave = async () => {
    if (!ALL_KNOWN_BOOKMAKERS.includes(formBookmaker)) { setFormError('Unknown bookmaker'); return; }
    const amt = +formAmount;
    if (!amt || isNaN(amt)) { setFormError('Enter an amount'); return; }
    const signedAmount = formType === 'withdrawal' ? -Math.abs(amt) : amt;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${SURL}/rest/v1/bookmaker_transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clerk_id: userId,
          bookmaker: formBookmaker,
          type: formType,
          amount: signedAmount,
          note: formNote || null,
          occurred_at: formDate,
        }),
      });
      if (!res.ok) { setFormError('Failed to save — try again'); setSaving(false); return; }
      setModalOpen(false);
      resetForm();
      await loadTransactions();
    } catch {
      setFormError('Network error — try again');
    }
    setSaving(false);
  };

  const th = (col, label, align = 'right') => (
    <th onClick={() => toggleSort(col)} style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sortCol === col && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Bookies</div>
        <button onClick={() => setModalOpen(true)} style={{ padding: '7px 14px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Log Transaction
        </button>
      </div>

      {txLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
      ) : sortedRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No bookmaker activity yet — log a bet or a transaction to get started.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {th('bookmaker', 'Bookmaker', 'left')}
                {th('balance', 'Balance')}
                {th('bets', 'Bets')}
                {th('roi', 'ROI')}
                {th('open', 'Open')}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.bookmaker} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '9px 10px', fontWeight: 600, color: '#111827' }}>{r.bookmaker}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: r.balance >= 0 ? '#059669' : '#dc2626' }}>
                    {r.balance >= 0 ? '+$' : '-$'}{Math.abs(r.balance).toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151' }}>{r.n}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', color: r.roi === null ? '#9ca3af' : r.roi >= 0 ? '#059669' : '#dc2626' }}>
                    {r.roi === null ? '—' : `${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>
                    {r.open > 0 ? `$${r.open.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 10, color: '#9ca3af' }}>
        Balance = logged deposits/withdrawals/adjustments + settled bet P&L at that bookmaker. Open = stakes on bets not yet resolved — not included in Balance.
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => { setModalOpen(false); resetForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-80" onClick={e => e.stopPropagation()}>
            <div className="bg-brand px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <div className="text-white font-semibold text-[13px]">Log Transaction</div>
              <button onClick={() => { setModalOpen(false); resetForm(); }} className="text-white/60 hover:text-white">
                <i className="ti ti-x text-lg" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1">Bookmaker</label>
                <select value={formBookmaker} onChange={e => setFormBookmaker(e.target.value)} style={inp}>
                  {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1">Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={inp}>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Amount ($)</label>
                  <input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="100.00" style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inp} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1">Note (optional)</label>
                <input value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="e.g. Sign-up bonus" style={inp} />
              </div>
              {formError && (
                <div style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 5, padding: '5px 8px', fontWeight: 600 }}>{formError}</div>
              )}
              <button onClick={handleSave} disabled={saving}
                style={{ width: '100%', padding: '9px 0', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
