'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useIsMobile from '@/hooks/useIsMobile';
import useIsPro from '@/hooks/useIsPro';

const LS_KEY = 'ww_betting_tools';
const DARK = '#0d3b2e';
const DARK2 = '#164a3a';
const GOLD = '#fbbf24';
const MONO = 'JetBrains Mono, monospace';

// ── Helpers ───────────────────────────────────────────────────────────────────
function gcd(a, b) { return b < 0.0001 ? a : gcd(b, a % b); }
function decToFrac(d) {
  if (!d || isNaN(d) || d <= 1) return '—';
  const n = d - 1;
  const g = gcd(Math.round(n * 64), 64);
  const num = Math.round(n * 64) / g, den = 64 / g;
  return `${num}/${den}`;
}
function decToAmerican(d) {
  if (!d || isNaN(d) || d <= 1) return '—';
  return d >= 2 ? `+${Math.round((d - 1) * 100)}` : `${Math.round(-100 / (d - 1))}`;
}
function americanToDec(a) {
  const n = parseFloat(a);
  if (isNaN(n)) return '';
  return n > 0 ? (n / 100 + 1).toFixed(3) : n < 0 ? (100 / Math.abs(n) + 1).toFixed(3) : '';
}
function fracToDec(f) {
  const m = String(f).match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!m) return '';
  const den = parseFloat(m[2]);
  return den ? (parseFloat(m[1]) / den + 1).toFixed(3) : '';
}

// ── Default state ─────────────────────────────────────────────────────────────
const DEFAULT = {
  activeTab: 'kelly',
  kelly:   { odds: '', prob: '', bankroll: '', fraction: 'half' },
  dutch:   { mode: 'profit', target: '', rows: [{ odds: '' }, { odds: '' }] },
  ewdutch: { stake: '', rows: [{ odds: '' }, { odds: '' }] },
  multi:   { stake: '', legs: [{ name: '', odds: '' }, { name: '', odds: '' }] },
  ev:      { odds: '', prob: '', stake: '' },
  conv:    { decimal: '', fraction: '', american: '', implied: '' },
};

// ── Small shared UI ───────────────────────────────────────────────────────────
function ProOverlay({ onUpgrade, onClose }) {
  return (
    <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', background:'rgba(255,255,255,0.55)', borderRadius:8 }}>
      <div style={{ background:'#fff', border:'1px solid #00471b', borderRadius:12, padding:'28px 32px', textAlign:'center', maxWidth:280, boxShadow:'0 8px 32px rgba(0,0,0,0.1)', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:10, right:12, background:'none', border:'none', fontSize:18, color:'#9ca3af', cursor:'pointer', lineHeight:1 }}>✕</button>
        <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
        <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:6 }}>Pro Feature</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:18, lineHeight:1.5 }}>Unlock the full professional staking & pricing suite</div>
        <button onClick={onUpgrade} style={{ background:'#00471b', color:'#fff', fontWeight:700, fontSize:13, padding:'10px 24px', borderRadius:8, border:'none', cursor:'pointer' }}>
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}

function HeroCard({ label, value, sub }) {
  return (
    <div style={{ background:DARK, borderRadius:10, padding:'16px 20px', flex:1, minWidth:150 }}>
      <div style={{ fontSize:10, color:'#86baa8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:42, fontWeight:700, color:GOLD, fontFamily:MONO, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#86baa8', marginTop:6, fontFamily:MONO }}>{sub}</div>}
    </div>
  );
}

function SecCard({ label, value, sub }) {
  return (
    <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10, padding:'14px 18px', flex:1, minWidth:120 }}>
      <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color:'#111827', fontFamily:MONO }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#9ca3af', marginTop:4, fontFamily:MONO }}>{sub}</div>}
    </div>
  );
}

