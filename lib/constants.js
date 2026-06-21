// ─── WAGING WAR — spacing & typography reference ─────────────────────────────
//
// Single source of truth for the app's visual scale.
// Files use inline styles — match these values by eye rather than importing.
// Update here when the standard changes; grep for old values to find stragglers.
//
// FONT SIZES (5-step ladder — no other sizes)
//   9px  — micro-labels: TC pills, timestamps, badge numbers
//  10px  — secondary text: form labels, metadata, stat labels, table headers
//  11px  — primary body text: inputs, jockey/trainer, descriptions, values
//  13px  — names/headings/pill labels: horse names, section titles, pill text
//  20px  — page main headings only
//
// PADDING MINIMUMS
//   Table rows (td):          4px 6px
//   Pills / badges:           3px 6px  (always top==bottom — fix unbalanced cases)
//   Card / section headers:   6px 10px (dark or light header bars above content)
//   Form inputs:              5px 8px
//   Buttons (primary):        6px 12px
//
// GAPS / GRIDS
//   Meeting/card grids:  gap: 6  (use everywhere — do not mix with gap: 8)
//   Tight inline rows:   gap: 4
//   Loose inline rows:   gap: 8
//
// ─────────────────────────────────────────────────────────────────────────────

export {};
