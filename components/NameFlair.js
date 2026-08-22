'use client';

// Shared username renderer -- plain name by default, optionally coloured
// and/or followed by a small tag pill when the user has an equipped flair
// cosmetic. `flair` is an equipped flair cosmetic's `style` object (see
// lib/cosmeticsCatalog.js): { kind: 'color', color } or
// { kind: 'tag', label, bg, color, textColor? }.
export default function NameFlair({ name, flair, fontSize = 12, fontWeight = 700, color = '#111827' }) {
  const textColor = flair?.kind === 'color' ? flair.color
    : flair?.kind === 'tag' ? (flair.textColor || color)
    : color;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize, fontWeight, color: textColor }}>{name}</span>
      {flair?.kind === 'tag' && (
        <span style={{ fontSize: Math.max(9, fontSize - 3), fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: flair.bg, color: flair.color, whiteSpace: 'nowrap' }}>
          {flair.label}
        </span>
      )}
    </span>
  );
}
