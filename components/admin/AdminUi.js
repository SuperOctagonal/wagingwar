'use client';

// Shared building blocks for the admin dashboard (app/admin/subscribers).
// Same look as the original Subscribers page: inline styles, gray borders,
// 11px/700 chips, #00471b accent.

export const C = {
  ink: '#111827', ink2: '#374151', muted: '#6b7280', faint: '#9ca3af',
  border: '#e5e7eb', soft: '#f9fafb', accent: '#00471b', accentBg: '#f0fdf4',
};

// Status colours (good / warning / critical) always ship with a text label.
export const STATUS = {
  green: { bg: '#dcfce7', color: '#166534', label: 'OK' },
  amber: { bg: '#fef3c7', color: '#92400e', label: 'Warning' },
  red:   { bg: '#fee2e2', color: '#991b1b', label: 'Problem' },
};

export function Panel({ id, title, subtitle, actions, children }) {
  return (
    <section id={id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: '#fff', marginBottom: 16, scrollMarginTop: 56 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 16px 10px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: C.ink, margin: 0 }}>{title}</h2>
          {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
      </div>
      <div style={{ padding: '0 16px 16px' }}>{children}</div>
    </section>
  );
}

export function NoData({ children = 'No data yet.' }) {
  return (
    <div style={{ padding: '18px 12px', textAlign: 'center', color: C.muted, fontSize: 13, background: C.soft, border: `1px dashed ${C.border}`, borderRadius: 6 }}>
      {children}
    </div>
  );
}

export function Chip({ bg, color, children }) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
        border: active ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
        background: active ? C.accentBg : '#fff', color: active ? C.accent : C.ink2,
      }}
    >
      {children}
    </button>
  );
}

// Single-series sparkline: one 2px line, no legend (the tile title names it).
export function Sparkline({ values, width = 120, height = 28, color = '#2a78d6', label }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ display: 'block' }}>
      <title>{label}</title>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// KPI tile. `value` null => "No data yet" (never a fake zero). `pending`
// => panel not built yet. `delta` is a signed number shown with its sign.
export function KpiTile({ label, value, sub, delta, deltaLabel, spark, sparkLabel, status, pending }) {
  let body;
  if (pending) body = <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{pending}</div>;
  else if (value == null) body = <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>No data yet</div>;
  else body = <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', background: '#fff', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
        {status && <Chip bg={STATUS[status].bg} color={STATUS[status].color}>{STATUS[status].label}</Chip>}
      </div>
      {body}
      {!pending && value != null && (sub || delta != null) && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {delta != null && (
            <span style={{ fontWeight: 700, color: delta > 0 ? '#166534' : delta < 0 ? '#991b1b' : C.muted }}>
              {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}{delta}{' '}
            </span>
          )}
          {deltaLabel}{sub}
        </div>
      )}
      {!pending && value != null && spark && <div style={{ marginTop: 6 }}><Sparkline values={spark} label={sparkLabel} /></div>}
    </div>
  );
}

// From/to date filter (YYYY-MM-DD strings) with quick presets in days.
export function DateRange({ from, to, onChange, presets = [7, 30, 90], min, max }) {
  const input = { fontSize: 12, padding: '5px 6px', border: `1px solid ${C.border}`, borderRadius: 6, color: C.ink2 };
  const preset = (days) => {
    const end = max || new Date().toISOString().slice(0, 10);
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    const start = d.toISOString().slice(0, 10);
    onChange({ from: min && start < min ? min : start, to: end });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {presets.map(p => <ToggleButton key={p} onClick={() => preset(p)}>{p}d</ToggleButton>)}
      <input type="date" value={from || ''} min={min} max={to || max} onChange={e => onChange({ from: e.target.value, to })} style={input} aria-label="From date" />
      <span style={{ fontSize: 12, color: C.muted }}>to</span>
      <input type="date" value={to || ''} min={from || min} max={max} onChange={e => onChange({ from, to: e.target.value })} style={input} aria-label="To date" />
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDay(ymd) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtAud(n) {
  if (n == null) return '—';
  return `${n < 0 ? '-' : ''}A$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
