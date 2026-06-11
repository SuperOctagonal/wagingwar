'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import BottomSheet from '@/components/BottomSheet';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbFetch(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        'Content-Type': 'application/json',
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

async function loadBets(userId) {
  const data = await sbFetch(`bet_log?user_id=eq.${encodeURIComponent(userId)}&order=date.desc,id.desc`);
  return Array.isArray(data) ? data : [];
}

async function removeBet(id) {
  return sbFetch(`bet_log?id=eq.${id}`, { method: 'DELETE' });
}

async function patchBet(id, fields) {
  return sbFetch(`bet_log?id=eq.${id}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
}

// ─── Period helpers ──────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().slice(0, 10); }

function periodFilter(period, todayISO) {
  const today = new Date(todayISO + 'T00:00:00');
  const dow = today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === 'Today') return b => b.date === todayISO;
  if (period === 'This week') return b => b.date >= isoDate(weekStart);
  if (period === 'This month') return b => b.date >= isoDate(monthStart);
  return () => true;
}

function calcRow(bets) {
  const settled = bets.filter(b => b.status && b.status !== 'pending');
  const wins = bets.filter(b => b.status === 'win').length;
  const totalStaked = settled.reduce((s, b) => s + (b.stake || 0), 0);
  const totalRet = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
  const pnl = totalRet - totalStaked;
  return {
    bets: bets.length,
    wins,
    strike: bets.length > 0 ? (wins / bets.length * 100).toFixed(0) + '%' : '—',
    staked: totalStaked > 0 ? `$${totalStaked.toFixed(0)}` : '—',
    ret: totalRet > 0 ? `$${totalRet.toFixed(0)}` : '—',
    pnl: totalStaked > 0 ? pnl : null,
    roi: totalStaked > 0 ? (pnl / totalStaked * 100).toFixed(1) + '%' : '—',
  };
}

function calcGroupStats(bets, getKey) {
  const groups = {};
  bets.forEach(b => {
    const k = getKey(b) || '—';
    if (!groups[k]) groups[k] = [];
    groups[k].push(b);
  });
  return Object.entries(groups).map(([segment, rows]) => {
    const settled = rows.filter(b => b.status && b.status !== 'pending');
    const wins = rows.filter(b => b.status === 'win').length;
    const staked = settled.reduce((s, b) => s + (b.stake || 0), 0);
    const ret = settled.reduce((s, b) => s + (b.return_amt || 0), 0);
    const pnl = ret - staked;
    return {
      segment,
      bets: rows.length,
      wins,
      strike: rows.length > 0 ? (wins / rows.length * 100).toFixed(0) + '%' : '—',
      staked: staked > 0 ? `$${staked.toFixed(2)}` : '—',
      pnl: staked > 0 ? pnl : null,
      roi: staked > 0 ? (pnl / staked * 100).toFixed(1) + '%' : '—',
    };
  }).sort((a, b) => b.bets - a.bets);
}

function oddsRange(b) {
  const o = b.odds || 0;
  if (o < 2) return '$1 – $2';
  if (o < 4) return '$2 – $4';
  if (o < 7) return '$4 – $7';
  if (o < 10) return '$7 – $10';
  if (o < 15) return '$10 – $15';
  return '$15+';
}

const VENUE_STATES = {
  'EAGLE FARM': 'QLD', 'DOOMBEN': 'QLD', 'GOLD COAST': 'QLD', 'SUNSHINE COAST': 'QLD', 'TOOWOOMBA': 'QLD',
  'RANDWICK': 'NSW', 'ROSEHILL': 'NSW', 'WARWICK FARM': 'NSW', 'CANTERBURY': 'NSW', 'KEMBLA GRANGE': 'NSW',
  'FLEMINGTON': 'VIC', 'CAULFIELD': 'VIC', 'MOONEE VALLEY': 'VIC', 'SANDOWN': 'VIC', 'PAKENHAM': 'VIC', 'BENDIGO': 'VIC',
  'ASCOT': 'WA', 'BELMONT': 'WA',
  'MORPHETTVILLE': 'SA', 'OAKBANK': 'SA',
};

const SIDEBAR_SECTIONS = [
  { key: 'betType', label: 'BET TYPE', items: ['All Bets', 'Win', 'Place', 'Each Way', 'Exotics'] },
  { key: 'state',   label: 'STATE',    items: ['QLD', 'NSW', 'VIC', 'WA', 'SA'] },
  { key: 'status',  label: 'STATUS',   items: ['Pending', 'Settled'] },
  { key: 'rank',    label: 'RANK',     items: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4+'] },
];

const TABS = [
  { key: 'betlog',      label: 'Bet Log' },
  { key: 'bytrack',     label: 'By Track' },
  { key: 'byodds',      label: 'By Odds Range' },
  { key: 'bycondition', label: 'By Condition' },
  { key: 'byrank',      label: 'By Rank' },
];

const TH = { background: '#f8fafc', color: '#9ca3af', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', padding: '5px 8px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1 };
const TD = { fontSize: 11, padding: '4px 8px', color: '#111827', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' };

function RankBadge({ rank }) {
  const r = Number(rank);
  const isR1 = r === 1;
  return (
    <span style={{ background: isR1 ? '#065f46' : '#d1fae5', color: isR1 ? '#fff' : '#065f46', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>
      R{rank || '?'}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    win:   { bg: '#d1fae5', color: '#065f46', label: 'Win' },
    place: { bg: '#dbeafe', color: '#1e40af', label: 'Place' },
    loss:  { bg: '#fee2e2', color: '#991b1b', label: 'Loss' },
  }[status] || { bg: '#f3f4f6', color: '#374151', label: status };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

// ─── Mobile bet card ─────────────────────────────────────────────────────────

function MobileBetCard({ b, onDelete, onStatusChange, isUpdating }) {
  const stake = b.stake || 0;
  const ret = b.return_amt || 0;
  const settled = b.status && b.status !== 'pending';
  const pnl = settled ? ret - stake : null;
  const roi = pnl !== null && stake > 0 ? pnl / stake * 100 : null;

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #f3f4f6', padding: '12px 14px' }}>
      {/* Line 1: horse + venue + race + rank + delete */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.horse_name || '—'}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
            {[
              b.date ? b.date.slice(5).replace('-', '/') : null,
              b.venue,
              b.race_num ? `R${b.race_num}` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {b.rank && <RankBadge rank={b.rank} />}
          <button
            onClick={() => onDelete(b.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', fontSize: 16, lineHeight: 1, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <i className="ti ti-trash" />
          </button>
        </div>
      </div>

      {/* Line 2: type + odds + stake + status/select */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {b.bet_type && (
          <span style={{ fontSize: 10, textTransform: 'capitalize', color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>
            {b.bet_type}
          </span>
        )}
        {b.odds && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>
            ${Number(b.odds).toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>
          ${stake.toFixed(2)}
        </span>
        {settled ? (
          <StatusBadge status={b.status} />
        ) : (
          <select
            value={b.status || 'pending'}
            disabled={isUpdating}
            onChange={e => {
              const s = e.target.value;
              if (s === 'pending') return;
              const retAmt = s === 'win' ? +(stake * (b.odds || 1)).toFixed(2) : 0;
              onStatusChange(b.id, s, retAmt);
            }}
            style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', color: '#374151', background: '#fff', cursor: 'pointer', minHeight: 36 }}
          >
            <option value="pending">Pending</option>
            <option value="win">Win</option>
            <option value="place">Place</option>
            <option value="loss">Loss</option>
          </select>
        )}
      </div>

      {/* Line 3: P&L + ROI */}
      {pnl !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: pnl >= 0 ? '#059669' : '#dc2626' }}>
            {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toFixed(2)}
          </span>
          {roi !== null && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: roi >= 0 ? '#059669' : '#dc2626' }}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bet log table (desktop) / cards (mobile) ────────────────────────────────

function BetLogTable({ bets, onDelete, onStatusChange, updatingId }) {
  const isMobile = useIsMobile();

  if (!bets.length) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', fontSize: 12 }}>
      No bets logged yet
    </div>
  );

  if (isMobile) {
    return (
      <div>
        {bets.map(b => (
          <MobileBetCard
            key={b.id}
            b={b}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            isUpdating={updatingId === b.id}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
        <thead>
          <tr>
            {[
              ['Date', 'left'], ['Horse', 'left'], ['Track', 'left'], ['Rnk', 'center'],
              ['Type', 'left'], ['Cond', 'left'], ['Stake', 'right'], ['My$', 'right'],
              ['SP', 'right'], ['Result', 'left'], ['Pos', 'center'],
              ['P&L', 'right'], ['ROI', 'right'], ['', 'center'],
            ].map(([h, align]) => (
              <th key={h} style={{ ...TH, textAlign: align }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bets.map((b, i) => {
            const stake = b.stake || 0;
            const ret = b.return_amt || 0;
            const settled = b.status && b.status !== 'pending';
            const pnl = settled ? ret - stake : null;
            const roi = pnl !== null && stake > 0 ? pnl / stake * 100 : null;
            const isUpdating = updatingId === b.id;
            const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
            return (
              <tr key={b.id}
                style={{ background: rowBg }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
              >
                <td style={TD}>{b.date ? b.date.slice(5).replace('-', '/') : '—'}</td>
                <td style={{ ...TD, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.horse_name || '—'}</td>
                <td style={TD}>{b.venue || '—'}</td>
                <td style={{ ...TD, textAlign: 'center' }}><RankBadge rank={b.rank} /></td>
                <td style={{ ...TD, textTransform: 'capitalize' }}>{b.bet_type || '—'}</td>
                <td style={TD}>{b.track_condition || b.condition || '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>${stake.toFixed(2)}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: '#059669' }}>
                  {b.my_odds ? `$${Number(b.my_odds).toFixed(2)}` : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>
                  {b.odds ? `$${Number(b.odds).toFixed(2)}` : '—'}
                </td>
                <td style={TD}>
                  {settled ? (
                    <StatusBadge status={b.status} />
                  ) : (
                    <select
                      value={b.status || 'pending'}
                      disabled={isUpdating}
                      onChange={e => {
                        const s = e.target.value;
                        if (s === 'pending') return;
                        const retAmt = s === 'win' ? +(stake * (b.odds || 1)).toFixed(2) : 0;
                        onStatusChange(b.id, s, retAmt);
                      }}
                      style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb', color: '#374151', background: '#fff', cursor: 'pointer' }}
                    >
                      <option value="pending">Pending</option>
                      <option value="win">Win</option>
                      <option value="place">Place</option>
                      <option value="loss">Loss</option>
                    </select>
                  )}
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>{b.position || '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: pnl !== null ? (pnl >= 0 ? '#059669' : '#dc2626') : '#9ca3af' }}>
                  {pnl !== null ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: roi !== null ? (roi >= 0 ? '#059669' : '#dc2626') : '#9ca3af' }}>
                  {roi !== null ? (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%' : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <button
                    onClick={() => onDelete(b.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 2px', fontSize: 13, lineHeight: 1 }}
                    title="Delete"
                  >
                    <span style={{ fontFamily: 'system-ui' }}>🗑</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsTable({ rows }) {
  if (!rows.length) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', fontSize: 12 }}>
      No data
    </div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {[['Segment', 'left'], ['Bets', 'right'], ['Wins', 'right'], ['Strike%', 'right'], ['Staked', 'right'], ['P&L', 'right'], ['ROI', 'right']].map(([h, align]) => (
              <th key={h} style={{ ...TH, textAlign: align }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...TD, fontWeight: 600 }}>{r.segment}</td>
              <td style={{ ...TD, textAlign: 'right' }}>{r.bets}</td>
              <td style={{ ...TD, textAlign: 'right' }}>{r.wins}</td>
              <td style={{ ...TD, textAlign: 'right' }}>{r.strike}</td>
              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{r.staked}</td>
              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: r.pnl !== null ? (r.pnl >= 0 ? '#059669' : '#dc2626') : '#9ca3af' }}>
                {r.pnl !== null ? (r.pnl >= 0 ? '+$' : '-$') + Math.abs(r.pnl).toFixed(2) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: parseFloat(r.roi) > 0 ? '#059669' : parseFloat(r.roi) < 0 ? '#dc2626' : '#9ca3af' }}>
                {r.roi}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MybetsPage() {
  const { user } = useUser();
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const [upgradeOpen,     setUpgradeOpen]     = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [bets,        setBets]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('betlog');
  const [filters,     setFilters]     = useState({ betType: 'All Bets' });
  const [updatingId,  setUpdatingId]  = useState(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadBets(user.id).then(data => { setBets(data); setLoading(false); });
  }, [user?.id]);

  const handleDelete = useCallback(async (id) => {
    await removeBet(id);
    setBets(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleStatusChange = useCallback(async (id, status, returnAmt) => {
    setUpdatingId(id);
    await patchBet(id, { status, return_amt: returnAmt });
    setBets(prev => prev.map(b => b.id === id ? { ...b, status, return_amt: returnAmt } : b));
    setUpdatingId(null);
  }, []);

  const setFilter = useCallback((key, val) => {
    setFilters(prev => {
      if (key === 'betType') return { ...prev, betType: val };
      return { ...prev, [key]: prev[key] === val ? null : val };
    });
  }, []);

  const clearFilters = useCallback(() => setFilters({ betType: 'All Bets' }), []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.betType && filters.betType !== 'All Bets') n++;
    if (filters.state)  n++;
    if (filters.status) n++;
    if (filters.rank)   n++;
    return n;
  }, [filters]);

  const filtered = useMemo(() => {
    let b = bets;
    if (filters.betType && filters.betType !== 'All Bets') {
      const t = filters.betType.toLowerCase();
      b = b.filter(x => (x.bet_type || '').toLowerCase() === t || (x.bet_type || '').toLowerCase() === t.replace(' ', '-'));
    }
    if (filters.state) {
      b = b.filter(x => VENUE_STATES[(x.venue || '').toUpperCase()] === filters.state);
    }
    if (filters.status) {
      if (filters.status === 'Pending') b = b.filter(x => !x.status || x.status === 'pending');
      else b = b.filter(x => x.status && x.status !== 'pending');
    }
    if (filters.rank) {
      if (filters.rank === 'Rank 4+') b = b.filter(x => (x.rank || 0) >= 4);
      else { const rn = parseInt(filters.rank.replace('Rank ', '')); b = b.filter(x => x.rank === rn); }
    }
    return b;
  }, [bets, filters]);

  const statsRows = useMemo(() => (
    ['Today', 'This week', 'This month', 'All time'].map(p => ({ label: p, ...calcRow(bets.filter(periodFilter(p, todayISO))) }))
  ), [bets, todayISO]);

  const analyticsByTrack = useMemo(() => calcGroupStats(filtered, b => b.venue), [filtered]);
  const analyticsByOdds  = useMemo(() => calcGroupStats(filtered, oddsRange), [filtered]);
  const analyticsByCond  = useMemo(() => calcGroupStats(filtered, b => b.track_condition || b.condition), [filtered]);
  const analyticsByRank  = useMemo(() => calcGroupStats(filtered, b => b.rank ? `Rank ${b.rank}` : '—'), [filtered]);

  if (isPro === false) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProfileRail />
        <main className="mob-page" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <i className="ti ti-lock" style={{ fontSize: 48, color: '#d1d5db', display: 'block', marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Track your bets with Pro</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Log every bet and track your P&amp;L and ROI with a Pro subscription.</div>
            <button onClick={() => setUpgradeOpen(true)} style={{ padding: '10px 24px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Start free trial
            </button>
          </div>
        </main>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="mob-page" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>

        {/* ── Stats bar ── */}
        <div style={{ background: '#1e2936', padding: '8px 20px', flexShrink: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ width: 100 }} />
                {['Bets', 'Wins', 'Strike%', 'Staked', 'Return', 'P&L', 'ROI'].map(h => (
                  <th key={h} style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.5px', padding: '2px 8px', textAlign: 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statsRows.map(r => (
                <tr key={r.label}>
                  <td style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', padding: '2px 0', fontWeight: 600 }}>{r.label}</td>
                  <td style={{ fontSize: 11, color: '#fff', padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.bets}</td>
                  <td style={{ fontSize: 11, color: '#fff', padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.wins}</td>
                  <td style={{ fontSize: 11, color: '#fff', padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.strike}</td>
                  <td style={{ fontSize: 11, color: '#fff', padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.staked}</td>
                  <td style={{ fontSize: 11, color: '#fff', padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.ret}</td>
                  <td style={{ fontSize: 11, padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: r.pnl !== null ? (r.pnl >= 0 ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.4)' }}>
                    {r.pnl !== null ? (r.pnl >= 0 ? '+$' : '-$') + Math.abs(r.pnl).toFixed(2) : '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: parseFloat(r.roi) > 0 ? '#34d399' : parseFloat(r.roi) < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                    {r.roi}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Mobile filters button ── */}
        {isMobile && (
          <div style={{ padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setFilterSheetOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer', minHeight: 36 }}
            >
              <i className="ti ti-adjustments-horizontal" style={{ fontSize: 14 }} />
              Filters
              {activeFilterCount > 0 && (
                <span style={{ background: '#059669', color: '#fff', borderRadius: '50%', width: 17, height: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', minHeight: 36 }}>
                Clear all
              </button>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar — desktop only */}
          <div className="mybets-sidebar" style={{ width: 160, background: '#f8fafc', borderRight: '1px solid #e5e7eb', overflowY: 'auto', flexShrink: 0 }}>
            {SIDEBAR_SECTIONS.map(sec => (
              <div key={sec.key} style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', padding: '10px 12px 4px' }}>
                  {sec.label}
                </div>
                {sec.items.map(item => {
                  const isActive = filters[sec.key] === item || (sec.key === 'betType' && filters.betType === item);
                  return (
                    <button
                      key={item}
                      onClick={() => setFilter(sec.key, item)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 12px', fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? '#059669' : '#374151', background: 'none', border: 'none', borderLeft: isActive ? '2px solid #059669' : '2px solid transparent', cursor: 'pointer' }}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{ padding: '8px 14px', fontSize: 11, fontWeight: activeTab === t.key ? 600 : 400, color: activeTab === t.key ? '#059669' : '#6b7280', background: 'none', border: 'none', borderBottom: activeTab === t.key ? '2px solid #059669' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 36 }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', fontSize: 12 }}>Loading…</div>
              ) : activeTab === 'betlog' ? (
                <BetLogTable bets={filtered} onDelete={handleDelete} onStatusChange={handleStatusChange} updatingId={updatingId} />
              ) : activeTab === 'bytrack' ? (
                <AnalyticsTable rows={analyticsByTrack} />
              ) : activeTab === 'byodds' ? (
                <AnalyticsTable rows={analyticsByOdds} />
              ) : activeTab === 'bycondition' ? (
                <AnalyticsTable rows={analyticsByCond} />
              ) : (
                <AnalyticsTable rows={analyticsByRank} />
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile Filters bottom sheet ── */}
        <BottomSheet isOpen={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filters">
          <div style={{ padding: 16 }}>
            {SIDEBAR_SECTIONS.map(sec => (
              <div key={sec.key} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                  {sec.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sec.items.map(item => {
                    const isActive = filters[sec.key] === item || (sec.key === 'betType' && filters.betType === item);
                    return (
                      <button
                        key={item}
                        onClick={() => setFilter(sec.key, item)}
                        style={{ padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid', cursor: 'pointer', minHeight: 40,
                          background: isActive ? '#059669' : '#fff',
                          color: isActive ? '#fff' : '#374151',
                          borderColor: isActive ? '#059669' : '#e5e7eb',
                        }}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingBottom: 8 }}>
              <button
                onClick={() => { clearFilters(); setFilterSheetOpen(false); }}
                style={{ flex: 1, padding: '13px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}
              >
                Clear All
              </button>
              <button
                onClick={() => setFilterSheetOpen(false)}
                style={{ flex: 2, padding: '13px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#059669', color: '#fff', cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </BottomSheet>

      </main>
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}
