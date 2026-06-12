'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';
import { parseCSV, buildRaces } from '@/lib/csvParser';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BOOKMAKERS = ['Sportsbet','TAB','Betfair','Bet365','BlueBet','Ladbrokes','Neds','Other'];

// Direct REST fetch — bypasses Supabase JS client schema cache
async function sbFetch(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SKEY,
        'Authorization': `Bearer ${SKEY}`,
        ...(opts.prefer ? { 'Prefer': opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[MyBets sbFetch] Error', res.status, errText);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('[MyBets sbFetch] Network error:', err);
    return null;
  }
}

async function loadBets(userId) {
  const data = await sbFetch(`bet_log?clerk_id=eq.${encodeURIComponent(userId)}&order=date.desc,id.desc`);
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
    bets: bets.length, wins,
    strike: bets.length > 0 ? (wins / bets.length * 100).toFixed(0) + '%' : '—',
    staked: totalStaked > 0 ? `$${totalStaked.toFixed(0)}` : '—',
    ret:    totalRet    > 0 ? `$${totalRet.toFixed(0)}`    : '—',
    pnl:    totalStaked > 0 ? pnl : null,
    roi:    totalStaked > 0 ? (pnl / totalStaked * 100).toFixed(1) + '%' : '—',
  };
}

// ─── Resulted bet row ─────────────────────────────────────────────────────────

