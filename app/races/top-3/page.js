'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import UpgradeModal from '@/components/UpgradeModal';
import PuntersEdgeCredit from '@/components/PuntersEdgeCredit';
import useIsMobile from '@/hooks/useIsMobile';
import usePlan from '@/hooks/usePlan';
import { hasFeature } from '@/lib/planFeatures';
import { formatRacingOdds } from '@/lib/scoring';

// Top 3 at a glance -- every race today with its top 3 runners by model
// score (lib/topThree.js via /api/top-three, the same ranking as the
// Races page). Pro only, like the scores themselves.

// 1st gold, 2nd grey, 3rd copper -- same tones as the Today page's places.
const PLACE = [
  { bg: '#fbbf24', color: '#78350f' },
  { bg: '#d1d5db', color: '#374151' },
  { bg: '#fed7aa', color: '#92400e' },
];
const TC_LABELS = { good: 'Good', soft: 'Soft', heavy: 'Heavy', synthetic: 'Synth' };
const POLL_MS = 60 * 1000;

function countdown(jumpAt, now) {
  if (!jumpAt) return { text: '—' };
  const s = Math.round((Date.parse(jumpAt) - now) / 1000);
  if (s <= 0) return { text: 'Jumped', jumped: true };
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const text = h ? `${h}h ${String(m).padStart(2, '0')}m` : m >= 10 ? `${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
  return { text, urgent: s < 600 };
}

function localTime(jumpAt) {
  return jumpAt ? new Date(jumpAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : '';
}

const price = p => (p ? `$${formatRacingOdds(p)}` : '—');

function NumTile({ tab, place, size = 30, muted = false }) {
  const c = PLACE[place] || PLACE[2];
  return (
    <span
      title={place != null ? `${place + 1}${['st', 'nd', 'rd'][place]} by model score` : undefined}
      style={{
        width: size, height: size, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size >= 30 ? 14 : 12, fontWeight: 800, flexShrink: 0,
        background: muted ? '#e5e7eb' : c.bg, color: muted ? '#6b7280' : c.color,
      }}
    >
      {tab ?? '?'}
    </span>
  );
}

function ValueBadge({ pct }) {
  if (pct == null) return null;
  return (
    <span title="Market price above the model's price" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#059669', color: '#fff', whiteSpace: 'nowrap' }}>
      ▲+{pct}%
    </span>
  );
}

function Countdown({ race, now }) {
  const cd = countdown(race.jumpAt, now);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cd.urgent ? '#dc2626' : cd.jumped ? '#9ca3af' : '#111827' }}>{cd.text}</span>
      <span style={{ fontSize: 9, color: '#9ca3af' }}>{localTime(race.jumpAt)}</span>
    </div>
  );
}

const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd' };

// One of our top 3 on a finished race, ringed with where it actually
// finished when that was 1st-3rd.
function MarkedTile({ r, place, size }) {
  const placed = ORDINAL[r.finishPos];
  return (
    <span title={placed ? `Finished ${placed}` : 'Not in the first 3'} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ display: 'inline-flex', borderRadius: 8, boxShadow: placed ? '0 0 0 2px #fff, 0 0 0 4px #00471b' : 'none', opacity: placed ? 1 : 0.5 }}>
        <NumTile tab={r.tab} place={place} size={size} />
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: placed ? '#00471b' : '#9ca3af' }}>{placed || '–'}</span>
    </span>
  );
}

function MarkedTiles({ race, size }) {
  if (!race.top.length) return null;
  return <span style={{ display: 'flex', gap: 8 }}>{race.top.map((r, i) => <MarkedTile key={i} r={r} place={i} size={size} />)}</span>;
}

function ClosedNote({ race, small }) {
  if (race.status === 'abandoned') return <span style={{ fontSize: 11, color: '#9ca3af' }}>Abandoned</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
      Winner
      {race.winners.map((w, i) => <NumTile key={i} tab={w.tab} muted size={small ? 22 : 24} />)}
    </span>
  );
}

function DayTapeRow({ race, now, isMobile, onOpen }) {
  const closed = race.status !== 'upcoming';
  const pick = race.top[0];
  const label = <span style={{ fontSize: 12, fontWeight: 700, color: closed ? '#9ca3af' : '#111827', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{race.venue} R{race.raceNum}</span>;
  return (
    <button
      onClick={() => onOpen(race)}
      className="hover:bg-gray-50"
      style={{
        display: 'grid', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #eef0f3', cursor: 'pointer',
        background: closed ? '#fafafa' : '#fff', padding: closed ? '6px 12px' : '8px 12px', alignItems: 'center', columnGap: 12, rowGap: 4,
        gridTemplateColumns: isMobile ? '58px minmax(0,1fr) auto' : '70px minmax(120px,1fr) auto minmax(150px,220px)',
      }}
    >
      {closed ? (
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{race.status === 'finished' ? 'Resulted' : '—'}</span>
      ) : <Countdown race={race} now={now} />}
      {label}
      {closed ? (
        isMobile ? (
          <>
            <span style={{ justifySelf: 'end' }}><ClosedNote race={race} small /></span>
            {race.status === 'finished' && race.top.length > 0 && <span style={{ gridColumn: '2 / -1' }}><MarkedTiles race={race} size={24} /></span>}
          </>
        ) : (
          <>
            {race.status === 'finished' ? <MarkedTiles race={race} size={26} /> : <span />}
            <span style={{ justifySelf: 'end' }}><ClosedNote race={race} /></span>
          </>
        )
      ) : (
        <>
          <span style={{ display: 'flex', gap: 5 }}>
            {race.top.length ? race.top.map((r, i) => <NumTile key={i} tab={r.tab} place={i} size={isMobile ? 26 : 30} />) : <span style={{ fontSize: 10, color: '#9ca3af' }}>Not ranked</span>}
          </span>
          {pick && (
            <span style={{ gridColumn: isMobile ? '2 / -1' : 'auto', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'flex-end', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{price(pick.price)}</span>
            </span>
          )}
        </>
      )}
    </button>
  );
}

function RunnerCell({ r, place }) {
  if (!r) return <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <NumTile tab={r.tab} place={place} size={26} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6b7280', fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
          <span>Score {r.score?.toFixed(1) ?? '—'}</span>
          <span>{price(r.price)}</span>
          <ValueBadge pct={r.valuePct} />
        </div>
      </div>
    </div>
  );
}

function FinishedCell({ r, place }) {
  if (!r) return <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>;
  const placed = ORDINAL[r.finishPos];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <MarkedTile r={r} place={place} size={22} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
        <div style={{ fontSize: 10, color: placed ? '#00471b' : '#9ca3af', fontWeight: placed ? 700 : 400 }}>{placed ? `Finished ${placed}` : 'Not in the first 3'}</div>
      </div>
    </div>
  );
}

function MeetingGrid({ races, now, isMobile, onOpen }) {
  const head = { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 12px', textAlign: 'left' };
  if (isMobile) {
    return (
      <div>
        {races.map(race => (
          <button key={race.key} onClick={() => onOpen(race)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #eef0f3', background: race.status === 'upcoming' ? '#fff' : '#fafafa', padding: '8px 12px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: race.status === 'upcoming' ? 6 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: race.status === 'upcoming' ? '#111827' : '#9ca3af' }}>R{race.raceNum}</span>
              {race.status === 'upcoming' ? <Countdown race={race} now={now} /> : <ClosedNote race={race} small />}
            </div>
            {race.status === 'upcoming' && (
              <div style={{ display: 'grid', gap: 6 }}>
                {[0, 1, 2].map(i => <RunnerCell key={i} r={race.top[i]} place={i} />)}
              </div>
            )}
            {race.status === 'finished' && race.top.length > 0 && (
              <div style={{ marginTop: 6 }}><MarkedTiles race={race} size={24} /></div>
            )}
          </button>
        ))}
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup><col style={{ width: 110 }} /><col /><col /><col /></colgroup>
      <thead>
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <th style={head}>Race</th><th style={head}>1st</th><th style={head}>2nd</th><th style={head}>3rd</th>
        </tr>
      </thead>
      <tbody>
        {races.map(race => (
          <tr key={race.key} onClick={() => onOpen(race)} className="hover:bg-gray-50" style={{ cursor: 'pointer', borderBottom: '1px solid #eef0f3', background: race.status === 'upcoming' ? undefined : '#fafafa' }}>
            <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: race.status === 'upcoming' ? '#111827' : '#9ca3af' }}>R{race.raceNum}</div>
              {race.status === 'upcoming' && <Countdown race={race} now={now} />}
              {race.status === 'finished' && race.top.length > 0 && <div style={{ marginTop: 3 }}><ClosedNote race={race} small /></div>}
            </td>
            {race.status === 'upcoming'
              ? [0, 1, 2].map(i => <td key={i} style={{ padding: '8px 12px', verticalAlign: 'middle' }}><RunnerCell r={race.top[i]} place={i} /></td>)
              : race.status === 'finished' && race.top.length
                ? [0, 1, 2].map(i => <td key={i} style={{ padding: '6px 12px', verticalAlign: 'middle' }}><FinishedCell r={race.top[i]} place={i} /></td>)
                : <td colSpan={3} style={{ padding: '6px 12px' }}><ClosedNote race={race} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', background: active ? '#00471b' : 'transparent', color: active ? '#fff' : '#374151' }}>
      {children}
    </button>
  );
}

function ProPrompt() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 28px', textAlign: 'center', maxWidth: 320, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 8 }}>Top 3 at a glance is a Pro feature</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>Every race today with its top 3 by model score, in one list.</div>
        <button onClick={() => setUpgradeOpen(true)} style={{ background: '#00471b', color: '#fff', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', width: '100%' }}>Start free trial</button>
      </div>
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}

export default function TopThreePage() {
  const router = useRouter();
  const { isLoaded } = useUser();
  const plan = usePlan();
  const isPro = hasFeature(plan, 'full_scores');
  const isMobile = useIsMobile();
  const [view, setView] = useState('tape');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | pro | error
  const [meeting, setMeeting] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Polls once a minute while the tab is visible; paused while hidden and
  // refreshed as soon as it's visible again; stops once every race has a
  // result. A failed refresh keeps the last data on screen.
  const [refreshFailed, setRefreshFailed] = useState(false);
  const allDoneRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isPro) return;
    let cancelled = false;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch('/api/top-three', { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 403) { setStatus('pro'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        allDoneRef.current = json.races.length > 0 && json.races.every(r => r.status !== 'upcoming');
        setData(json);
        setStatus('ok');
        setRefreshFailed(false);
      } catch {
        if (cancelled) return;
        setRefreshFailed(true);
        setStatus(st => (st === 'ok' ? st : 'error'));
      }
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      stop();
      if (document.visibilityState !== 'visible' || allDoneRef.current) return;
      timer = setInterval(() => { if (allDoneRef.current) stop(); else load(); }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') { stop(); return; }
      if (!allDoneRef.current) load();
      start();
    };
    load().then(() => { if (!cancelled) start(); });
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [isLoaded, isPro]);

  const races = useMemo(() => data?.races || [], [data]);
  const meetings = useMemo(() => data?.meetings || [], [data]);
  // Until a tab is picked: the meeting with the next race to jump.
  const nextVenue = races.find(r => r.status === 'upcoming' && r.jumpAt && Date.parse(r.jumpAt) > now)?.venue;
  const activeMeeting = meeting && meetings.some(m => m.venue === meeting) ? meeting : nextVenue || meetings[0]?.venue;
  const meetingRaces = useMemo(
    () => races.filter(r => r.venue === activeMeeting).sort((a, b) => a.raceNum - b.raceNum),
    [races, activeMeeting],
  );
  // Day tape: races still to jump first (soonest first), then ones that
  // have jumped and are waiting on a result, then finished and abandoned.
  const jumped = r => r.jumpAt && Date.parse(r.jumpAt) <= now;
  // keep the selected meeting tab visible in the phone's swipeable row
  useEffect(() => {
    if (view !== 'meeting' || !isMobile) return;
    const el = document.querySelector('[data-active-meeting="true"]');
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = el.offsetLeft - row.offsetLeft - 8;
  }, [view, isMobile, activeMeeting]);
  const tape = [
    ...races.filter(r => r.status === 'upcoming' && !jumped(r)),
    ...races.filter(r => r.status === 'upcoming' && jumped(r)),
    ...races.filter(r => r.status !== 'upcoming'),
  ];

  const openRace = race => router.push(`/races?select=${encodeURIComponent(race.key)}`);
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Brisbane' });
  const showPro = isLoaded && (!isPro || status === 'pro');

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#f8fafc' }}>
        <div style={{ padding: isMobile ? '12px 12px' : '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Top 3 at a glance</h1>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Top 3 by model score · {dateStr}</div>
              {data?.generatedAt && !showPro && (
                <div data-testid="updated" style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                  Updated {new Date(data.generatedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toUpperCase()}
                  {races.length > 0 && races.every(r => r.status !== 'upcoming') ? ' · all races resulted' : refreshFailed ? ' · retrying' : ''}
                </div>
              )}
            </div>
            {!showPro && (
              <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 2 }}>
                <ToggleBtn active={view === 'tape'} onClick={() => setView('tape')}>Day tape</ToggleBtn>
                <ToggleBtn active={view === 'meeting'} onClick={() => setView('meeting')}>By meeting</ToggleBtn>
              </div>
            )}
          </div>

          {showPro ? <ProPrompt /> : !isLoaded || status === 'loading' ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Loading…</div>
          ) : status === 'error' ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Couldn&apos;t load today&apos;s races. It will retry shortly.</div>
          ) : !races.length ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Today&apos;s meetings will appear here shortly.</div>
          ) : (
            <>
              <PuntersEdgeCredit style={{ marginBottom: 8 }} />
              {view === 'meeting' && (
                // Phones: one swipeable row (its own scroll, not the page's).
                <div style={{ display: 'flex', flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', gap: 6, marginBottom: 8, paddingBottom: isMobile ? 4 : 0 }}>
                  {meetings.map(m => (
                    <button
                      key={m.venue}
                      data-active-meeting={m.venue === activeMeeting}
                      onClick={() => setMeeting(m.venue)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap',
                        border: `1px solid ${m.venue === activeMeeting ? '#00471b' : '#e5e7eb'}`,
                        background: m.venue === activeMeeting ? '#00471b' : '#fff', color: m.venue === activeMeeting ? '#fff' : '#374151',
                      }}
                    >
                      {m.venue}
                      <span style={{ fontWeight: 500, marginLeft: 6, opacity: 0.75, textTransform: 'none' }}>
                        {m.abandoned ? 'Abandoned' : m.trackCondLabel || TC_LABELS[m.trackCond] || 'Not yet rated'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                {view === 'tape'
                  ? tape.map(r => <DayTapeRow key={r.key} race={r} now={now} isMobile={isMobile} onOpen={openRace} />)
                  : <MeetingGrid races={meetingRaces} now={now} isMobile={isMobile} onOpen={openRace} />}
              </div>
              <p style={{ fontSize: 10, color: '#6b7280', marginTop: 10, lineHeight: 1.5 }}>
                Ranked by model score with each meeting&apos;s official track condition, after scratchings. Prices are the best live price across bookmakers.
                Data and analytics only. We don&apos;t take bets.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
