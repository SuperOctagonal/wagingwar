'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import ProfileRail from '@/components/ProfileRail';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sb(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return null;
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

const TAG_STYLES = {
  'Watch':     { bg: '#dcfce7', color: '#166534' },
  'Wet track': { bg: '#fef3c7', color: '#92400e' },
  'Value':     { bg: '#eff6ff', color: '#1e40af' },
  'Big run':   { bg: '#fce7f3', color: '#9d174d' },
  'Avoid':     { bg: '#fef2f2', color: '#dc2626' },
};
const ALL_TAGS = Object.keys(TAG_STYLES);

function normName(name) {
  return (name || '').replace(/\s*\([A-Z]{2,3}\)\s*$/i, '').trim().toUpperCase();
}

function parseCSVHorses(csvText) {
  if (!csvText) return [];
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const horseIdx = headers.findIndex(h => h === 'horse' || h === 'horse name' || h === 'horsename' || h.includes('horse'));
  if (horseIdx < 0) return [];
  const horses = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = (cols[horseIdx] || '').trim().replace(/"/g, '');
    if (name) horses.push(normName(name));
  }
  return horses;
}

function parseCSVRaces(csvText) {
  if (!csvText) return {};
  const lines = csvText.split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const idx = key => headers.findIndex(h => h.includes(key));
  const horseIdx = headers.findIndex(h => h === 'horse' || h === 'horse name' || h.includes('horse'));
  const venueIdx = idx('venue') !== -1 ? idx('venue') : idx('track');
  const raceIdx  = headers.findIndex(h => h.includes('race') && (h.includes('num') || h.includes('no')));
  const distIdx  = idx('dist');
  const clsIdx   = headers.findIndex(h => h === 'class' || h === 'cls' || h.includes('class'));
  const timeIdx  = idx('time');
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = (cols[horseIdx] || '').trim().replace(/"/g, '');
    if (!name) continue;
    map[normName(name)] = {
      venue:   (cols[venueIdx]  || '').trim().replace(/"/g, ''),
      raceNum: (cols[raceIdx]   || '').trim().replace(/"/g, ''),
      dist:    (cols[distIdx]   || '').trim().replace(/"/g, ''),
      cls:     (cols[clsIdx]    || '').trim().replace(/"/g, ''),
      time:    (cols[timeIdx]   || '').trim().replace(/"/g, ''),
    };
  }
  return map;
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

const STAR_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e', 5: '#f59e0b' };

function Stars({ value, onChange, readOnly }) {
  const fillColor = STAR_COLORS[value] || '#d1d5db';
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => !readOnly && onChange && onChange(n === value ? 0 : n)}
          style={{ fontSize: 16, color: n <= (value || 0) ? fillColor : '#d1d5db', cursor: readOnly ? 'default' : 'pointer', lineHeight: 1 }}>
          ★
        </span>
      ))}
    </div>
  );
}

function TagPill({ tag, selected, onClick }) {
  const s = TAG_STYLES[tag] || {};
  return (
    <span onClick={onClick} style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: selected ? s.bg : '#f3f4f6',
      color: selected ? s.color : '#6b7280',
      border: `1px solid ${selected ? s.color + '40' : '#e5e7eb'}`,
      cursor: 'pointer', userSelect: 'none',
    }}>{tag}</span>
  );
}

