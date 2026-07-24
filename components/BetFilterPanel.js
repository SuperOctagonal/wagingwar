'use client';

import { useState, useEffect, useMemo } from 'react';
import { normaliseVenue } from '@/lib/venues';
import { ODDS_BANDS } from '@/lib/oddsBucket';

const G = '#00471b';

// Same 5 tiers as actual bet-size distribution — matches the stakeBand
// param /api/insights/filtered-bets expects.
const STAKE_BANDS = [
  { key: 'under5', label: 'Under $5' },
  { key: '5-10',   label: '$5-10' },
  { key: '10-20',  label: '$10-20' },
  { key: '20-50',  label: '$20-50' },
  { key: '50plus', label: '$50+' },
];

// Fixed display order (not alphabetical) for track condition.
const CONDITION_ORDER = ['good', 'soft', 'heavy', 'synthetic'];

function capitalize(s) {
  const str = String(s);
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

const FILTER_VALUE_LABELS = {
  oddsBand: Object.fromEntries(ODDS_BANDS.map(b => [b.key, b.label])),
  stakeBand: Object.fromEntries(STAKE_BANDS.map(b => [b.key, b.label])),
  dow: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
};
// Every other filter's raw DB value gets its first letter capitalized for
// display (bet type, bookmaker, state, result, distance, race class, track
// condition) — the underlying value sent to the filter/API stays untouched.
function filterValueLabel(key, value) {
  if (FILTER_VALUE_LABELS[key]?.[value] != null) return FILTER_VALUE_LABELS[key][value];
  if (!value) return value;
  return capitalize(value);
}

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
    const conditionsPresent = new Set(bets.map(b => (b.track_condition || '').trim().toLowerCase()).filter(Boolean));
    return {
      venue:      uniq(bets.map(b => normaliseVenue(b.venue || b.track || ''))),
      condition:  [
        ...CONDITION_ORDER.filter(c => conditionsPresent.has(c)),
        ...[...conditionsPresent].filter(c => !CONDITION_ORDER.includes(c)).sort(),
      ],
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
    { key: 'oddsBand',  label: 'Odds band',        options: ODDS_BANDS.map(b => b.key) },
    { key: 'stakeBand', label: 'Stake band',       options: STAKE_BANDS.map(b => b.key) },
    { key: 'bookmaker', label: 'Bookmaker',        options: filterOptions.bookmaker },
    { key: 'state',     label: 'State',            options: filterOptions.state },
    { key: 'result',    label: 'Result',           options: filterOptions.result },
    { key: 'dow',       label: 'Day of week',      options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
    { key: 'distance',  label: 'Distance',         options: filterOptions.distance },
    { key: 'raceClass', label: 'Race class',       options: filterOptions.raceClass },
  ].filter(def => !excludeKeys.includes(def.key));

  return (
    <div style={{ position: 'relative' }}>
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
        // Absolutely positioned overlay — floats over the content below
        // rather than pushing it down, so opening/closing never changes
        // the height or position of anything else on the page (e.g. the
        // ledger table on My Bets).
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 50,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          width: isMobile ? 'calc(100vw - 32px)' : 560, maxWidth: '95vw',
          maxHeight: '70vh', overflowY: 'auto',
        }}>
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
