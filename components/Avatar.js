'use client';

import Link from 'next/link';

// Shared avatar circle -- replaces the two near-identical `Avatar`
// functions that used to live separately in app/community/page.js and
// app/community/post/[id]/page.js. Other users are still shown as an
// initials circle only (never a real photo) -- that's an existing,
// deliberate privacy choice in this app, not something this component
// changes. `imageUrl` is accepted for the one place that already showed a
// real photo (the current user's own avatar, e.g. ProfileRail), so that
// caller gets the border ring for free without losing its existing photo
// support.
//
// `border` is an equipped border cosmetic's `style` object (see
// lib/cosmeticsCatalog.js), or null/undefined for no border -- rendered as
// a padding ring around the circle using CSS gradients, no image assets.
function ringBackground(style) {
  if (!style || style.kind !== 'ring') return null;
  const [c1, c2] = style.colors;
  switch (style.pattern) {
    case 'solid':
      return c1;
    case 'quarters':
      return `conic-gradient(${c1} 0deg 90deg, ${c2} 90deg 180deg, ${c1} 180deg 270deg, ${c2} 270deg 360deg)`;
    case 'stripes':
      return `repeating-linear-gradient(45deg, ${c1} 0 6px, ${c2} 6px 12px)`;
    case 'checks':
      return `conic-gradient(${c1} 0deg 45deg, ${c2} 45deg 90deg, ${c1} 90deg 135deg, ${c2} 135deg 180deg, ${c1} 180deg 225deg, ${c2} 225deg 270deg, ${c1} 270deg 315deg, ${c2} 315deg 360deg)`;
    default:
      return c1;
  }
}

export default function Avatar({ profile, size = 32, imageUrl, border, href }) {
  const name = profile?.display_name || '?';
  const initial = name[0]?.toUpperCase() || '?';
  const ringBg = ringBackground(border);
  const ringWidth = ringBg ? Math.max(2, Math.round(size * 0.09)) : 0;
  const gapWidth = ringBg ? Math.max(1, Math.round(size * 0.04)) : 0;
  const outerSize = size + (ringWidth + gapWidth) * 2;

  const circle = imageUrl
    ? <img src={imageUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
    : (
      <div style={{
        width: size, height: size, borderRadius: '50%', background: '#00471b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.4), fontWeight: 700, color: '#fff',
      }}>
        {initial}
      </div>
    );

  const wrapped = !ringBg ? (
    <div style={{ flexShrink: 0 }}>{circle}</div>
  ) : (
    <div
      title={border?.name}
      style={{
        width: outerSize, height: outerSize, borderRadius: '50%',
        background: ringBg, padding: ringWidth, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
        // Some patterns include white as a colour (e.g. Silver Silks), which
        // would otherwise vanish into a white/light page background and
        // make the ring look broken rather than deliberately patterned --
        // this outline defines the ring's outer edge regardless of its
        // colours or what it's sitting on.
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{
        width: size + gapWidth * 2, height: size + gapWidth * 2, borderRadius: '50%',
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        {circle}
      </div>
    </div>
  );

  // `href` (typically `/u/${clerkId}`) makes the avatar itself clickable to
  // that user's public profile -- omitted call sites render exactly as
  // before, non-clickable.
  if (!href) return wrapped;
  return <Link href={href} style={{ display: 'inline-flex', flexShrink: 0 }}>{wrapped}</Link>;
}
