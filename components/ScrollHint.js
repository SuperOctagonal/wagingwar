'use client';

// Small "more content this way" affordance shown next to a table using
// the .ww-scroll-x wrapper (app/globals.css) + useScrollOverflow (hooks/
// useScrollOverflow.js), whenever that hook reports real overflow.
export default function ScrollHint({ label = 'Scroll for more' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>
      {label} <i className="ti ti-arrow-right" style={{ fontSize: 11 }} />
    </span>
  );
}
