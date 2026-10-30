'use client';

import { useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import { C, Chip, NoData, ToggleButton, fmtDay } from '@/components/admin/AdminUi';

// Status always shown as symbol + word, never colour alone.
export const HEALTH = {
  red:       { bg: '#fee2e2', color: '#991b1b', label: '✕ Problem', rank: 0 },
  amber:     { bg: '#fef3c7', color: '#92400e', label: '! Warning', rank: 1 },
  green:     { bg: '#dcfce7', color: '#166534', label: '✓ OK',      rank: 2 },
  abandoned: { bg: '#f3f4f6', color: '#374151', label: 'Abandoned', rank: 3 },
};

export function HealthChip({ status }) {
  const s = HEALTH[status];
  return s ? <Chip bg={s.bg} color={s.color}>{s.label}</Chip> : <span style={{ color: C.faint }}>—</span>;
}

// Times shown in AEST (Brisbane), with the day only when it isn't the racing date.
function fmtTime(iso, date) {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
  const t = d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit' });
  return day === date ? t : `${fmtDay(day)} ${t}`;
}

export default function DataHealthPanel({ initial, dates }) {
  const [date, setDate] = useState(initial?.date || dates[0]);
  const [health, setHealth] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (date === initial?.date) { setHealth(initial); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/admin/data-health?date=${date}`)
      .then(async r => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; })
      .then(j => { if (!cancelled) setHealth(j); })
      .catch(e => { if (!cancelled) { setHealth(null); setError(e.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, initial]);

  const picker = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {dates.map((d, i) => (
        <ToggleButton key={d} active={d === date} onClick={() => setDate(d)}>{i === 0 ? 'Today' : fmtDay(d)}</ToggleButton>
      ))}
    </div>
  );

  if (loading) return <div>{picker}<NoData>Loading {fmtDay(date)}…</NoData></div>;
  if (error || !health?.ok) return <div>{picker}<NoData>Could not load data health: {error || health?.error || 'unknown error'}</NoData></div>;

  const { meetings, global, overall, counts } = health;
  const overdueRaces = meetings.flatMap(m => m.races.filter(r => r.overdue).map(r => ({ ...r, venue: m.venue, key: `${m.venue}-${r.raceNum}` })));

  const meetingCols = [
    { key: 'status', label: 'Status', sort: r => HEALTH[r.status].rank, render: r => <HealthChip status={r.status} />, csv: r => r.status },
    { key: 'venue', label: 'Venue', render: r => <b>{r.venue}</b> },
    { key: 'state', label: 'State' },
    { key: 'raceCount', label: 'Races', align: 'right' },
    { key: 'cardRaces', label: 'Cards', align: 'right', render: r => `${r.cardRaces}/${r.raceCount}`, csv: r => r.cardRaces },
    { key: 'resultedJumped', label: 'Results (jumped)', align: 'right', render: r => `${r.resultedJumped}/${r.jumpedCount}`, csv: r => `${r.resultedJumped}/${r.jumpedCount}` },
    { key: 'overdueCount', label: 'Overdue', align: 'right', render: r => (r.overdueCount ? <b style={{ color: '#991b1b' }}>{r.overdueCount}</b> : 0) },
    { key: 'trackCondition', label: 'Track', render: r => r.trackCondition || <span style={{ color: '#92400e' }}>missing</span>, csv: r => r.trackCondition || '' },
    { key: 'scratchings', label: 'Scratchings', align: 'right' },
    { key: 'scraperErrors', label: 'Scraper errors', align: 'right', render: r => (r.scraperErrors ? <span title={r.lastScraperMsg || ''}>{r.scraperErrors}</span> : 0) },
    { key: 'cardsUpdated', label: 'Cards updated', render: r => fmtTime(r.cardsUpdated, health.date), csv: r => r.cardsUpdated || '' },
    { key: 'lastResult', label: 'Last result', render: r => fmtTime(r.lastResult, health.date), csv: r => r.lastResult || '' },
    { key: 'lastScratching', label: 'Last scratching', render: r => fmtTime(r.lastScratching, health.date), csv: r => r.lastScratching || '' },
    { key: 'flags', label: 'Flags', sort: r => r.flags.length, render: r => (r.flags.length ? <span style={{ whiteSpace: 'normal', display: 'inline-block', minWidth: 220, color: C.ink2 }}>{r.flags.join(' · ')}</span> : <span style={{ color: C.faint }}>—</span>), csv: r => r.flags.join(' | ') },
  ];
  const overdueCols = [
    { key: 'venue', label: 'Venue', render: r => <b>{r.venue}</b> },
    { key: 'raceNum', label: 'Race', align: 'right', render: r => `R${r.raceNum}` },
    { key: 'jump', label: 'Jump (AEST)', render: r => fmtTime(r.jump, health.date), csv: r => r.jump || '' },
    { key: 'minsSinceJump', label: 'Min since jump', align: 'right', render: r => r.minsSinceJump ?? '—' },
    { key: 'hasCard', label: 'Card', render: r => (r.hasCard ? 'yes' : 'no') },
  ];

  return (
    <div>
      {picker}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: overall ? HEALTH[overall].bg : C.soft, marginBottom: 10 }}>
        {overall ? <HealthChip status={overall} /> : <Chip bg="#f3f4f6" color={C.ink2}>No meetings</Chip>}
        <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
          {fmtDay(health.date)}: {meetings.length} meeting{meetings.length === 1 ? '' : 's'} · {counts.red} problem · {counts.amber} warning · {counts.green} OK{counts.abandoned ? ` · ${counts.abandoned} abandoned` : ''}
        </span>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>Checked {fmtTime(health.generatedAt, health.date)} AEST</span>
      </div>
      {global.map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: C.ink, marginBottom: 6 }}>
          <HealthChip status={g.status} /><span>{g.text}</span>
        </div>
      ))}

      {meetings.length ? (
        <div style={{ marginTop: 10 }}>
          <DataTable columns={meetingCols} rows={meetings.map(m => ({ ...m, key: m.venue }))} initialSort="status" initialDir="asc" csvName={`data-health-${health.date}`} />
        </div>
      ) : <NoData>No meetings in today_meetings, race_schedule, race_cards or race_results for {fmtDay(health.date)}.</NoData>}

      <h3 style={{ fontSize: 13, fontWeight: 800, color: C.ink, margin: '16px 0 8px' }}>Overdue results ({overdueRaces.length})</h3>
      {overdueRaces.length ? (
        <DataTable columns={overdueCols} rows={overdueRaces} initialSort="minsSinceJump" csvName={`overdue-results-${health.date}`} maxHeight={300} />
      ) : <NoData>No jumped race is missing a result after 45 minutes.</NoData>}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
        Venues grouped with normaliseVenue (so e.g. PAKENHAM and PAKENHAM SYNTHETIC rows count as one meeting). Jump times are race_schedule post_time (Sydney clock) shown in AEST.
      </div>
    </div>
  );
}
