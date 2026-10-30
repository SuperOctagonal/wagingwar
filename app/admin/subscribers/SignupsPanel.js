'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import DataTable from '@/components/admin/DataTable';
import { C, DateRange, NoData, fmtDay } from '@/components/admin/AdminUi';

// Categorical slots 1-3 (validated: adjacent CVD ΔE 9.2, normal 27.6 on
// white) for the three plans; lapsed (cancelled + past due) is a neutral
// gray, not a fourth hue. Aqua is <3:1 on white, so a legend + the table
// below carry identity too.
// UNKNOWN (Stripe unreadable) is dark neutral ink, distinct from lapsed's
// light gray; series without any data in the loaded window are left out of
// the chart/legend, but each keeps its fixed colour (never re-assigned).
export const SERIES = [
  { key: 'FREE',    label: 'Free',   color: '#2a78d6' },
  { key: 'TRIAL',   label: 'Trial',  color: '#eb6834' },
  { key: 'PRO',     label: 'Pro',    color: '#1baf7a' },
  { key: 'LAPSED',  label: 'Cancelled / past due', color: '#9ca3af' },
  { key: 'UNKNOWN', label: 'Plan unknown', color: '#4b5563' },
];

const MARKER_DAY = '2026-10-27';

function SignupTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 4 }}>{fmtDay(label)} · {p.total} sign-up{p.total === 1 ? '' : 's'}</div>
      {payload.map(e => SERIES.find(s => s.key === e.dataKey)).filter(Boolean).map(s => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.ink2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
          {s.label}: <b style={{ color: C.ink }}>{p[s.key]}</b>
        </div>
      ))}
    </div>
  );
}

export default function SignupsPanel({ signups }) {
  const first = signups[0]?.date;
  const last = signups[signups.length - 1]?.date;
  const defaultFrom = signups[Math.max(0, signups.length - 90)]?.date;
  const [range, setRange] = useState({ from: defaultFrom, to: last });

  const all = useMemo(() => signups.map(d => ({ ...d, LAPSED: d.CANCELLED + d.PAST_DUE, UNKNOWN: d.UNKNOWN || 0 })), [signups]);
  // Series shown = those with any data in the whole loaded window (stable
  // while the date range changes).
  const shown = useMemo(() => SERIES.filter(s => all.some(d => d[s.key] > 0)), [all]);

  const data = useMemo(() => all
    .filter(d => (!range.from || d.date >= range.from) && (!range.to || d.date <= range.to)), [all, range]);

  const totals = useMemo(() => data.reduce((t, d) => {
    for (const s of SERIES) t[s.key] += d[s.key];
    t.total += d.total;
    return t;
  }, { FREE: 0, TRIAL: 0, PRO: 0, LAPSED: 0, UNKNOWN: 0, total: 0 }), [data]);

  const columns = [
    { key: 'date', label: 'Date (AEST)', render: r => fmtDay(r.date) },
    ...(shown.length ? shown : SERIES.slice(0, 3)).map(s => ({ key: s.key, label: s.label, align: 'right' })),
    { key: 'total', label: 'Total', align: 'right', render: r => <b>{r.total}</b> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.ink2 }}>
          <b style={{ fontSize: 18, color: C.ink }}>{totals.total}</b> sign-ups in range ·{' '}
          {shown.map((s, i) => <span key={s.key}>{i ? ' · ' : ''}{s.label} {totals[s.key]}</span>)}
        </div>
        <DateRange from={range.from} to={range.to} onChange={setRange} presets={[7, 30, 90, 120]} min={first} max={last} />
      </div>

      {totals.total === 0 ? <NoData>No sign-ups in this date range.</NoData> : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 22, right: 8, left: -18, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} />
              <Tooltip content={<SignupTooltip />} cursor={{ fill: 'rgba(17,24,39,0.06)' }} />
              <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: C.ink2 }} />
              {data.some(d => d.date === MARKER_DAY) && (
                <ReferenceLine x={MARKER_DAY} stroke={C.ink2} strokeDasharray="3 3" label={{ value: '27 Oct', position: 'top', fontSize: 11, fill: C.ink2 }} />
              )}
              {shown.map(s => (
                // White separator between stacked segments only when bars are
                // wide enough; at 90 bars on a phone the stroke would hide them.
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="plan" fill={s.color} stroke="#fff" strokeWidth={data.length <= 45 ? 1 : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.muted, margin: '6px 0 14px' }}>
        Plan is each user&apos;s current plan (Clerk + Stripe); plan at sign-up isn&apos;t recorded. Days are AEST.
      </div>

      <DataTable columns={columns} rows={data.map(d => ({ ...d, key: d.date }))} initialSort="date" csvName="signups-by-day" maxHeight={360} />
    </div>
  );
}
