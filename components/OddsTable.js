'use client';
import { useState, useEffect, useMemo } from 'react';
import PuntersEdgeCredit from '@/components/PuntersEdgeCredit';
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

// Renders the bookmaker-comparison table for one race, given directly rather
// than discovered via its own picker -- used standalone by /odds (which picks
// the race via its own venue/race selects) and by the Races page's Odds tab
// (which already has a race selected via the sidebar/R1-R8 pills).
export default function OddsTable({ venue, raceNum }) {
  const [rows, setRows] = useState([]);
  const [cardInfo, setCardInfo] = useState({});
  const [capturedAt, setCapturedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venue || !raceNum) { setRows([]); setCardInfo({}); setCapturedAt(null); setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      const today = sydneyToday();
      // odds_snapshot is append-only (one batch per ~15min poll) -- read only
      // the most recent batch's captured_at, not the whole day's history.
      const latest = await sb(
        `odds_snapshot?race_date=eq.${today}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&select=captured_at&order=captured_at.desc&limit=1`,
      );
      const ts = latest[0]?.captured_at;
      if (!ts) {
        if (!cancelled) { setRows([]); setCardInfo({}); setCapturedAt(null); setLoading(false); }
        return;
      }
      // odds_snapshot itself has no horse number/barrier -- those live on
      // race_cards (the same table the Field tab reads them from), joined
      // here by horse_name since odds_snapshot.horse_name is already the
      // matched race_cards.horse_name value (written by the puntersedge-refs
      // ingest route's matcher, not a raw PuntersEdge name).
      const [snapshot, cards] = await Promise.all([
        sb(`odds_snapshot?race_date=eq.${today}&race_venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&captured_at=eq.${encodeURIComponent(ts)}&select=horse_name,bookmaker,price`),
        sb(`race_cards?date=eq.${today}&venue=eq.${encodeURIComponent(venue)}&race_num=eq.${encodeURIComponent(raceNum)}&select=horse_name,barrier,form_data`),
      ]);
      if (!cancelled) {
        setRows(snapshot);
        const info = {};
        for (const c of cards) {
          info[c.horse_name] = { tab: c.form_data?.tab ?? null, barrier: c.barrier ?? null };
        }
        setCardInfo(info);
        setCapturedAt(ts);
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [venue, raceNum]);

  const tableData = useMemo(() => {
    const horses = [...new Set(rows.map(r => r.horse_name))].sort((a, b) => {
      const ta = Number(cardInfo[a]?.tab);
      const tb = Number(cardInfo[b]?.tab);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      if (Number.isFinite(ta)) return -1;
      if (Number.isFinite(tb)) return 1;
      return a.localeCompare(b);
    });
    const byHorseBookie = {};
    for (const r of rows) {
      byHorseBookie[`${r.horse_name}||${r.bookmaker}`] = Number(r.price);
    }
    return { horses, byHorseBookie };
  }, [rows, cardInfo]);

  const columns = useMemo(() => {
    const slugsPresent = new Set(rows.map(r => r.bookmaker));
    return PUNTERSEDGE_BOOKMAKER_COLUMNS.filter(c => slugsPresent.has(c.slug));
  }, [rows]);

  if (loading) {
    return <div style={{ color: '#6b7280', fontSize: 13 }}>Loading odds…</div>;
  }

  if (!rows.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
        No odds data yet for this race — check back once racing is underway.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <PuntersEdgeCredit />
        {capturedAt && (
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            Updated {new Date(capturedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {/* Matches the Field tab's .ww-race-table treatment: border-collapse +
          1px solid #d1d5db gridlines on every cell, light-gray uppercase
          header -- same density/fonts as the Field table's default (Standard
          density, Medium font) styling, not a separately-styled table. */}
      <style>{`
        .ww-odds-table { border-collapse: collapse; }
        .ww-odds-table th, .ww-odds-table td { border: 1px solid #d1d5db; }
      `}</style>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
        <table className="ww-odds-table" style={{ width: '100%', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: '3px 4px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', position: 'sticky', left: 0 }}>Horse</th>
              {columns.map(c => (
                <th key={c.slug} style={{ padding: '3px 4px', fontSize: 9, fontWeight: 700, color: '#374151', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {bookmakerNameForSlug(c.slug)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.horses.map(horse => {
              const prices = columns.map(c => tableData.byHorseBookie[`${horse}||${c.slug}`]).filter(p => p != null);
              const best = prices.length ? Math.max(...prices) : null;
              const info = cardInfo[horse];
              return (
                <tr key={horse}>
                  <td style={{ padding: '3px 4px', fontWeight: 600, color: '#111827', background: '#fff', position: 'sticky', left: 0, whiteSpace: 'nowrap' }}>
                    {info?.tab ? `${info.tab}. ` : ''}{horse}{info?.barrier ? ` (${info.barrier})` : ''}
                  </td>
                  {columns.map(c => {
                    const price = tableData.byHorseBookie[`${horse}||${c.slug}`];
                    const isBest = price != null && price === best;
                    return (
                      <td
                        key={c.slug}
                        style={{
                          padding: '3px 4px',
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
  );
}
