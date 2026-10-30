'use client';

import { useMemo, useState } from 'react';
import { C } from './AdminUi';

// Sortable table with CSV export, used by every admin dashboard table.
// columns: [{ key, label, render?(row), sort?(row) -> comparable, csv?(row) -> string|number, align? }]
// Without `sort`/`csv`, row[key] is used. CSV exports the rows currently
// shown (after the caller's filters), in the current sort order.

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, columns, rows) {
  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(c.csv ? c.csv(r) : r[c.key])).join(','));
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CsvButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.ink2, cursor: 'pointer' }}
    >
      ⬇ CSV
    </button>
  );
}

export default function DataTable({ columns, rows, initialSort, initialDir = 'desc', csvName, emptyText = 'No rows match.', maxHeight }) {
  const [sortKey, setSortKey] = useState(initialSort || null);
  const [dir, setDir] = useState(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    const val = r => (col?.sort ? col.sort(r) : r[sortKey]);
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, columns, sortKey, dir]);

  function toggle(key) {
    if (sortKey === key) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir('desc'); }
  }

  const th = { padding: '8px 12px', fontWeight: 700, color: C.ink2, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: C.soft, borderBottom: `1px solid ${C.border}` };

  return (
    <div>
      {csvName && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted }}>{sorted.length} rows</span>
          <CsvButton onClick={() => downloadCsv(`${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, columns, sorted)} />
        </div>
      )}
      <div style={{ overflow: 'auto', border: `0.5px solid ${C.border}`, borderRadius: 8, maxHeight }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} onClick={() => toggle(c.key)} style={{ ...th, textAlign: c.align || 'left' }} aria-sort={sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  {c.label} {sortKey === c.key ? (dir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id ?? r.key ?? i} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '7px 12px', color: C.ink, textAlign: c.align || 'left', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 20, textAlign: 'center', color: C.faint }}>{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
