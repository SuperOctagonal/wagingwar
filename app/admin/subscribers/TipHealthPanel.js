'use client';

import { useMemo, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import { C, Chip, DateRange, NoData, ToggleButton, fmtDay } from '@/components/admin/AdminUi';
import { HealthChip } from './DataHealthPanel';

const REASON = {
  no_result: { bg: '#fee2e2', color: '#991b1b', label: 'No result' },
  scratched: { bg: '#f3f4f6', color: '#374151', label: 'Scratched' },
  abandoned: { bg: '#f3f4f6', color: '#374151', label: 'Abandoned' },
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const signed = (n, dp = 2) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(dp)}`);

function Block({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function TipHealthPanel({ tip }) {
  const [reason, setReason] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const rows = useMemo(() => (tip?.ok ? tip.overdue : [])
    .filter(o => reason === 'all' || o.reason === reason)
    .filter(o => (!range.from || o.date >= range.from) && (!range.to || o.date <= range.to)), [tip, reason, range]);

  if (!tip?.ok) return <NoData>Could not load Tip Record health: {tip?.error || 'unknown error'}</NoData>;
  const { record: rec, snapshot: snap, todayTips: t } = tip;

  const cols = [
    { key: 'date', label: 'Date', render: r => fmtDay(r.date), csv: r => r.date },
    { key: 'venue', label: 'Venue', render: r => <b>{r.venue}</b> },
    { key: 'raceNum', label: 'Race', align: 'right', render: r => `R${r.raceNum}` },
    { key: 'horse', label: 'Rank-1 tip' },
    { key: 'jump', label: 'Jump (AEST)', render: r => fmtTime(r.jump), csv: r => r.jump || '' },
    { key: 'hoursSinceJump', label: 'Hours since jump', align: 'right', render: r => r.hoursSinceJump ?? '—' },
    { key: 'reason', label: 'Why unsettled', render: r => <Chip {...REASON[r.reason]}>{REASON[r.reason].label}</Chip>, csv: r => r.reason },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10 }}>
        <HealthChip status={tip.status} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{tip.flags.length ? tip.flags.join(' · ') : 'No problems found.'}</span>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>Checked {fmtTime(tip.generatedAt)} AEST</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Block title="Record to date (rank-1, $1 at SP)">
          {rec.settled ? <>
            <b style={{ fontSize: 18 }}>{rec.settled.toLocaleString('en-AU')}</b> settled ({fmtDay(rec.from)} – {fmtDay(rec.to)})<br />
            {rec.wins} wins · strike rate <b>{rec.strikeRate.toFixed(1)}%</b><br />
            ROI <b style={{ color: rec.roi < 0 ? '#991b1b' : '#166534' }}>{signed(rec.roi, 1)}%</b> · {signed(rec.units)} units
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Dead-heat rule applied ({rec.deadHeatWins} dead-heat win{rec.deadHeatWins === 1 ? '' : 's'}: stake split). Public Tip Record headline currently shows {signed(rec.publicPageRoi, 1)}% (no split).
            </div>
          </> : 'No settled tips yet.'}
        </Block>
        <Block title={`Today (${fmtDay(tip.today)})`}>
          {t.races ? <>
            <b style={{ fontSize: 18 }}>{t.tips}</b> rank-1 tips for {t.races} races<br />
            {t.settled} settled · {t.tips - t.settled} pending<br />
            {t.jumpedNoTip.length ? <span style={{ color: '#92400e' }}>Jumped with no tip: {t.jumpedNoTip.join(', ')}</span> : 'Every jumped race has a tip.'}
          </> : 'No races scheduled today.'}
        </Block>
        <Block title="Snapshots (race_feature_snapshots)">
          Latest captured <b>{fmtTime(snap.latest)}</b>{snap.ageMin != null && <> ({snap.ageMin} min ago)</>}<br />
          <span style={{ color: C.muted, fontSize: 12 }}>{snap.latestRace}</span><br />
          {!snap.racingDay ? 'Not a racing day: freshness not checked.'
            : snap.inWindow ? (snap.stale ? <b style={{ color: '#991b1b' }}>Stale: older than 60 min during racing.</b> : 'Fresh (within 60 min, racing in progress).')
            : new Date(snap.windowOpen) > new Date(tip.generatedAt) ? `Racing window opens ${fmtTime(snap.windowOpen)} (1h before first race).`
            : `Racing finished (last race ${fmtTime(snap.windowClose)}); no further snapshots expected.`}
        </Block>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.ink, margin: 0 }}>
          Rank-1 tips unsettled 3h+ after the jump ({tip.overdue.length}: {tip.byReason.no_result} no result · {tip.byReason.scratched} scratched · {tip.byReason.abandoned} abandoned)
        </h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {['all', 'no_result', 'scratched', 'abandoned'].map(k => (
            <ToggleButton key={k} active={reason === k} onClick={() => setReason(k)}>{k === 'all' ? 'All' : REASON[k].label}</ToggleButton>
          ))}
          <DateRange from={range.from} to={range.to} onChange={setRange} presets={[7, 30]} max={tip.today} />
        </div>
      </div>
      {tip.overdue.length ? (
        <DataTable columns={cols} rows={rows} initialSort="date" csvName="tips-unsettled" maxHeight={360} emptyText="No unsettled tips match these filters." />
      ) : <NoData>Every rank-1 tip more than 3h past its jump is settled.</NoData>}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
        Status counts &quot;no result&quot; tips from the last 7 days; older ones stay listed. Scratched/abandoned tips are expected exclusions, not problems.
      </div>
    </div>
  );
}
