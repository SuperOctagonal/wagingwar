'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  DIMS, PL, SL, group, agg, pl, sg, pc, ni, money, ordn, cum, spark,
} from './helpers';

const POS = '#6fb4ff'; // profit -- blue, per the brief (not green)
const NEG = '#ff9455'; // loss -- orange, per the brief (not red)
const MUT = '#98a1ad';
const AMBER = '#ffc247';

const selStyle = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'transparent',
  color: AMBER,
  font: 'inherit',
  fontWeight: 700,
  border: 0,
  borderBottom: `2px dashed ${AMBER}`,
  padding: '0 18px 2px 2px',
  margin: '0 2px',
  cursor: 'pointer',
  borderRadius: 0,
  maxWidth: '100%',
  // inline-flex + minHeight so the tap target is a real 44px even though
  // the visible text/underline is much shorter -- an inline <select> alone
  // doesn't reliably get a tall tap area just from its font's line-height.
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  verticalAlign: 'middle',
};
const btnStyle = {
  cursor: 'pointer', background: '#14171c', color: '#e8eaee', border: '1px solid #2b313a',
  borderRadius: 999, padding: '9px 14px', fontSize: 13, minHeight: 44,
};
const chipStyle = {
  cursor: 'pointer', background: '#2a2412', color: '#ffd77a', border: '1px solid #5d4a14',
  borderRadius: 999, padding: '7px 12px', fontSize: 13, minHeight: 44,
  display: 'inline-flex', alignItems: 'center',
};
const hdStyle = {
  cursor: 'pointer', background: 'none', border: 0, color: MUT, font: 'inherit',
  fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', padding: 0, textAlign: 'inherit',
};
// JetBrains Mono is already loaded globally (app/layout.js, next/font) as
// --font-jetbrains-mono -- reused here rather than pulling in a second
// copy of the same typeface via a Google Fonts <link>.
const mono = { fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' };

const DEFAULT_FILTERS = { st: 'all', pr: 'all', sc: 'all', per: 'all', q: '', grp: 'none' };

function Sentence({ f, set }) {
  return (
    <div style={{ fontSize: 20, lineHeight: 2, fontWeight: 500, color: '#e8eaee' }}>
      Show top picks in{' '}
      <select aria-label="State" style={selStyle} value={f.st} onChange={e => set({ st: e.target.value })}>
        <option value="all">any state</option>
        {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>{' '}
      priced{' '}
      <select aria-label="Tip price" style={selStyle} value={f.pr} onChange={e => set({ pr: e.target.value })}>
        <option value="all">at any price</option>
        {PL.map(p => <option key={p} value={p}>{p.toLowerCase()}</option>)}
      </select>{' '}
      with a score{' '}
      <select aria-label="Score" style={selStyle} value={f.sc} onChange={e => set({ sc: e.target.value })}>
        <option value="all">of any size</option>
        {SL.map(s => <option key={s} value={s}>{s.toLowerCase()}</option>)}
      </select>{' '}
      over{' '}
      <select aria-label="Period" style={selStyle} value={f.per} onChange={e => set({ per: e.target.value })}>
        <option value="all">all time</option>
        <option value="14">the last 14 days</option>
        <option value="7">the last 7 days</option>
      </select>
      ,{' '}grouped by{' '}
      <select aria-label="Group by" style={selStyle} value={f.grp} onChange={e => set({ grp: e.target.value })}>
        <option value="none">nothing (every tip)</option>
        <option value="state">state</option>
        <option value="venue">venue</option>
        <option value="price">tip price</option>
        <option value="score">score</option>
        <option value="field">field size</option>
        <option value="race">race number</option>
        <option value="dow">day of week</option>
        <option value="week">week</option>
      </select>.
    </div>
  );
}

function Readout({ a, sparkPts, col }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(520px,100%),1fr))', gap: 20, alignItems: 'stretch', borderTop: '1px solid #232830', borderBottom: '1px solid #232830', padding: '20px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '18px 20px', alignContent: 'center' }}>
        <div><div style={{ ...mono, fontSize: 30, fontWeight: 700 }}>{ni(a.n)}</div><div style={{ color: MUT, fontSize: 12, letterSpacing: '.06em' }}>BETS</div></div>
        <div><div style={{ ...mono, fontSize: 30, fontWeight: 700 }}>{ni(a.w)} <span style={{ fontSize: 15, color: MUT, fontWeight: 500 }}>{a.sr.toFixed(1)}%</span></div><div style={{ color: MUT, fontSize: 12, letterSpacing: '.06em' }}>WON</div></div>
        <div><div style={{ ...mono, fontSize: 30, fontWeight: 700 }}>{ni(a.p)} <span style={{ fontSize: 15, color: MUT, fontWeight: 500 }}>{a.pr.toFixed(1)}%</span></div><div style={{ color: MUT, fontSize: 12, letterSpacing: '.06em' }}>FINISHED TOP 3</div></div>
        <div><div style={{ ...mono, fontSize: 30, fontWeight: 700, color: col }}>{sg(a.u, 2)}</div><div style={{ color: MUT, fontSize: 12, letterSpacing: '.06em' }}>UNITS ($1 FLAT)</div></div>
        <div><div style={{ ...mono, fontSize: 30, fontWeight: 700, color: col }}>{pc(a.roi, 1)}</div><div style={{ color: MUT, fontSize: 12, letterSpacing: '.06em' }}>RETURN ON TURNOVER</div></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: MUT, fontSize: 12, letterSpacing: '.06em' }}>
          <span>RUNNING PROFIT / LOSS, IN ORDER OF RACE</span><span style={{ ...mono, color: col }}>{sg(a.u, 2)}</span>
        </div>
        <svg viewBox="0 0 600 120" width="100%" role="img" aria-label="Running profit and loss for the current selection" style={{ display: 'block' }}>
          <line x1="0" x2="600" y1={sparkPts.zy} y2={sparkPts.zy} stroke="#3a424d" strokeWidth="1" strokeDasharray="4 4" />
          <polyline points={sparkPts.pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function LedgerTable({ rows, sk, sd, setSort, show, setShow }) {
  const run = new Map();
  let c = 0;
  rows.forEach(r => { c += pl(r); run.set(r, c); });
  let mr = 1;
  run.forEach(v => { mr = Math.max(mr, Math.abs(v)); });
  const keys = {
    date: r => r[0], venue: r => r[1], horse: r => r[4], score: r => r[5],
    tip: r => (r[7] == null ? 0 : r[7]), sp: r => r[8], units: r => pl(r), run: r => run.get(r),
  };
  const idx = new Map(); rows.forEach((r, i) => idx.set(r, i));
  const sorted = rows.slice().sort((x, y) => {
    const kx = keys[sk](x), ky = keys[sk](y);
    if (kx < ky) return -1 * sd;
    if (kx > ky) return 1 * sd;
    return (idx.get(x) - idx.get(y)) * sd;
  });
  const view = sorted.slice(0, show);
  const cols = [
    { k: 'date', label: 'Date', align: 'left' },
    { k: 'venue', label: 'Venue', align: 'left' },
    { k: null, label: 'Race', align: 'left' },
    { k: 'horse', label: 'Horse', align: 'left' },
    { k: 'score', label: 'Score', align: 'right' },
    { k: 'tip', label: 'Tip $', align: 'right' },
    { k: 'sp', label: 'SP', align: 'right' },
    { k: null, label: 'Result', align: 'left' },
    { k: 'units', label: 'Units', align: 'right' },
    { k: 'run', label: 'Running', align: 'left' },
  ];
  const tpl = '92px 1.5fr 44px 1.6fr 56px 70px 70px 84px 74px 1.1fr';
  const pill = f => (f === 1 ? ['#06203a', '#6fb4ff', '#6fb4ff'] : f <= 3 ? ['transparent', '#9fcbff', '#3c6aa0'] : ['transparent', MUT, '#2b313a']);

  return (
    <>
      <div style={{ overflowX: 'auto', border: '1px solid #232830', borderRadius: 12 }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: 'grid', gridTemplateColumns: tpl, gap: 10, padding: '12px 16px', background: '#14171c', borderBottom: '1px solid #232830', borderRadius: '12px 12px 0 0' }}>
            {cols.map((c2, i) => (
              <div key={i} style={{ textAlign: c2.align }}>
                {c2.k ? (
                  <button style={{ ...hdStyle, textAlign: c2.align }} onClick={() => setSort(c2.k)}>
                    {c2.label}{sk === c2.k ? (sd < 0 ? ' ↓' : ' ↑') : ''}
                  </button>
                ) : <span style={hdStyle}>{c2.label}</span>}
              </div>
            ))}
          </div>
          {view.map((r, i) => {
            const u = pl(r), p = pill(r[9]), rn = run.get(r), w = Math.abs(rn) / mr * 50;
            const uc = u >= 0 ? POS : NEG;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: tpl, gap: 10, padding: '10px 16px', borderBottom: '1px solid #1b1f25', alignItems: 'center' }}>
                <div style={{ ...mono, color: '#b4bcc7' }}>{r[0]}</div>
                <div>{r[1]} <span style={{ color: MUT, fontSize: 12 }}>{r[2]}</span></div>
                <div style={{ ...mono, color: MUT }}>R{r[3]}</div>
                <div style={{ fontWeight: 600 }}>{r[4]}</div>
                <div style={{ ...mono, textAlign: 'right' }}>{r[5]}</div>
                <div style={{ ...mono, textAlign: 'right' }}>{money(r[7])}</div>
                <div style={{ ...mono, textAlign: 'right' }}>{money(r[8])}</div>
                <div><span style={{ display: 'inline-block', minWidth: 48, textAlign: 'center', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: p[0], color: p[1], border: `1px solid ${p[2]}` }}>{ordn(r[9])}</span></div>
                <div style={{ ...mono, textAlign: 'right', fontWeight: 600, color: uc }}>{sg(u, 2)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: '#1b1f25', borderRadius: 3, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, height: 6, borderRadius: 3, left: `${rn >= 0 ? 50 : 50 - w}%`, width: `${w}%`, background: rn >= 0 ? POS : NEG }} />
                  </div>
                  <span style={{ ...mono, width: 56, textAlign: 'right', color: rn >= 0 ? POS : NEG }}>{sg(rn, 1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        {rows.length > show && (
          <>
            <button style={btnStyle} onClick={() => setShow(show + 40)}>Show 40 more</button>
            <button style={btnStyle} onClick={() => setShow(99999)}>Show all {ni(rows.length)}</button>
          </>
        )}
        <span style={{ color: MUT, fontSize: 13 }}>Showing {ni(view.length)} of {ni(rows.length)}</span>
      </div>
    </>
  );
}

function GroupedTable({ rows, grp, minN, setMinN, open, setOpen }) {
  const groups = group(rows, grp).filter(g => g.a.n >= minN);
  const tpl = '1.5fr 70px 70px 80px 80px 90px 190px 110px';
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', color: '#b4bcc7', fontSize: 13, marginBottom: 12 }}>
        <label htmlFor="minn">Hide groups with fewer than</label>
        <select id="minn" style={selStyle} value={minN} onChange={e => setMinN(+e.target.value)}>
          {[0, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n} bets</option>)}
        </select>
        <span>Groups under 20 bets are faded: too few to trust.</span>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #232830', borderRadius: 12 }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ display: 'grid', gridTemplateColumns: tpl, gap: 10, padding: '12px 16px', background: '#14171c', borderBottom: '1px solid #232830', borderRadius: '12px 12px 0 0', color: MUT, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            <div>{DIMS[grp].label}</div>
            <div style={{ textAlign: 'right' }}>Bets</div>
            <div style={{ textAlign: 'right' }}>Won</div>
            <div style={{ textAlign: 'right' }}>Strike</div>
            <div style={{ textAlign: 'right' }}>Top 3</div>
            <div style={{ textAlign: 'right' }}>Units</div>
            <div>Return</div>
            <div>Trend</div>
          </div>
          {groups.map(g => {
            const gc = g.a.u >= 0 ? POS : NEG;
            const w = Math.min(Math.abs(g.a.roi) / 60, 1) * 50;
            const isOpen = open === g.key;
            const small = g.a.n < 20;
            const sk = spark(cum(g.rows), 96, 24, 2);
            const sub = g.rows.slice(-12).reverse();
            return (
              <div key={g.key} style={{ borderBottom: '1px solid #1b1f25', opacity: small ? 0.55 : 1 }}>
                <button
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : g.key)}
                  style={{ cursor: 'pointer', background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', padding: 0, width: '100%', minHeight: 44 }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: tpl, gap: 10, padding: '12px 16px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>
                      <span style={{ display: 'inline-block', width: 16, color: AMBER }}>{isOpen ? '▾' : '▸'}</span>
                      {g.key} <span style={{ color: MUT, fontSize: 12, fontWeight: 500 }}>{small ? '· small sample' : ''}</span>
                    </div>
                    <div style={{ ...mono, textAlign: 'right' }}>{ni(g.a.n)}</div>
                    <div style={{ ...mono, textAlign: 'right' }}>{ni(g.a.w)}</div>
                    <div style={{ ...mono, textAlign: 'right' }}>{g.a.sr.toFixed(1)}%</div>
                    <div style={{ ...mono, textAlign: 'right' }}>{g.a.pr.toFixed(1)}%</div>
                    <div style={{ ...mono, textAlign: 'right', fontWeight: 600, color: gc }}>{sg(g.a.u, 1)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 14, position: 'relative', background: '#171b21', borderRadius: 3 }}>
                        <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#4a525d' }} />
                        <div style={{ position: 'absolute', top: 2, height: 10, borderRadius: 2, left: `${g.a.roi >= 0 ? 50 : 50 - w}%`, width: `${w}%`, background: gc }} />
                      </div>
                      <span style={{ ...mono, width: 60, textAlign: 'right', color: gc, fontWeight: 600 }}>{pc(g.a.roi, 1)}</span>
                    </div>
                    <svg viewBox="0 0 96 24" width={96} height={24} aria-hidden="true">
                      <line x1="0" x2="96" y1={sk.zy} y2={sk.zy} stroke="#3a424d" strokeWidth="1" />
                      <polyline points={sk.pts} fill="none" stroke={gc} strokeWidth="1.6" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ background: '#10131a', padding: '6px 16px 14px 44px', borderTop: '1px solid #1b1f25' }}>
                    <div style={{ color: MUT, fontSize: 12, padding: '8px 0' }}>Latest {sub.length} of {g.a.n} bets in this group</div>
                    {sub.map((r, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1.6fr 1.4fr 70px 70px', gap: 10, padding: '5px 0', borderBottom: '1px solid #1b1f25' }}>
                        <span style={{ ...mono, color: '#b4bcc7' }}>{r[0]}</span>
                        <span>{r[1]} R{r[3]}</span>
                        <span style={{ fontWeight: 600 }}>{r[4]}</span>
                        <span style={{ color: MUT }}>{ordn(r[9])}</span>
                        <span style={{ ...mono, textAlign: 'right', color: pl(r) >= 0 ? POS : NEG }}>{sg(pl(r), 2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <AllRow rows={rows} tpl={tpl} />
        </div>
      </div>
    </>
  );
}

function AllRow({ rows, tpl }) {
  const a = agg(rows);
  const col = a.u >= 0 ? POS : NEG;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: tpl, gap: 10, padding: '14px 16px', background: '#14171c', borderRadius: '0 0 12px 12px', fontWeight: 700 }}>
      <div>All of the above</div>
      <div style={{ ...mono, textAlign: 'right' }}>{ni(a.n)}</div>
      <div style={{ ...mono, textAlign: 'right' }}>{ni(a.w)}</div>
      <div style={{ ...mono, textAlign: 'right' }}>{a.sr.toFixed(1)}%</div>
      <div style={{ ...mono, textAlign: 'right' }}>{a.pr.toFixed(1)}%</div>
      <div style={{ ...mono, textAlign: 'right', color: col }}>{sg(a.u, 1)}</div>
      <div style={{ ...mono, color: col }}>{pc(a.roi, 1)}</div>
      <div />
    </div>
  );
}

export default function TipRecordClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [sk, setSk] = useState('date');
  const [sd, setSd] = useState(-1);
  const [show, setShow] = useState(40);
  const [minN, setMinN] = useState(0);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch('/api/tip-record')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const set = patch => { setF(prev => ({ ...prev, ...patch })); setShow(40); setOpen(null); };
  const setSort = k => { setSk(prevK => k); setSd(prevSd => (sk === k ? -sd : (k === 'venue' || k === 'horse' ? 1 : -1))); setShow(40); };

  const allRows = data?.rows || [];
  const q = f.q.trim().toLowerCase();
  const rows = useMemo(() => {
    return allRows.filter(r => {
      if (f.st !== 'all' && r[2] !== f.st) return false;
      if (f.pr !== 'all' && DIMS.price.get(r) !== f.pr) return false;
      if (f.sc !== 'all' && DIMS.score.get(r) !== f.sc) return false;
      if (f.per !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (+f.per - 1));
        if (r[0] < cutoff.toISOString().slice(0, 10)) return false;
      }
      if (q && (r[4] + ' ' + r[1]).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }, [allRows, f.st, f.pr, f.sc, f.per, q]);

  const a = agg(rows);
  const col = a.u >= 0 ? POS : NEG;
  const sparkPts = spark(cum(rows), 600, 120, 8);
  const isGrouped = f.grp !== 'none';
  const small = a.n > 0 && a.n < 50;

  const chips = [];
  if (f.st !== 'all') chips.push({ label: f.st, clear: () => set({ st: 'all' }) });
  if (f.pr !== 'all') chips.push({ label: f.pr, clear: () => set({ pr: 'all' }) });
  if (f.sc !== 'all') chips.push({ label: 'Score ' + f.sc.toLowerCase(), clear: () => set({ sc: 'all' }) });
  if (f.per !== 'all') chips.push({ label: 'Last ' + f.per + ' days', clear: () => set({ per: 'all' }) });
  if (q) chips.push({ label: '"' + f.q.trim() + '"', clear: () => set({ q: '' }) });
  const hasChips = chips.length > 0 || f.grp !== 'none';

  const vAll = () => { setF(DEFAULT_FILTERS); setShow(40); setOpen(null); setMinN(0); };
  const vPrice = () => { setF({ ...DEFAULT_FILTERS, grp: 'price' }); setShow(40); setOpen(null); };
  const vState = () => { setF({ ...DEFAULT_FILTERS, grp: 'state' }); setShow(40); setOpen(null); };
  const vWeek = () => { setF({ ...DEFAULT_FILTERS, per: '7' }); setShow(40); setOpen(null); };

  return (
    <main style={{ minHeight: '100vh', background: '#0d0f12', color: '#e8eaee', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 14, lineHeight: 1.45 }}>
      <style>{`
        @media (max-width:700px){.tr-title{font-size:32px !important}.tr-sentence{font-size:18px !important;line-height:2.2 !important}}
        .tr-sel option{color:#111;background:#fff;font-weight:500}
        .tr-btn:hover{border-color:${AMBER}}
        .tr-page{max-width:100vw;overflow-x:hidden}
      `}</style>
      <div className="tr-page" style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 16px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...mono, fontSize: 12, color: MUT, letterSpacing: '.08em' }}>
            TIP RECORD {data ? `· SETTLED RESULTS TO ${data.meta.results_to}` : ''}
          </div>
          <h1 className="tr-title" style={{ margin: 0, fontSize: 44, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-.02em' }}>Tip Record</h1>
          <div style={{ color: '#b4bcc7', fontSize: 15, maxWidth: 760 }}>
            Every top pick, settled at the official starting price. The ranking is recorded just after each race starts and is never edited afterwards.
          </div>
        </div>

        {error && (
          <div style={{ background: '#2a1212', border: '1px solid #5d1414', borderRadius: 10, padding: '14px 16px', color: '#ffb3a7' }}>
            Couldn&apos;t load the tip record right now. Please try again shortly.
          </div>
        )}

        {!data && !error && (
          <div style={{ color: MUT, padding: '40px 0' }}>Loading…</div>
        )}

        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: MUT, fontSize: 13, marginRight: 4 }}>Saved views</span>
              <button className="tr-btn" style={btnStyle} onClick={vAll}>All tips</button>
              <button className="tr-btn" style={btnStyle} onClick={vPrice}>Where do we win? (by price)</button>
              <button className="tr-btn" style={btnStyle} onClick={vState}>By state</button>
              <button className="tr-btn" style={btnStyle} onClick={vWeek}>Last 7 days</button>
            </div>

            <div style={{ background: '#14171c', border: '1px solid #232830', borderRadius: 14, padding: '20px 20px' }}>
              <div className="tr-sentence"><Sentence f={f} set={set} /></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                <div style={{ flex: '1 1 220px', maxWidth: 420 }}>
                  <label htmlFor="q" style={{ position: 'absolute', left: -9999 }}>Search horse or venue</label>
                  <input
                    id="q" type="text" placeholder="Search a horse or venue" value={f.q}
                    onChange={e => set({ q: e.target.value })}
                    style={{ background: '#14171c', color: '#e8eaee', border: '1px solid #2b313a', borderRadius: 8, padding: '0 12px', font: 'inherit', minHeight: 44, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                {chips.map((c, i) => (
                  <button key={i} aria-label={`Clear filter ${c.label}`} onClick={c.clear} style={chipStyle}>{c.label} &nbsp;✕</button>
                ))}
                {hasChips && <button className="tr-btn" style={btnStyle} onClick={vAll}>Reset all</button>}
              </div>
            </div>

            <Readout a={a} sparkPts={sparkPts} col={col} />

            {small && (
              <div style={{ background: '#2a2412', border: '1px solid #5d4a14', borderRadius: 10, padding: '10px 14px', color: '#ffd77a' }}>
                Only {a.n} bets here. Results from a small sample swing a lot and tell you very little.
              </div>
            )}

            {!isGrouped
              ? <LedgerTable rows={rows} sk={sk} sd={sd} setSort={setSort} show={show} setShow={setShow} />
              : <GroupedTable rows={rows} grp={f.grp} minN={minN} setMinN={setMinN} open={open} setOpen={setOpen} />}

            <div style={{ color: MUT, fontSize: 13, lineHeight: 1.6, maxWidth: 900, borderTop: '1px solid #232830', paddingTop: 18 }}>
              <div style={{ color: '#e8eaee', fontWeight: 700, marginBottom: 6 }}>How to read this</div>
              Top picks are the horse our model ranks first in each race. The ranking is recorded just after each race starts and is never edited afterwards -- these are not tips published before the race. Every bet is $1 to win at the official starting price. Units are dollars won or lost. Return on turnover is units divided by bets. &quot;Market price&quot; is the price stored with the ranking at the time it was recorded. {data.meta.excluded.total} tips since results began could not be settled and are not counted here: {data.meta.excluded.abandoned} abandoned meetings, {data.meta.excluded.scratched} scratchings, {data.meta.excluded.no_result} with no result recorded. Today&apos;s races that haven&apos;t run yet aren&apos;t counted as excluded -- they&apos;re simply not settled yet.
              <div style={{ marginTop: 10 }}>Past results do not predict future results. Gamble responsibly. Gambling Help 1800 858 858.</div>
            </div>
          </>
        )}

        <div><Link href="/results" style={{ color: MUT, fontSize: 12 }}>← Back to Results</Link></div>
      </div>
    </main>
  );
}
