'use client';
import { useState, useEffect, useMemo } from 'react';
import ProfileRail from '@/components/ProfileRail';
import OddsTable from '@/components/OddsTable';
import { fetchAllRows } from '@/lib/fetchAllRows';

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

export default function OddsPageClient() {
  // Only used to discover which venues/races currently have odds, for the
  // picker below -- the actual table data is fetched by OddsTable itself,
  // scoped to just the selected venue+race.
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState('');
  const [raceNum, setRaceNum] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = sydneyToday();
      const latest = await sb(
        `odds_snapshot?race_date=eq.${today}&select=captured_at&order=captured_at.desc&limit=1`,
      );
      const ts = latest[0]?.captured_at;
      if (!ts) {
        if (!cancelled) { setRaces([]); setLoading(false); }
        return;
      }
      // A single race day's odds_snapshot batch routinely exceeds
      // PostgREST's default 1,000-row cap (confirmed live: 5,486 rows for
      // one captured_at on a normal day) -- a plain fetch() silently
      // truncates to whichever rows PostgREST returns first, missing
      // venues/races past that cutoff. fetchAllRows pages through with
      // offset/limit until a short page confirms there's nothing left,
      // same pattern already used elsewhere in the codebase for this same
      // PostgREST behavior.
      const result = await fetchAllRows(
        `${SURL}/rest/v1/odds_snapshot?race_date=eq.${today}&captured_at=eq.${encodeURIComponent(ts)}&select=race_venue,race_num`,
        { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
      );
      const snapshot = result.ok ? result.rows : [];
      if (!cancelled) {
        const seen = new Map();
        for (const r of snapshot) {
          const key = `${r.race_venue}||${r.race_num}`;
          if (!seen.has(key)) seen.set(key, { venue: r.race_venue, race_num: r.race_num });
        }
        setRaces([...seen.values()].sort((a, b) => a.venue.localeCompare(b.venue) || Number(a.race_num) - Number(b.race_num)));
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Odds</h1>
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

              <OddsTable venue={venue} raceNum={raceNum} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