function Inp({ label, value, onChange, placeholder, type = 'text', right }) {
  return (
    <div style={{ flex:1 }}>
      {label && <div style={{ fontSize:10, fontWeight:600, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</div>}
      <div style={{ position:'relative' }}>
        <input
          type={type} inputMode={type === 'number' ? 'decimal' : undefined}
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width:'100%', fontSize:14, fontFamily:MONO, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:7, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' }}
        />
        {right && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#9ca3af', pointerEvents:'none' }}>{right}</span>}
      </div>
    </div>
  );
}

function ClearBtn({ onClick }) {
  return <button onClick={onClick} style={{ fontSize:11, color:'#9ca3af', background:'none', border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>Clear</button>;
}

// ── Tool 1: Kelly ─────────────────────────────────────────────────────────────
function ToolKelly({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const odds = parseFloat(st.odds), prob = parseFloat(st.prob) / 100, bankroll = parseFloat(st.bankroll);
  const frac = { full:1, half:0.5, quarter:0.25 }[st.fraction] ?? 0.5;
  let stake = 0, stakePerc = 0, edge = 0, ev = 0;
  if (odds > 1 && prob > 0 && prob < 1 && bankroll > 0) {
    const b = odds - 1, q = 1 - prob;
    const kelly = Math.max(0, (b * prob - q) / b) * frac;
    stake = kelly * bankroll; stakePerc = kelly * 100;
    edge = (prob - 1 / odds) * 100;
    ev = stake * (prob * b - q);
  }
  const riskColor = stakePerc < 5 ? '#22c55e' : stakePerc < 15 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
        <Inp label="Decimal odds" value={st.odds} onChange={v => set({ ...st, odds:v })} placeholder="2.50" type="number" />
        <Inp label="Win probability" value={st.prob} onChange={v => set({ ...st, prob:v })} placeholder="45" right="%" type="number" />
        <Inp label="Bankroll" value={st.bankroll} onChange={v => set({ ...st, bankroll:v })} placeholder="1000" right="$" type="number" />
      </div>
      <div style={{ display:'flex', gap:6, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>Kelly fraction</span>
        {['full','half','quarter'].map(f => (
          <button key={f} onClick={() => set({ ...st, fraction:f })}
            style={{ padding:'6px 14px', borderRadius:6, border:'1px solid #d1d5db', fontSize:12, fontWeight:600, cursor:'pointer', background:st.fraction===f ? DARK : '#fff', color:st.fraction===f ? '#fff' : '#374151' }}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
        <ClearBtn onClick={onClear} />
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <HeroCard label="Recommended stake" value={stake > 0 ? `$${stake.toFixed(2)}` : '—'} sub={stake > 0 ? `${stakePerc.toFixed(2)}% of bankroll` : undefined} />
        <SecCard label="Edge" value={edge !== 0 ? `${edge.toFixed(1)}%` : '—'} sub={edge > 0 ? 'Value ✓' : edge < 0 ? 'No value' : undefined} />
        <SecCard label="Expected value" value={ev !== 0 ? `$${ev.toFixed(2)}` : '—'} />
      </div>
      {stake > 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#6b7280', marginBottom:4 }}>
            <span>Bankroll risk</span>
            <span style={{ color:riskColor, fontWeight:700, fontFamily:MONO }}>{stakePerc.toFixed(2)}%</span>
          </div>
          <div style={{ height:8, background:'#e5e7eb', borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min(stakePerc,100)}%`, background:riskColor, borderRadius:4, transition:'width 0.3s,background 0.3s' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#9ca3af', marginTop:4 }}>
            <span style={{ color:'#22c55e' }}>Low &lt;5%</span><span style={{ color:'#f59e0b' }}>Med 5–15%</span><span style={{ color:'#ef4444' }}>High &gt;15%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tool 2: Dutching ──────────────────────────────────────────────────────────
function ToolDutch({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const target = parseFloat(st.target) || 0;
  const computed = useMemo(() => {
    const invs = st.rows.map(r => { const o = parseFloat(r.odds); return o > 1 ? 1/o : 0; });
    const sumInv = invs.reduce((a,b)=>a+b, 0);
    if (sumInv <= 0 || target <= 0) return null;
    let totalStake;
    if (st.mode === 'profit') {
      if (sumInv >= 1) return { error:'Market over 100% — no guaranteed profit possible' };
      totalStake = target * sumInv / (1 - sumInv);
    } else {
      totalStake = target;
    }
    const R = totalStake / sumInv;
    const profit = R - totalStake;
    return {
      rows: st.rows.map((r, i) => ({ implied: invs[i]*100, stake: totalStake * invs[i] / sumInv, winReturn: R })),
      totalStake, profit, coverage: sumInv*100, isGood: sumInv < 1,
    };
  }, [st.rows, st.mode, target]);

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.4px' }}>Mode</div>
          <div style={{ display:'flex', borderRadius:7, overflow:'hidden', border:'1px solid #d1d5db' }}>
            {[['profit','Target profit'],['fixed','Fixed stake']].map(([m,l]) => (
              <button key={m} onClick={() => set({ ...st, mode:m })}
                style={{ padding:'9px 16px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none', background:st.mode===m ? DARK : '#fff', color:st.mode===m ? '#fff' : '#374151' }}>{l}</button>
            ))}
          </div>
        </div>
        <Inp label={st.mode==='profit' ? 'Target profit ($)' : 'Total stake ($)'} value={st.target} onChange={v => set({ ...st, target:v })} placeholder={st.mode==='profit' ? '100' : '200'} type="number" />
        <div style={{ paddingBottom:2 }}><ClearBtn onClick={onClear} /></div>
      </div>
      <div style={{ overflowX:'auto', marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 110px 32px', gap:6, marginBottom:6, fontSize:9, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', minWidth:380 }}>
          <span>Decimal odds</span><span>Implied %</span><span>Stake</span><span>+ Profit if wins</span><span />
        </div>
        {st.rows.map((r,i) => {
          const c = computed?.rows?.[i];
          return (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 110px 32px', gap:6, marginBottom:6, alignItems:'center', minWidth:380 }}>
              <input type="number" inputMode="decimal" value={r.odds} placeholder="3.50"
                onChange={e => set({ ...st, rows:st.rows.map((row,idx)=>idx===i?{...row,odds:e.target.value}:row) })}
                style={{ fontSize:14, fontFamily:MONO, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:7, outline:'none', background:'#fff', color:'#111827' }} />
              <div style={{ fontSize:12, fontFamily:MONO, color:'#6b7280', padding:'9px 4px' }}>{c ? `${c.implied.toFixed(1)}%` : '—'}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:'#111827', fontWeight:600, padding:'9px 4px' }}>{c ? `$${c.stake.toFixed(2)}` : '—'}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:'#16a34a', fontWeight:600, padding:'9px 4px' }}>{computed && c ? `+$${computed.profit.toFixed(2)}` : '—'}</div>
              <button onClick={() => st.rows.length>2 && set({ ...st, rows:st.rows.filter((_,idx)=>idx!==i) })} disabled={st.rows.length<=2}
                style={{ fontSize:18, color:st.rows.length<=2?'#d1d5db':'#ef4444', background:'none', border:'none', cursor:st.rows.length<=2?'default':'pointer', lineHeight:1, padding:0 }}>×</button>
            </div>
          );
        })}
        <button onClick={() => set({ ...st, rows:[...st.rows,{ odds:'' }] })}
          style={{ fontSize:12, color:DARK, fontWeight:600, background:'none', border:`1px dashed ${DARK}`, borderRadius:7, padding:'7px 16px', cursor:'pointer', marginTop:4 }}>+ Add runner</button>
      </div>
      {computed && !computed.error && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <HeroCard label="Total outlay" value={`$${computed.totalStake.toFixed(2)}`} sub={`Profit: $${computed.profit.toFixed(2)}`} />
          <SecCard label="Market coverage" value={`${computed.coverage.toFixed(1)}%`} />
          <div style={{ background:computed.isGood?'#f0fdf4':'#fffbeb', border:`1px solid ${computed.isGood?'#bbf7d0':'#fde68a'}`, borderRadius:10, padding:'14px 18px', flex:1, minWidth:160, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:20 }}>{computed.isGood?'🟢':'🟡'}</div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:computed.isGood?'#15803d':'#92400e' }}>{computed.isGood?'Under 100% — profit guaranteed':'Over 100% — no arb'}</div>
              <div style={{ fontSize:10, color:computed.isGood?'#16a34a':'#b45309', fontFamily:MONO }}>Margin: {(computed.coverage-100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      )}
      {computed?.error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'12px 16px', fontSize:12, color:'#dc2626' }}>{computed.error}</div>}
    </div>
  );
}

// ── Tool 3: Each-way Dutch ────────────────────────────────────────────────────
function ToolEWDutch({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const totalStake = parseFloat(st.stake) || 0;
  const computed = useMemo(() => {
    const parsed = st.rows.map(r => parseFloat(r.odds));
    const valid = parsed.filter(o => o > 1);
    if (valid.length < 2 || totalStake <= 0) return null;
    const placeOdds = parsed.map(o => o > 1 ? (o-1)/4+1 : 0);
    const invW = parsed.map(o => o > 1 ? 1/o : 0), invP = placeOdds.map(o => o > 1 ? 1/o : 0);
    const sumW = invW.reduce((a,b)=>a+b,0), sumP = invP.reduce((a,b)=>a+b,0);
    const halfStake = totalStake / 2;
    return st.rows.map((_, i) => {
      const o = parsed[i];
      if (!o || o <= 1) return null;
      const ws = halfStake * invW[i] / sumW, ps = halfStake * invP[i] / sumP;
      return { ewStake:ws+ps, winRet:ws*o+ps*placeOdds[i], placeRet:ps*placeOdds[i], placeO:placeOdds[i] };
    });
  }, [st.rows, totalStake]);

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Inp label="Total E/W stake ($)" value={st.stake} onChange={v => set({ ...st, stake:v })} placeholder="200" type="number" />
        <div style={{ paddingBottom:2 }}><ClearBtn onClick={onClear} /></div>
      </div>
      <div style={{ fontSize:11, color:'#6b7280', marginBottom:12 }}>Uses standard 1/4 odds, 3 places. Win and place stakes dutch&apos;d separately.</div>
      <div style={{ overflowX:'auto', marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 100px 110px 32px', gap:6, marginBottom:6, fontSize:9, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', minWidth:480 }}>
          <span>Win odds</span><span>Place odds</span><span>E/W stake</span><span>Win return</span><span>Place return</span><span />
        </div>
        {st.rows.map((r,i) => {
          const c = computed?.[i];
          const po = parseFloat(r.odds)>1 ? ((parseFloat(r.odds)-1)/4+1).toFixed(2) : '—';
          return (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 100px 110px 32px', gap:6, marginBottom:6, alignItems:'center', minWidth:480 }}>
              <input type="number" inputMode="decimal" value={r.odds} placeholder="5.00"
                onChange={e => set({ ...st, rows:st.rows.map((row,idx)=>idx===i?{...row,odds:e.target.value}:row) })}
                style={{ fontSize:14, fontFamily:MONO, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:7, outline:'none', background:'#fff', color:'#111827' }} />
              <div style={{ fontSize:12, fontFamily:MONO, color:'#6b7280', padding:'4px' }}>{po}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:'#111827', fontWeight:600, padding:'4px' }}>{c ? `$${c.ewStake.toFixed(2)}` : '—'}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:'#16a34a', fontWeight:600, padding:'4px' }}>{c ? `$${c.winRet.toFixed(2)}` : '—'}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:'#0891b2', fontWeight:600, padding:'4px' }}>{c ? `$${c.placeRet.toFixed(2)}` : '—'}</div>
              <button onClick={() => st.rows.length>2 && set({ ...st, rows:st.rows.filter((_,idx)=>idx!==i) })} disabled={st.rows.length<=2}
                style={{ fontSize:18, color:st.rows.length<=2?'#d1d5db':'#ef4444', background:'none', border:'none', cursor:st.rows.length<=2?'default':'pointer', lineHeight:1, padding:0 }}>×</button>
            </div>
          );
        })}
        <button onClick={() => set({ ...st, rows:[...st.rows,{ odds:'' }] })}
          style={{ fontSize:12, color:DARK, fontWeight:600, background:'none', border:`1px dashed ${DARK}`, borderRadius:7, padding:'7px 16px', cursor:'pointer', marginTop:4 }}>+ Add runner</button>
      </div>
    </div>
  );
}

// ── Tool 4: Multi builder ─────────────────────────────────────────────────────
function ToolMulti({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const stake = parseFloat(st.stake) || 0;
  const combined = useMemo(() => {
    const valid = st.legs.filter(l => parseFloat(l.odds) > 1);
    return valid.length ? valid.reduce((acc,l) => acc * parseFloat(l.odds), 1) : 0;
  }, [st.legs]);
  const payout = combined > 0 && stake > 0 ? combined * stake : 0;

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 32px', gap:8, marginBottom:6, fontSize:9, fontWeight:600, color:'#9ca3af', textTransform:'uppercase' }}>
          <span>Selection / event</span><span>Decimal odds</span><span />
        </div>
        {st.legs.map((l,i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 32px', gap:8, marginBottom:8, alignItems:'center' }}>
            <input value={l.name} placeholder={`Leg ${i+1}`}
              onChange={e => set({ ...st, legs:st.legs.map((leg,idx)=>idx===i?{...leg,name:e.target.value}:leg) })}
              style={{ fontSize:13, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:7, outline:'none', background:'#fff', color:'#111827' }} />
            <input type="number" inputMode="decimal" value={l.odds} placeholder="2.50"
              onChange={e => set({ ...st, legs:st.legs.map((leg,idx)=>idx===i?{...leg,odds:e.target.value}:leg) })}
              style={{ fontSize:14, fontFamily:MONO, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:7, outline:'none', background:'#fff', color:'#111827' }} />
            <button onClick={() => st.legs.length>1 && set({ ...st, legs:st.legs.filter((_,idx)=>idx!==i) })} disabled={st.legs.length<=1}
              style={{ fontSize:18, color:st.legs.length<=1?'#d1d5db':'#ef4444', background:'none', border:'none', cursor:st.legs.length<=1?'default':'pointer', lineHeight:1, padding:0 }}>×</button>
          </div>
        ))}
        <button onClick={() => set({ ...st, legs:[...st.legs,{ name:'', odds:'' }] })}
          style={{ fontSize:12, color:DARK, fontWeight:600, background:'none', border:`1px dashed ${DARK}`, borderRadius:7, padding:'7px 16px', cursor:'pointer' }}>+ Add leg</button>
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Inp label="Stake ($)" value={st.stake} onChange={v => set({ ...st, stake:v })} placeholder="50" type="number" />
        <div style={{ paddingBottom:2 }}><ClearBtn onClick={onClear} /></div>
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <HeroCard label="Combined odds" value={combined > 0 ? combined.toFixed(2) : '—'} sub={`${st.legs.filter(l=>parseFloat(l.odds)>1).length} legs`} />
        <SecCard label="Potential payout" value={payout > 0 ? `$${payout.toFixed(2)}` : '—'} />
        <SecCard label="Profit" value={payout > 0 ? `$${(payout-stake).toFixed(2)}` : '—'} />
      </div>
    </div>
  );
}

// ── Tool 5: EV Calc ───────────────────────────────────────────────────────────
function ToolEV({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const odds = parseFloat(st.odds), prob = parseFloat(st.prob)/100, stake = parseFloat(st.stake)||0;
  let ev = 0, evPerc = 0, edge = 0, impliedProb = 0;
  if (odds > 1 && prob > 0 && prob <= 1) {
    const b = odds-1, q = 1-prob;
    edge = (prob - 1/odds)*100;
    evPerc = (prob*b - q)*100;
    ev = stake > 0 ? stake*(prob*b - q) : evPerc;
  }
  if (odds > 1) impliedProb = 1/odds*100;

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, alignItems:'flex-end' }}>
        <Inp label="Decimal odds" value={st.odds} onChange={v => set({ ...st, odds:v })} placeholder="2.50" type="number" />
        <Inp label="Your probability" value={st.prob} onChange={v => set({ ...st, prob:v })} placeholder="45" right="%" type="number" />
        <Inp label="Stake ($)" value={st.stake} onChange={v => set({ ...st, stake:v })} placeholder="100" type="number" />
        <div style={{ paddingBottom:2 }}><ClearBtn onClick={onClear} /></div>
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <HeroCard label={stake > 0 ? 'Expected value ($)' : 'EV per 100 units'} value={odds>1&&prob>0 ? (stake>0?`$${ev.toFixed(2)}`:`${evPerc.toFixed(1)}%`) : '—'} sub={odds>1&&prob>0 ? `${evPerc.toFixed(2)}% per unit` : undefined} />
        <SecCard label="Edge" value={edge!==0 ? `${edge.toFixed(2)}%` : '—'} sub={edge>0?'Value bet ✓':edge<0?'No value ✗':undefined} />
        <SecCard label="Implied prob" value={impliedProb>0 ? `${impliedProb.toFixed(1)}%` : '—'} sub={prob>0&&impliedProb>0 ? `Your est: ${(prob*100).toFixed(1)}%` : undefined} />
      </div>
    </div>
  );
}

// ── Tool 6: Odds Converter ────────────────────────────────────────────────────
function ToolConv({ st, set, onClear, locked, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  function syncFrom(dec) {
    const d = parseFloat(dec);
    if (!d || isNaN(d) || d <= 1) return { decimal:dec, fraction:'', american:'', implied:'' };
    return { decimal:dec, fraction:decToFrac(d), american:decToAmerican(d), implied:(1/d*100).toFixed(2) };
  }
  function onDecimal(v) { set({ ...st, ...syncFrom(v), decimal:v }); }
  function onFraction(v) {
    const dec = fracToDec(v);
    set(dec ? { ...st, ...syncFrom(dec), fraction:v } : { ...st, fraction:v });
  }
  function onAmerican(v) {
    set({ ...st, american:v });
    const dec = americanToDec(v);
    if (dec) set({ ...st, ...syncFrom(dec), american:v });
  }
  function onImplied(v) {
    set({ ...st, implied:v });
    const p = parseFloat(v);
    if (p > 0 && p < 100) { const dec = (100/p).toFixed(3); set({ ...st, ...syncFrom(dec), implied:v }); }
  }

  return (
    <div style={{ position:'relative', minHeight:300 }}>
      {locked && !dismissed && <ProOverlay onUpgrade={onUpgrade} onClose={() => setDismissed(true)} />}
      <div style={{ fontSize:12, color:'#6b7280', marginBottom:16 }}>Edit any field — the others update live.</div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 }}>
        <Inp label="Decimal" value={st.decimal} onChange={onDecimal} placeholder="2.50" />
        <Inp label="Fractional" value={st.fraction} onChange={onFraction} placeholder="3/2" />
        <Inp label="American" value={st.american} onChange={onAmerican} placeholder="+150" />
        <Inp label="Implied %" value={st.implied} onChange={onImplied} placeholder="40.00" right="%" />
      </div>
      {st.decimal && parseFloat(st.decimal) > 1 && (
        <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10, padding:'16px 20px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#6b7280', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.4px' }}>Summary</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {[['Decimal',st.decimal],['Fractional',st.fraction],['American',st.american],['Implied %',st.implied?`${st.implied}%`:'']].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontSize:10, color:'#9ca3af', marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:20, fontWeight:700, fontFamily:MONO, color:'#111827' }}>{v||'—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop:16 }}><ClearBtn onClick={onClear} /></div>
    </div>
  );
}

// ── Quick tools helpers (shared with full tabs) ───────────────────────────────
function syncConvFromDec(conv, v) {
  const d = parseFloat(v);
  if (!d || isNaN(d) || d <= 1) return { ...conv, decimal:v, fraction:'', american:'', implied:'' };
  return { ...conv, decimal:v, fraction:decToFrac(d), american:decToAmerican(d), implied:(1/d*100).toFixed(2) };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BettingToolsPage() {
  const isMobile = useIsMobile();
  const isPro = useIsPro();
  const router = useRouter();
  const [state, setStateRaw] = useState(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        setStateRaw(prev => ({ ...DEFAULT, ...prev, ...p }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  const setState = useCallback((next) => {
    setStateRaw(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const locked = isPro === false;
  const onUpgrade = () => router.push('/account');

  const TABS = [
    { id:'kelly',   label:'Kelly staking' },
    { id:'dutch',   label:'Dutching' },
    { id:'ewdutch', label:'Each-way dutch' },
    { id:'multi',   label:'Multi builder' },
    { id:'ev',      label:'EV calc' },
    { id:'conv',    label:'Odds converter' },
  ];

  // Quick strip: EV computed
  const qEv = useMemo(() => {
    const o = parseFloat(state.ev.odds), p = parseFloat(state.ev.prob)/100;
    if (o > 1 && p > 0 && p <= 1) return ((p*(o-1)-(1-p))*100).toFixed(1);
    return null;
  }, [state.ev.odds, state.ev.prob]);

  const STRIP_H = 52;
  const MOBILE_TAB_H = 56;
  const contentPb = isMobile ? STRIP_H + MOBILE_TAB_H + 8 : STRIP_H + 8;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', background:'#f8fafc' }}>

      {/* Header */}
      <div style={{ background:DARK, padding:isMobile?'14px 16px 0':'18px 28px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3 }}>
              <h1 style={{ fontSize:isMobile?18:22, fontWeight:700, color:'#fff', margin:0 }}>Betting Tools</h1>
              <span style={{ background:GOLD, color:DARK, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, letterSpacing:'0.5px' }}>PRO</span>
            </div>
            <div style={{ fontSize:12, color:'#86baa8' }}>Professional staking & pricing suite</div>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display:'flex', gap:4, overflowX:'auto', scrollbarWidth:'none', paddingBottom:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setState({ ...state, activeTab:t.id })}
              style={{ padding:isMobile?'8px 12px':'9px 18px', borderRadius:'7px 7px 0 0', border:'none', cursor:'pointer', fontWeight:600, fontSize:isMobile?11:12, whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s',
                background:state.activeTab===t.id ? '#fff' : DARK2,
                color:state.activeTab===t.id ? DARK : '#86baa8' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tool content */}
      <div style={{ flex:1, overflowY:'auto', padding:isMobile?'16px':'24px 28px', paddingBottom:contentPb }}>
        {state.activeTab==='kelly'   && <ToolKelly   st={state.kelly}   set={v=>setState({...state,kelly:v})}   onClear={()=>setState({...state,kelly:DEFAULT.kelly})}     locked={locked} onUpgrade={onUpgrade} />}
        {state.activeTab==='dutch'   && <ToolDutch   st={state.dutch}   set={v=>setState({...state,dutch:v})}   onClear={()=>setState({...state,dutch:DEFAULT.dutch})}     locked={locked} onUpgrade={onUpgrade} />}
        {state.activeTab==='ewdutch' && <ToolEWDutch st={state.ewdutch} set={v=>setState({...state,ewdutch:v})} onClear={()=>setState({...state,ewdutch:DEFAULT.ewdutch})} locked={locked} onUpgrade={onUpgrade} />}
        {state.activeTab==='multi'   && <ToolMulti   st={state.multi}   set={v=>setState({...state,multi:v})}   onClear={()=>setState({...state,multi:DEFAULT.multi})}     locked={locked} onUpgrade={onUpgrade} />}
        {state.activeTab==='ev'      && <ToolEV      st={state.ev}      set={v=>setState({...state,ev:v})}      onClear={()=>setState({...state,ev:DEFAULT.ev})}           locked={locked} onUpgrade={onUpgrade} />}
        {state.activeTab==='conv'    && <ToolConv    st={state.conv}    set={v=>setState({...state,conv:v})}    onClear={()=>setState({...state,conv:DEFAULT.conv})}       locked={locked} onUpgrade={onUpgrade} />}
      </div>

      {/* Quick tools strip — pinned above mobile tab bar */}
      <div style={{ position:'fixed', bottom:isMobile?MOBILE_TAB_H:0, left:0, right:0, height:STRIP_H, background:'#f9fafb', borderTop:'1px solid #e5e7eb', zIndex:200, display:'flex', alignItems:'center', gap:16, padding:'0 16px', overflowX:'auto', scrollbarWidth:'none' }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px', flexShrink:0 }}>Quick tools</span>

        {/* Compact odds converter */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:10, color:'#6b7280', fontWeight:600, flexShrink:0 }}>Odds</span>
          <input type="text" value={state.conv.decimal} placeholder="Decimal"
            onChange={e => setState({ ...state, conv:syncConvFromDec(state.conv, e.target.value) })}
            style={{ width:68, fontSize:12, fontFamily:MONO, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:5, outline:'none' }} />
          <span style={{ fontSize:11, color:'#374151', fontFamily:MONO, minWidth:30 }}>{state.conv.fraction||'—'}</span>
          <span style={{ fontSize:11, color:'#374151', fontFamily:MONO, minWidth:38 }}>{state.conv.american||'—'}</span>
          <span style={{ fontSize:11, color:'#6b7280', fontFamily:MONO, minWidth:42 }}>{state.conv.implied?`${state.conv.implied}%`:'—'}</span>
        </div>

        <div style={{ width:1, height:24, background:'#d1d5db', flexShrink:0 }} />

        {/* Compact EV */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:10, color:'#6b7280', fontWeight:600, flexShrink:0 }}>EV</span>
          <input type="number" inputMode="decimal" value={state.ev.odds} placeholder="Odds"
            onChange={e => setState({ ...state, ev:{ ...state.ev, odds:e.target.value } })}
            style={{ width:60, fontSize:12, fontFamily:MONO, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:5, outline:'none' }} />
          <input type="number" inputMode="decimal" value={state.ev.prob} placeholder="Prob %"
            onChange={e => setState({ ...state, ev:{ ...state.ev, prob:e.target.value } })}
            style={{ width:64, fontSize:12, fontFamily:MONO, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:5, outline:'none' }} />
          <span style={{ fontSize:12, fontWeight:700, fontFamily:MONO, minWidth:52, color:qEv!==null?(parseFloat(qEv)>0?'#16a34a':'#dc2626'):'#9ca3af' }}>
            {qEv!==null?`${qEv}%`:'—'}
          </span>
        </div>
      </div>
    </div>
  );
}
