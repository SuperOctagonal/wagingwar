'use client';
import { useState, useEffect, useMemo } from 'react';
import ProfileRail from '@/components/ProfileRail';
import { PUNTERSEDGE_BOOKMAKER_COLUMNS, bookmakerNameForSlug } from '@/lib/puntersedgeBookmakers';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sb(path) {
  if (!SURL || !SKEY) return [];
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function sydneyToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

export default function OddsPage() {
  const [rows, setRows] = useState([]);
  const [capturedAt, setCapturedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState('');
  const [raceNum, setRaceNum] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = sydneyToday();
      // odds_snapshot is append-only (one batch per ~15min poll) -- read only
      // the most recent batch's captured_at, not the whole day's history.
      const latest = await sb(
        `odds_snapshot?race_date=eq.${today}&select=captured_at&order=captured_at.desc&limit=1`,
      );
      const ts = latest[0]?.captured_at;
      if (!ts) {
        if (!cancelled) { setRows([]); setCapturedAt(null); setLoading(false); }
        return;
      }
      const snapshot = await sb(
        `odds_snapshot?race_date=eq.${today}&captured_at=eq.${encodeURIComponent(ts)}&select=race_venue,race_num,horse_name,bookmaker,price`,
      );
      if (!cancelled) {
        setRows(snapshot);
        setCapturedAt(ts);
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const races = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      const key = `${r.race_venue}||${r.race_num}`;
      if (!seen.has(key)) seen.set(key, { venue: r.race_venue, race_num: r.race_num });
    }
    return [...seen.values()].sort((a, b) => a.venue.localeCompare(b.venue) || Number(a.race_num) - Number(b.race_num));
  }, [rows]);

  const venues = useMemo(() => [...new Set(races.map(r => r.venue))].sort(), [races]);
  const raceNumsForVenue = useMemo(
    () => races.filter(r => r.venue === venue).map(r => r.race_num),
    [races, venue],
  );

  useEffect(() => {
    if (venues.length && !venue) setVenue(venues[0]);
  }, [venues, venue]);

  useEffect(() => {
    if (raceNumsForVenue.length && !raceNumsForVenue.includes(raceNum)) setRaceNum(raceNumsForVenue[0]);
  }, [raceNumsForVenue, raceNum]);

  const tableData = useMemo(() => {
    if (!venue || !raceNum) return { horses: [], byHorseBookie: {} };
    const relevant = rows.filter(r => r.race_venue === venue && r.race_num === raceNum);
    const horses = [...new Set(relevant.map(r => r.horse_name))].sort();
    const byHorseBookie = {};
    for (const r of relevant) {
      byHorseBookie[`${r.horse_name}||${r.bookmaker}`] = Number(r.price);
    }
    return { horses, byHorseBookie };
  }, [rows, venue, raceNum]);

  const columns = useMemo(() => {
    const slugsPresent = new Set(rows.map(r => r.bookmaker));
    return PUNTERSEDGE_BOOKMAKER_COLUMNS.filter(c => slugsPresent.has(c.slug));
  }, [rows]);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Odds</h1>
            {capturedAt && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                Updated {new Date(capturedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Loading odds…</div>
          ) : races.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
              No odds data yet for today — check back once racing is underway.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <select
                  value={venue}
                  onChange={e => { setVenue(e.target.value); setRaceNum(''); }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff' }}
                >
                  {venues.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select
                  value={raceNum}
                  onChange={e => setRaceNum(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff' }}
                >
                  {raceNumsForVenue.map(n => <option key={n} value={n}>Race {n}</option>)}
                </select>
              </div>

              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#173404' }}>
                      <th style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#EAF3DE', textAlign: 'left', position: 'sticky', left: 0, background: '#173404' }}>Horse</th>
                      {columns.map(c => (
                        <th key={c.slug} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#EAF3DE', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {bookmakerNameForSlug(c.slug)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.horses.map(horse => {
                      const prices = columns.map(c => tableData.byHorseBookie[`${horse}||${c.slug}`]).filter(p => p != null);
                      const best = prices.length ? Math.max(...prices) : null;
                      return (
                        <tr key={horse} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#111827', position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>{horse}</td>
                          {columns.map(c => {
                            const price = tableData.byHorseBookie[`${horse}||${c.slug}`];
                            const isBest = price != null && price === best;
                            return (
                              <td
                                key={c.slug}
                                style={{
                                  padding: '6px 10px',
                                  textAlign: 'right',
                                  fontFamily: 'monospace',
                                  color: price == null ? '#d1d5db' : isBest ? '#059669' : '#111827',
                                  fontWeight: isBest ? 700 : 400,
                                }}
                              >
                                {price != null ? price.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