// Collapsible accordion panel for mobile sidebar
function Accordion({ title, titleStyle, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden', marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: titleStyle?.background || '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: titleStyle?.color || '#111827', minHeight: 44 }}
      >
        {title}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 14, color: titleStyle?.color ? 'rgba(255,255,255,0.7)' : '#9ca3af', flexShrink: 0 }} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function EditModal({ horse, onClose, onSave }) {
  const [editNote, setEditNote] = useState(horse.note || '');
  const [tags,     setTags]     = useState(horse.tags || []);
  const [priority, setPriority] = useState(horse.priority || 0);
  const [saving,   setSaving]   = useState(false);

  const toggleTag = t => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSave = async () => {
    setSaving(true);
    await sb(`blackbook?id=eq.${horse.id}`, {
      method: 'PATCH',
      body: { note: editNote, tags, priority, updated_at: new Date().toISOString() },
    });
    setSaving(false);
    onSave({ ...horse, note: editNote, tags, priority });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: 400, maxWidth: '95vw', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#00471b', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Edit blackbook entry</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Horse</label>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>{horse.horse_name}</div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Note</label>
            <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3} placeholder="Add a note…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALL_TAGS.map(t => <TagPill key={t} tag={t} selected={tags.includes(t)} onClick={() => toggleTag(t)} />)}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Priority</label>
            <Stars value={priority} onChange={setPriority} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '7px 16px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', border: 'none', borderRadius: 6, background: '#00471b', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportCSV(horses) {
  const header = 'horse_name,note,tags,priority,added_at';
  const rows = horses.map(h => [
    `"${(h.horse_name || '').replace(/"/g, '""')}"`,
    `"${(h.note || '').replace(/"/g, '""')}"`,
    `"${(h.tags || []).join('|')}"`,
    h.priority || 0,
    h.added_at || '',
  ].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'blackbook.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function BlackbookPage() {
  const { user, isLoaded } = useUser();
  const userId = user?.id || null;
  const isPro = useIsPro();
  const isMobile = useIsMobile();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [horses,      setHorses]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editHorse,   setEditHorse]   = useState(null);
  const [sortBy,      setSortBy]      = useState('date');
  const [tagFilter,   setTagFilter]   = useState('all');
  const [csvNames,    setCsvNames]    = useState([]);
  const [csvRaces,    setCsvRaces]    = useState({});
  const [winBanners,  setWinBanners]  = useState([]);
  const [mostWatched, setMostWatched] = useState([]);

  useEffect(() => {
    const csv = localStorage.getItem('ww_csv');
    if (!csv) return;
    setCsvNames(parseCSVHorses(csv));
    setCsvRaces(parseCSVRaces(csv));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { setLoading(false); return; }
    sb(`blackbook?clerk_id=eq.${userId}&order=added_at.desc`).then(r => {
      setHorses(r || []);
      setLoading(false);
    });
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded || !userId || horses.length === 0) return;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceDate = since.toISOString().slice(0, 10);
    sb(`race_results?finish_pos=eq.1&date=gte.${sinceDate}&select=horse_name,venue,date`).then(winners => {
      if (!winners || winners.length === 0) return;
      const winnerMap = {};
      winners.forEach(w => {
        const key = (w.horse_name || '').toUpperCase();
        if (!winnerMap[key]) winnerMap[key] = [];
        winnerMap[key].push(w);
      });
      const newBanners = [];
      horses.forEach(h => {
        const norm = (h.horse_name || '').toUpperCase();
        if (!winnerMap[norm]) return;
        const notified = h.notified_wins || [];
        winnerMap[norm].forEach(win => {
          const nkey = `${win.venue}|${win.date}`;
          if (!notified.includes(nkey)) newBanners.push({ horse: h.horse_name, venue: win.venue, date: win.date, rowId: h.id, nkey });
        });
      });
      if (newBanners.length === 0) return;
      setWinBanners(newBanners);
      newBanners.forEach(async b => {
        const row = horses.find(h => h.id === b.rowId);
        const newNotified = [...(row?.notified_wins || []), b.nkey];
        await sb(`blackbook?id=eq.${b.rowId}`, { method: 'PATCH', body: { notified_wins: newNotified } });
        if (userId) awardPoints(userId, 'blackbook_win', b.horse).catch(() => {});
      });
    });
  }, [horses, userId, isLoaded]);

  useEffect(() => {
    sb('blackbook?select=horse_name').then(all => {
      if (!all) return;
      const counts = {};
      all.forEach(row => { const n = row.horse_name; if (n) counts[n] = (counts[n] || 0) + 1; });
      setMostWatched(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10));
    });
  }, []);

  const handleRemove = useCallback(async (id) => {
    if (!confirm('Remove from blackbook?')) return;
    await sb(`blackbook?id=eq.${id}`, { method: 'DELETE' });
    setHorses(prev => prev.filter(h => h.id !== id));
  }, []);

  const handleSaved = useCallback((updated) => {
    setHorses(prev => prev.map(h => h.id === updated.id ? updated : h));
  }, []);

  const displayed = horses
    .filter(h => tagFilter === 'all' || (h.tags || []).includes(tagFilter))
    .sort((a, b) => {
      if (sortBy === 'alpha')    return (a.horse_name || '').localeCompare(b.horse_name || '');
      if (sortBy === 'priority') return (b.priority || 0) - (a.priority || 0);
      return 0;
    });

  const runningToday = horses.filter(h => csvNames.includes(normName(h.horse_name)));

  const stats = {
    total:        horses.length,
    runningToday: runningToday.length,
    withNotes:    horses.filter(h => h.note).length,
    threeStar:    horses.filter(h => (h.priority || 0) >= 3).length,
  };

  // ── Sidebar panel contents (shared between mobile accordion and desktop sidebar) ──

  const RunningTodayContent = (
    <>
      {runningToday.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: '#9ca3af' }}>
          {horses.length === 0 ? 'Add horses to your blackbook.' : 'No blackbook horses in the current CSV.'}
        </div>
      ) : runningToday.map(h => {
        const info = csvRaces[normName(h.horse_name)];
        const selectKey = info?.venue && info?.raceNum ? `${info.venue.toUpperCase()}||${info.raceNum}` : null;
        return (
          <div key={h.id} style={{ padding: '8px 12px', borderTop: '0.5px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 3 }}>{h.horse_name}</div>
            {info && (info.venue || info.raceNum) && (
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
                {[info.venue, info.raceNum && `R${info.raceNum}`, info.dist && `${info.dist}m`].filter(Boolean).join(' · ')}
              </div>
            )}
            {selectKey && (
              <a href={`/races?select=${encodeURIComponent(selectKey)}`}
                style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 5, background: '#00471b', color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                View race
              </a>
            )}
          </div>
        );
      })}
    </>
  );

  const StatsContent = (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Total horses',  val: stats.total },
          { label: 'Running today', val: stats.runningToday },
          { label: 'With notes',    val: stats.withNotes },
          { label: 'High priority', val: stats.threeStar },
        ].map(s => (
          <div key={s.label} style={{ background: '#f9fafb', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{s.val}</div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const PointsContent = (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 11, color: '#065f46', lineHeight: 1.7 }}>
        Blackbook horse wins → <strong>+20 pts</strong><br />
        Adding a horse → <strong>+2 pts</strong>
      </div>
    </div>
  );

  const MostWatchedContent = mostWatched.length > 0 ? (
    <>
      {mostWatched.map(([name, count], i) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '0.5px solid #f3f4f6' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', width: 16, flexShrink: 0 }}>{i + 1}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>{count} {count === 1 ? 'watcher' : 'watchers'}</span>
        </div>
      ))}
    </>
  ) : null;

  if (isPro === false) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProfileRail />
        <main className="mob-page" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <i className="ti ti-lock" style={{ fontSize: 48, color: '#d1d5db', display: 'block', marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Blackbook is a Pro feature</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Track your horses, get win notifications and never miss a run.</div>
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
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Win banners */}
          {winBanners.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🏆</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>{b.horse} won at {b.venue}! <span style={{ color: '#059669' }}>+20 pts added.</span></span>
              <button onClick={() => setWinBanners(prev => prev.filter((_, j) => j !== i))} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}>✕</button>
            </div>
          ))}

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Blackbook</h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>{horses.length} horses</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : undefined }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', minHeight: 36 }}>
                <option value="date">Date added</option>
                <option value="priority">Priority</option>
                <option value="alpha">A–Z</option>
              </select>
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', minHeight: 36 }}>
                <option value="all">All tags</option>
                {ALL_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                onClick={() => exportCSV(horses)}
                style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151', minHeight: 36, width: isMobile ? '100%' : undefined }}
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Mobile: right-rail panels as accordions above the horse list */}
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <Accordion title="Running today" titleStyle={{ background: '#00471b', color: '#fff' }}>
                {RunningTodayContent}
              </Accordion>
              <Accordion title="Stats">
                {StatsContent}
              </Accordion>
              <Accordion title="🎯 Points">
                {PointsContent}
              </Accordion>
              {mostWatched.length > 0 && (
                <Accordion title="Most Watched" titleStyle={{ background: '#1e2936', color: '#fff' }}>
                  {MostWatchedContent}
                </Accordion>
              )}
            </div>
          )}

          {/* Main grid: on mobile single column, desktop two-column */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 260px', gap: 12 }}>

            {/* Horse list */}
            <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Loading…</div>
              ) : !userId ? (
                <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Sign in to see your blackbook.</div>
              ) : displayed.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 14 }}>📖</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No horses yet</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Add horses from the Races page using the ♥ Blackbook button.</div>
                </div>
              ) : displayed.map((h, i) => {
                const norm = normName(h.horse_name);
                const isRunning = csvNames.includes(norm);
                const info = csvRaces[norm];
                const isLast = i === displayed.length - 1;

                if (isMobile) {
                  // Mobile card: 4-line layout
                  return (
                    <div key={h.id} style={{
                      padding: '12px 14px',
                      borderBottom: isLast ? 'none' : `0.5px solid ${isRunning ? '#86efac' : '#e5e7eb'}`,
                      background: isRunning ? '#f0fdf4' : '#fff',
                    }}>
                      {/* Line 1: running badge + horse name + tags */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        {isRunning && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#00471b', color: '#fff', flexShrink: 0 }}>RUNNING TODAY</span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{h.horse_name}</span>
                        {(h.tags || []).map(t => {
                          const s = TAG_STYLES[t] || {};
                          return <span key={t} style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: s.bg, color: s.color }}>{t}</span>;
                        })}
                      </div>

                      {/* Line 2: note */}
                      {h.note && (
                        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginBottom: 4 }}>{h.note}</div>
                      )}

                      {/* Line 3: venue/date info */}
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>
                        {isRunning && info && (info.venue || info.raceNum)
                          ? [info.venue, info.raceNum && `R${info.raceNum}`, info.dist && `${info.dist}m`, info.cls, info.time].filter(Boolean).join(' · ')
                          : [h.venue, h.race_number && `R${h.race_number}`, h.distance && `${h.distance}m`, h['class'], fmtDate(h.added_at)].filter(Boolean).join(' · ')
                        }
                      </div>

                      {/* Line 4: stars + Edit + Remove */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Stars value={h.priority || 0} readOnly />
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditHorse(h)}
                            style={{ fontSize: 11, fontWeight: 600, padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151', minHeight: 36 }}>
                            Edit
                          </button>
                          <button onClick={() => handleRemove(h.id)}
                            style={{ fontSize: 11, fontWeight: 600, padding: '6px 14px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#dc2626', minHeight: 36 }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Desktop row
                return (
                  <div key={h.id} style={{
                    padding: '10px 16px',
                    borderBottom: isLast ? 'none' : `0.5px solid ${isRunning ? '#86efac' : '#e5e7eb'}`,
                    background: isRunning ? '#f0fdf4' : '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {isRunning && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#00471b', color: '#fff', flexShrink: 0 }}>RUNNING TODAY</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{h.horse_name}</span>
                      {(h.tags || []).map(t => {
                        const s = TAG_STYLES[t] || {};
                        return <span key={t} style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: s.bg, color: s.color }}>{t}</span>;
                      })}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Stars value={h.priority || 0} readOnly />
                        <button onClick={() => setEditHorse(h)}
                          style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                          Edit
                        </button>
                        <button onClick={() => handleRemove(h.id)}
                          style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#dc2626' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                    {isRunning && info && (info.venue || info.raceNum) && (
                      <div style={{ fontSize: 10, color: '#065f46', marginTop: 3 }}>
                        {[info.venue, info.raceNum && `R${info.raceNum}`, info.dist && `${info.dist}m`, info.cls, info.time].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {h.note && <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginTop: 3 }}>{h.note}</div>}
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                      {[h.venue, h.race_number && `R${h.race_number}`, h.distance && `${h.distance}m`, h['class'], fmtDate(h.added_at)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop sidebar — hidden on mobile (handled above as accordions) */}
            {!isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Running today */}
                <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ background: '#00471b', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#fff' }}>Running today</div>
                  {RunningTodayContent}
                </div>

                {/* Stats */}
                <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Stats</div>
                  {StatsContent}
                </div>

                {/* Points */}
                <div style={{ background: '#f0fdf4', borderRadius: 10, border: '1px solid #86efac', padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>🎯 Points</div>
                  {PointsContent}
                </div>

                {/* Most watched */}
                {mostWatched.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
                    <div style={{ background: '#1e2936', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#fff' }}>Most Watched</div>
                    {MostWatchedContent}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {editHorse && <EditModal horse={editHorse} onClose={() => setEditHorse(null)} onSave={handleSaved} />}
      </main>
    </div>
  );
}
