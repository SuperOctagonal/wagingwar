// Source-of-truth catalog for the cosmetic redemption store -- seeded into
// cosmetic_items via scripts/seedCosmetics.mjs (re-runnable: seeding uses
// on_conflict=id,resolution=merge-duplicates, so editing an entry here and
// re-running the script updates it in place rather than duplicating).
//
// `style` is a plain descriptor consumed by components/Avatar.js and
// components/NameFlair.js -- never raw CSS strings, so rendering stays
// centralized in those two components instead of re-implementing ring/tag
// rendering wherever an item is displayed.
//
// Pricing anchored against lib/credits.js: SIGNUP_BONUS=1000,
// DAILY_LOGIN up to 200/day, MAX_BALANCE=50000.
//
// Tiers are the 7-tier racing-graded scale (maiden < benchmark < listed <
// group3 < group2 < group1 < cupclass), replacing the original bronze/
// silver/gold/diamond set. Spread by relative cost across the whole
// catalog, not a naive per-category rename -- cupclass is deliberately
// empty for now (reserved for future limited/seasonal drops, not force-
// filled just to have an item in every tier).

export const COSMETIC_CATALOG = [
  // ─── Borders — "Silks" set, the racing-themed signature piece. Each tier
  // is a genuine jockey-silk pattern convention, rendered as a conic-gradient
  // ring (no image assets) by components/Avatar.js.
  {
    id: 'border_silks_bronze', category: 'border', tier: 'maiden',
    name: 'Bronze Silks', credit_cost: 300,
    style: { kind: 'ring', pattern: 'solid', colors: ['#059669'] },
  },
  {
    id: 'border_silks_silver', category: 'border', tier: 'listed',
    name: 'Silver Silks', credit_cost: 800,
    style: { kind: 'ring', pattern: 'quarters', colors: ['#1e3a8a', '#ffffff'] },
  },
  {
    id: 'border_silks_gold', category: 'border', tier: 'group2',
    name: 'Gold Silks', credit_cost: 2000,
    style: { kind: 'ring', pattern: 'stripes', colors: ['#d97706', '#7f1d1d'] },
  },
  {
    id: 'border_silks_diamond', category: 'border', tier: 'group1',
    name: 'Diamond Silks', credit_cost: 5000,
    style: { kind: 'ring', pattern: 'checks', colors: ['#059669', '#d97706'] },
  },

  // ─── Name flair — text colour and/or a small tag suffix next to the
  // username, same places the border shows.
  {
    id: 'flair_emerald_text', category: 'flair', tier: 'maiden',
    name: 'Emerald Text', credit_cost: 500,
    style: { kind: 'color', color: '#059669' },
  },
  {
    id: 'flair_gold_text', category: 'flair', tier: 'maiden',
    name: 'Gold Text', credit_cost: 500,
    style: { kind: 'color', color: '#d97706' },
  },
  {
    id: 'flair_trivia_whiz', category: 'flair', tier: 'benchmark',
    name: 'Trivia Whiz', credit_cost: 900,
    style: { kind: 'tag', label: 'Trivia Whiz', bg: '#dbeafe', color: '#1e40af' },
  },
  {
    id: 'flair_carnival_veteran', category: 'flair', tier: 'benchmark',
    name: 'Cup Carnival Veteran', credit_cost: 900,
    style: { kind: 'tag', label: 'Cup Carnival Veteran', bg: '#fef3c7', color: '#92400e' },
  },
  {
    id: 'flair_punter_royalty', category: 'flair', tier: 'listed',
    name: 'Punter Royalty', credit_cost: 1500,
    style: { kind: 'tag', label: 'Punter Royalty', bg: '#fef9c3', color: '#854d0e', textColor: '#b45309' },
  },
  {
    id: 'flair_silks_and_stripes', category: 'flair', tier: 'listed',
    name: 'Silks & Stripes', credit_cost: 1500,
    style: { kind: 'tag', label: 'Silks & Stripes', bg: '#dcfce7', color: '#166534', textColor: '#059669' },
  },

  // ─── Badges — purchasable, tiered display only (no equip concept; once
  // owned they just accumulate in the badge case). bg/color drive the
  // tiered SO-style card styling per badge.
  {
    id: 'badge_first_bet', category: 'badge', tier: 'maiden',
    name: 'First Bet Logged', credit_cost: 200,
    style: { kind: 'badge', icon: 'ti-ticket', bg: '#fdf4e7', color: '#92400e' },
  },
  {
    id: 'badge_early_bird', category: 'badge', tier: 'maiden',
    name: 'Early Bird', credit_cost: 200,
    style: { kind: 'badge', icon: 'ti-sunrise', bg: '#fdf4e7', color: '#92400e' },
  },
  {
    id: 'badge_trivia_ace', category: 'badge', tier: 'benchmark',
    name: 'Trivia Ace', credit_cost: 500,
    style: { kind: 'badge', icon: 'ti-brain', bg: '#f1f5f9', color: '#475569' },
  },
  {
    id: 'badge_streak_keeper', category: 'badge', tier: 'benchmark',
    name: 'Streak Keeper', credit_cost: 500,
    style: { kind: 'badge', icon: 'ti-flame', bg: '#f1f5f9', color: '#475569' },
  },
  {
    id: 'badge_cup_carnival_champion', category: 'badge', tier: 'group3',
    name: 'Cup Carnival Champion', credit_cost: 1000,
    style: { kind: 'badge', icon: 'ti-trophy', bg: '#fef9c3', color: '#854d0e' },
  },
  {
    id: 'badge_model_beater', category: 'badge', tier: 'group3',
    name: 'Model Beater', credit_cost: 1000,
    style: { kind: 'badge', icon: 'ti-robot', bg: '#fef9c3', color: '#854d0e' },
  },
];

// Ordered ladder + display colours for the 7-tier scale, shared by every
// component that renders a tier tag/badge (Avatar's badge fallback colour,
// CosmeticsStore/Store/Locker tier tags). cupclass gets a second accent
// colour (border) on top of its base, so it reads as visibly rarer than
// group1 rather than just "another colour in the sequence".
export const TIER_ORDER = { maiden: 0, benchmark: 1, listed: 2, group3: 3, group2: 4, group1: 5, cupclass: 6 };
export const TIER_COLORS = {
  maiden:    { bg: '#f3f4f6', border: '#6b7280', text: '#374151' },
  benchmark: { bg: '#dcfce7', border: '#16a34a', text: '#166534' },
  listed:    { bg: '#dbeafe', border: '#2563eb', text: '#1e40af' },
  group3:    { bg: '#f3e8ff', border: '#7c3aed', text: '#5b21b6' },
  group2:    { bg: '#fef3c7', border: '#d97706', text: '#92400e' },
  group1:    { bg: '#fce7f3', border: '#db2777', text: '#9d174d' },
  cupclass:  { bg: '#ccfbf1', border: '#0d9488', accent: '#eab308', text: '#134e4a' },
};
