'use client';

const GOLD = '#e8b84a';
const CT_LINE = '#e5e7eb';

// Shared persistent tab bar -- icon + label tiles inside a bordered group
// container, active tab a dark green fill with a gold icon and white label,
// inactive tabs transparent with muted icon/label. Originally built for the
// Games page's Trivia/Puzzle/Track Dash/Prizes nav; Competitions' Today/
// Beat the Model/All-time nav was migrated to match it exactly rather than
// hand-duplicating the same styling a second time.
//
// `tabs`: [{ id, label, icon }] -- icon is a Tabler icon name without the
// leading "ti-" prefix stripped (pass e.g. "ti-calendar").
export default function MainTabBar({ tabs, activeId, onSelect }) {
  return (
    <div style={{ background: '#fff', borderBottom: `0.5px solid ${CT_LINE}`, padding: '8px 16px', flexShrink: 0 }}>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: `1px solid ${CT_LINE}`, borderRadius: 10, background: '#fff', flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const active = t.id === activeId;
          return (
            <button key={t.id} onClick={() => onSelect(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: active ? '#0d2416' : 'transparent',
              }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15, color: active ? GOLD : '#9ca3af' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#fff' : '#6b7280' }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