function ResultedBetRow({ b }) {
  const stake = b.stake || 0;
  const ret   = b.return_amt || 0;
  const pnl   = ret - stake;
  const status = b.status || '';
  // Support both old column name (race_num) and new (race_number)
  const raceNum = b.race_number ?? b.race_num;
  // Support both old column name (venue) and new (track)
  const venue = b.track || b.venue;
  const resultCfg = {
    win:   { bg: '#d1fae5', color: '#065f46', label: 'WIN'   },
    place: { bg: '#dbeafe', color: '#1e40af', label: 'PLACE' },
    loss:  { bg: '#fee2e2', color: '#991b1b', label: 'LOSS'  },
  }[status] || { bg: '#f3f4f6', color: '#374151', label: (status || 'result').toUpperCase() };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f3f4f6', background: '#fff' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          {[venue, raceNum ? `R${raceNum}` : null, b.date ? b.date.slice(5).replace('-', '/') : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {b.bet_type && (
          <span style={{ fontSize: 9, background: '#f3f4f6', color: '#6b7280', padding: '1px 6px', borderRadius: 8, textTransform: 'capitalize', display: 'block', marginBottom: 2 }}>{b.bet_type}</span>
        )}
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>${stake.toFixed(0)} @ ${Number(b.odds || 0).toFixed(2)}</span>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: resultCfg.bg, color: resultCfg.color, flexShrink: 0 }}>{resultCfg.label}</span>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: pnl >= 0 ? '#059669' : '#dc2626', flexShrink: 0, width: 64, textAlign: 'right' }}>
        {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toFixed(2)}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MybetsPage() {
  const { user } = useUser();
  const isPro    = useIsPro();
  const isMobile = useIsMobile();

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [bets,        setBets]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('all');

  // CSV data for Quick Log
  const [csvMeetings, setCsvMeetings] = useState([]);   // ['Flemington', ...]
  const [csvVenues,   setCsvVenues]   = useState({});   // { 'Flemington': ['Flemington_R1', ...] }
  const [csvRaces,    setCsvRaces]    = useState({});   // { 'Flemington_R1': { num, horses, ... } }

  // Quick Log form
  const [qlMeeting,   setQlMeeting]   = useState('');
  const [qlRace,      setQlRace]      = useState('');
  const [qlHorse,     setQlHorse]     = useState('');
  const [qlBetType,   setQlBetType]   = useState('win');
  const [qlStake,     setQlStake]     = useState('');
  const [qlOdds,      setQlOdds]      = useState('');
  const [qlBookmaker, setQlBookmaker] = useState('Sportsbet');
  const [qlSaving,    setQlSaving]    = useState(false);
  const [qlToast,     setQlToast]     = useState(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadBets(user.id).then(data => { setBets(data); setLoading(false); });
  }, [user?.id]);

  // Load CSV race data from localStorage (key: ww_csv, set by races page)
  useEffect(() => {
    try {
      const csv = localStorage.getItem('ww_csv');
      if (csv) {
        const { allRaces: ar, allVenues: av } = buildRaces(parseCSV(csv));
        setCsvRaces(ar);
        setCsvVenues(av);
        setCsvMeetings(Object.keys(av));
      }
    } catch {}
  }, []);

  // Horses available for the selected meeting + race
  const csvHorses = useMemo(() => {
    if (!qlMeeting || !qlRace) return [];
    const venueKeys = csvVenues[qlMeeting] || [];
    const raceKey = venueKeys.find(k => {
      const rc = csvRaces[k];
      return rc && String(rc.num) === String(qlRace);
    });
    if (!raceKey) return [];
    const rc = csvRaces[raceKey];
    if (!rc || !rc.horses) return [];
    return rc.horses
      .filter(h => !h.scratched)
      .sort((a, b) => (+a.tab || 99) - (+b.tab || 99))
      .map(h => ({ name: h.name, tab: h.tab, odds: h.rawOdds }));
  }, [csvRaces, csvVenues, qlMeeting, qlRace]);

  const handleQuickLog = useCallback(async () => {
    if (!qlHorse.trim() || !qlStake || isNaN(+qlStake) || +qlStake <= 0) return;
    if (!qlOdds || isNaN(+qlOdds) || +qlOdds <= 1) return;
    if (!user?.id || !SURL || !SKEY) return;
    setQlSaving(true);

    const insertBody = {
      clerk_id:    user.id,
      date:        todayISO,
      horse_name:  qlHorse.trim(),
      track:       qlMeeting  || null,
      venue:       qlMeeting  || null,
      race_number: qlRace     ? +qlRace : null,
      bet_type:    qlBetType,
      stake:       +qlStake,
      odds:        +qlOdds,
      bookmaker:   qlBookmaker || null,
      status:      'pending',
      return_amt:  null,
      position:    null,
    };
    console.log('[QuickLog] Posting to bet_log:', JSON.stringify(insertBody));

    let ok = false;
    try {
      const res = await fetch(`${SURL}/rest/v1/bet_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SKEY,
          'Authorization': `Bearer ${SKEY}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(insertBody),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[QuickLog] Supabase error — status:', res.status, '| body:', errText);
      } else {
        ok = true;
        const text = await res.text();
        const inserted = text ? JSON.parse(text) : null;
        const newBet = Array.isArray(inserted) ? inserted[0] : inserted;
        if (newBet) setBets(prev => [newBet, ...prev]);
        awardPoints(user.id, 'bet_logged', qlHorse.trim()).catch(() => {});
        setQlHorse(''); setQlStake(''); setQlOdds('');
      }
    } catch (err) {
      console.error('[QuickLog] Network error:', err);
    }

    setQlToast(ok ? 'success' : 'error');
    setQlSaving(false);
    setTimeout(() => setQlToast(null), 2500);
  }, [user?.id, todayISO, qlHorse, qlMeeting, qlRace, qlBetType, qlStake, qlOdds, qlBookmaker]);

  const statsRows = useMemo(() => (
    ['Today', 'This week', 'This month', 'All time'].map(p => ({ label: p, ...calcRow(bets.filter(periodFilter(p, todayISO))) }))
  ), [bets, todayISO]);

  const resultedBets     = useMemo(() => bets.filter(b => b.status && b.status !== 'pending'), [bets]);
  const filteredResulted = useMemo(() => {
    if (activeTab === 'all') return resultedBets;
    if (activeTab === 'each way') return resultedBets.filter(b => {
      const bt = (b.bet_type || '').toLowerCase();
      return bt === 'each-way' || bt === 'each way';
    });
    if (activeTab === 'exotics') return resultedBets.filter(b =>
      ['quinella','exacta','trifecta','first 4','pick 6','multi'].includes((b.bet_type || '').toLowerCase())
    );
    return resultedBets.filter(b => (b.bet_type || '').toLowerCase() === activeTab);
  }, [resultedBets, activeTab]);

  const pendingBets = useMemo(() => bets.filter(b => !b.status || b.status === 'pending'), [bets]);

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

  const inp = { fontSize: 11, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 5, color: '#111827', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' };

  return (
    <div className="mob-page" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#f8fafc' }}>

        {/* ── Left panel (desktop only) ── */}
        {!isMobile && (
          <div style={{ width: 240, flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Upcoming Bets */}
            <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <i className="ti ti-clock" style={{ fontSize: 12, color: '#6b7280' }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px' }}>Upcoming Bets</span>
              </div>
              {pendingBets.length === 0 ? (
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '6px 0' }}>No upcoming bets</div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {pendingBets.slice(0, 8).map(b => {
                    const rn = b.race_number ?? b.race_num;
                    const vn = b.track || b.venue;
                    return (
                      <div key={b.id} style={{ padding: '5px 0', borderBottom: '1px solid #f9fafb' }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.horse_name || '—'}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 }}>
                          <span style={{ fontSize: 9, color: '#9ca3af' }}>{[vn, rn ? `R${rn}` : null].filter(Boolean).join(' ')}</span>
                          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#374151' }}>${(b.stake || 0).toFixed(0)} @ ${Number(b.odds || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: '#e5e7eb', flexShrink: 0 }} />

            {/* Quick Log */}
            <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Quick Log</div>

              {csvMeetings.length === 0 && (
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 }}>
                  Load a CSV on the Races page to enable meeting/horse selection.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

                {/* Meeting */}
                {csvMeetings.length > 0 ? (
                  <select value={qlMeeting} onChange={e => { setQlMeeting(e.target.value); setQlRace(''); setQlHorse(''); setQlOdds(''); }} style={inp}>
                    <option value="">Meeting…</option>
                    {csvMeetings.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input value={qlMeeting} onChange={e => setQlMeeting(e.target.value)} placeholder="Track (e.g. Flemington)" style={inp} />
                )}

                {/* Race number */}
                <select value={qlRace} onChange={e => { setQlRace(e.target.value); setQlHorse(''); setQlOdds(''); }} style={inp}>
                  <option value="">Race #…</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>R{n}</option>
                  ))}
                </select>

                {/* Horse — dropdown when CSV horses available, text input otherwise */}
                {csvHorses.length > 0 ? (
                  <select
                    value={qlHorse}
                    onChange={e => {
                      const h = csvHorses.find(x => x.name === e.target.value);
                      setQlHorse(e.target.value);
                      if (h?.odds) setQlOdds(h.odds.toFixed(2));
                    }}
                    style={inp}
                  >
                    <option value="">Select horse…</option>
                    {csvHorses.map(h => (
                      <option key={h.name} value={h.name}>
                        {h.tab ? `${h.tab}. ` : ''}{h.name}{h.odds ? ` ($${h.odds.toFixed(1)})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={qlHorse} onChange={e => setQlHorse(e.target.value)} placeholder="Horse name *" style={inp} />
                )}

                {/* Bet type */}
                <select value={qlBetType} onChange={e => setQlBetType(e.target.value)} style={inp}>
                  <option value="win">Win</option>
                  <option value="place">Place</option>
                  <option value="each-way">Each Way</option>
                </select>

                {/* Stake + Odds */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input value={qlStake} onChange={e => setQlStake(e.target.value)}
                    type="number" placeholder="Stake $" min="0.01" step="0.01"
                    style={{ ...inp, flex: 1, minWidth: 0 }} />
                  <input value={qlOdds} onChange={e => setQlOdds(e.target.value)}
                    type="number" placeholder="Odds $" min="1.01" step="0.01"
                    style={{ ...inp, flex: 1, minWidth: 0 }} />
                </div>

                {/* Bookmaker */}
                <select value={qlBookmaker} onChange={e => setQlBookmaker(e.target.value)} style={inp}>
                  {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                {/* Submit */}
                <button
                  onClick={handleQuickLog}
                  disabled={qlSaving || !qlHorse.trim() || !qlStake || !qlOdds}
                  style={{ padding: '7px', background: '#059669', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (qlSaving || !qlHorse.trim() || !qlStake || !qlOdds) ? 0.5 : 1 }}
                >
                  {qlSaving ? 'Saving…' : 'Save Bet'}
                </button>

                {qlToast && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: qlToast === 'success' ? '#059669' : '#dc2626', textAlign: 'center' }}>
                    {qlToast === 'success' ? '✓ Bet logged! +5pts' : '✗ Failed — check console for details'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Right panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Stats bar */}
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

          {/* Bet type tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
            {['All', 'Win', 'Place', 'Each Way', 'Exotics'].map(t => {
              const key = t.toLowerCase();
              return (
                <button key={t} onClick={() => setActiveTab(key)}
                  style={{ padding: '8px 14px', fontSize: 11, fontWeight: activeTab === key ? 600 : 400, color: activeTab === key ? '#059669' : '#6b7280', background: 'none', border: 'none', borderBottom: activeTab === key ? '2px solid #059669' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 36 }}>
                  {t}
                </button>
              );
            })}
          </div>

          {/* Resulted bets list */}
          <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', fontSize: 12 }}>Loading…</div>
            ) : filteredResulted.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
                <i className="ti ti-flag" style={{ fontSize: 32, color: '#d1d5db' }} />
                <div style={{ fontSize: 12, color: '#9ca3af' }}>No resulted bets yet</div>
              </div>
            ) : (
              filteredResulted.map(b => <ResultedBetRow key={b.id} b={b} />)
            )}
          </div>

        </div>{/* end right panel */}
      </main>
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}
