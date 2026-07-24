'use client';

import { useState, useEffect, useMemo } from 'react';
import { normaliseVenue } from '@/lib/venues';

const G = '#00471b';

const FILTER_VALUE_LABELS = {
  oddsBand: { '2-4': '$2–4', '4-8': '$4–8', '8-15': '$8–15', '15+': '$15+' },
  stakeBand: { under20: 'Under $20', '20-50': '$20–50', '50plus': '$50+' },
  dow: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
};
function filterValueLabel(key, value) { return FILTER_VALUE_LABELS[key]?.[value] || value; }

// Extracted from app/insights/page.js — chips row + collapsible select-grid
// panel for filtering bet_log rows. Filtering itself (the actual data fetch/
// aggregation) stays with the caller; this component only owns the filter
// *selection* UI and reports the active { key: value } map via onChange
// whenever it changes. bets/results should be the same unfiltered arrays the
// page already loads — option lists are derived from them so they don't
// shrink as filters are applied, matching the original behavior exactly.
export default function BetFilterPanel({ bets, results, isMobile, onChange, excludeKeys = [] }) {
  const [filters, setFilters] = useState({});
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const activeFilterEntries = useMemo(() => Object.entries(filters).filter(([, v]) => v), [filters]);

  useEffect(() => {
    onChange?.(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function setFilter(key, value) {
    setFilters(prev => value ? { ...prev, [key]: value } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  }
  function clearFilters() { setFilters({}); }

  // Distinct option values, derived from the unfiltered bets/results sets
  // already loaded — so option lists don't shrink as filters are applied.
  const filterOptions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    return {
      venue:      uniq(bets.map(b => normaliseVenue(b.venue || b.track || ''))),
      condition:  uniq(bets.map(b => (b.track_condition || '').trim())),
      rank:       uniq(bets.map(b => b.rank != null ? String(b.rank) : null)).sort((a, b) => +a - +b),
      betType:    uniq(bets.map(b => b.bet_type)),
      bookmaker:  uniq(bets.map(b => b.bookmaker)),
      state:      uniq(bets.map(b => b.state)),
      result:     uniq(bets.map(b => b.status)),
      distance:   uniq(results.map(r => r.dist)),
      raceClass:  uniq(results.map(r => r.class)),
    };
  }, [bets, results]);

  const FILTER_DEFS = [
    { key: 'venue',     label: 'Track',            options: filterOptions.venue },
    { key: 'condition', label: 'Track condition',  options: filterOptions.condition },
    { key: 'rank',      label: 'Model rank',       options: filterOptions.rank },
    { key: 'betType',   label: 'Bet type',         options: filterOptions.betType },
    { key: 'oddsBand',  label: 'Odds band',        options: ['2-4', '4-8', '8-15', '15+'] },
    { key: 'stakeBand', label: 'Stake band',       options: ['under20', '20-50', '50plus'] },
    { key: 'bookmaker', label: 'Bookmaker',        options: filterOptions.bookmaker },
    { key: 'state',     label: 'State',            options: filterOptions.state },
    { key: 'result',    label: 'Result',           options: filterOptions.result },
    { key: 'dow',       label: 'Day of week',      options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
    { key: 'distance',  label: 'Distance',         options: filterOptions.distance },
    { key: 'raceClass', label: 'Race class',       options: filterOptions.raceClass },
  ].filter(def => !excludeKeys.includes(def.key));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {activeFilterEntries.map(([key, value]) => {
          const def = FILTER_DEFS.find(f => f.key === key);
          return (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#e9f5ee', color: G, border: '1px solid #bbe5cc', borderRadius: 14, padding: '3px 6px 3px 10px', fontSize: 11, fontWeight: 600 }}>
              {def?.label}: {filterValueLabel(key, value)}
              <button onClick={() => setFilter(key, null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: G, fontSize: 13, lineHeight: 1, padding: 2 }}>×</button>
            </span>
          );
        })}
        <button onClick={() => setFilterPanelOpen(v => !v)} style={{ background: filterPanelOpen ? G : '#fff', color: filterPanelOpen ? '#fff' : '#374151', border: `1px solid ${filterPanelOpen ? G : '#e5e7eb'}`, borderRadius: 14, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Add filter {filterPanelOpen ? '−' : '+'}
        </button>
        {activeFilterEntries.length > 0 && (
          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: '4px 2px' }}>
            Clear all
          </button>
        )}
      </div>

      {filterPanelOpen && (
        <div style={{ marginTop: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
            {FILTER_DEFS.map(def => (
              <div key={def.key}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{def.label}</div>
                <select
                  value={filters[def.key] || ''}
                  onChange={e => setFilter(def.key, e.target.value || null)}
                  style={{ width: '100%', fontSize: 12, padding: '5px 6px', border: '1px solid #e5e7eb', borderRadius: 5, color: '#374151', background: '#fff' }}
                >
                  <option value="">Any</option>
                  {def.options.map(opt => (
                    <option key={opt} value={opt}>{filterValueLabel(def.key, opt)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
