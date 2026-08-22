'use client';

import Link from 'next/link';

// Shared username renderer -- plain name by default, optionally coloured
// and/or followed by a small tag pill when the user has an equipped flair
// cosmetic. `flair` is an equipped flair cosmetic's `style` object (see
// lib/cosmeticsCatalog.js): { kind: 'color', color } or
// { kind: 'tag', label, bg, color, textColor? }.
//
// `href` (optional, typically `/u/${clerkId}`) wraps the whole name+tag in
// a link to that user's public profile -- omitted call sites (or ones with
// no clerk_id available yet) render exactly as before, non-clickable.
export default function NameFlair({ name, flair, fontSize = 12, fontWeight = 700, color = '#111827', href }) {
  const textColor = flair?.kind === 'color' ? flair.color
    : flair?.kind === 'tag' ? (flair.textColor || color)
    : color;

  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize, fontWeight, color: textColor }}>{name}</span>
      {flair?.kind === 'tag' && (
        <span style={{ fontSize: Math.max(9, fontSize - 3), fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: flair.bg, color: flair.color, whiteSpace: 'nowrap' }}>
          {flair.label}
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>;
}
