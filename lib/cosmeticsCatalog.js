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

export const COSMETIC_CATALOG = [
  // ─── Borders — "Silks" set, the racing-themed signature piece. Each tier
  // is a genuine jockey-silk pattern convention, rendered as a conic-gradient
  // ring (no image assets) by components/Avatar.js.
  {
    id: 'border_silks_bronze', category: 'border', tier: 'bronze',
    name: 'Bronze Silks', credit_cost: 300,
    style: { kind: 'ring', pattern: 'solid', colors: ['#059669'] },
  },
  {
    id: 'border_silks_silver', category: 'border', tier: 'silver',
    name: 'Silver Silks', credit_cost: 800,
    style: { kind: 'ring', pattern: 'quarters', colors: ['#1e3a8a', '#ffffff'] },
  },
  {
    id: 'border_silks_gold', category: 'border', tier: 'gold',
    name: 'Gold Silks', credit_cost: 2000,
    style: { kind: 'ring', pattern: 'stripes', colors: ['#d97706', '#7f1d1d'] },
  },
  {
    id: 'border_silks_diamond', category: 'border', tier: 'diamond',
    name: 'Diamond Silks', credit_cost: 5000,
    style: { kind: 'ring', pattern: 'checks', colors: ['#059669', '#d97706'] },
  },

  // ─── Name flair — text colour and/or a small tag suffix next to the
  // username, same places the border shows.
  {
    id: 'flair_emerald_text', category: 'flair', tier: 'bronze',
    name: 'Emerald Text', credit_cost: 500,
    style: { kind: 'color', color: '#059669' },
  },
  {
    id: 'flair_gold_text', category: 'flair', tier: 'bronze',
    name: 'Gold Text', credit_cost: 500,
    style: { kind: 'color', color: '#d97706' },
  },
  {
    id: 'flair_trivia_whiz', category: 'flair', tier: 'silver',
    name: 'Trivia Whiz', credit_cost: 900,
    style: { kind: 'tag', label: 'Trivia Whiz', bg: '#dbeafe', color: '#1e40af' },
  },
  {
    id: 'flair_carnival_veteran', category: 'flair', tier: 'silver',
    name: 'Cup Carnival Veteran', credit_cost: 900,
    style: { kind: 'tag', label: 'Cup Carnival Veteran', bg: '#fef3c7', color: '#92400e' },
  },
  {
    id: 'flair_punter_royalty', category: 'flair', tier: 'gold',
    name: 'Punter Royalty', credit_cost: 1500,
    style: { kind: 'tag', label: 'Punter Royalty', bg: '#fef9c3', color: '#854d0e', textColor: '#b45309' },
  },
  {
    id: 'flair_silks_and_stripes', category: 'flair', tier: 'gold',
    name: 'Silks & Stripes', credit_cost: 1500,
    style: { kind: 'tag', label: 'Silks & Stripes', bg: '#dcfce7', color: '#166534', textColor: '#059669' },
  },

  // ─── Badges — purchasable, tiered display only (no equip concept; once
  // owned they just accumulate in the badge case). bg/color drive the
  // tiered SO-style card styling per badge.
  {
    id: 'badge_first_bet', category: 'badge', tier: 'bronze',
    name: 'First Bet Logged', credit_cost: 200,
    style: { kind: 'badge', icon: 'ti-ticket', bg: '#fdf4e7', color: '#92400e' },
  },
  {
    id: 'badge_early_bird', category: 'badge', tier: 'bronze',
    name: 'Early Bird', credit_cost: 200,
    style: { kind: 'badge', icon: 'ti-sunrise', bg: '#fdf4e7', color: '#92400e' },
  },
  {
    id: 'badge_trivia_ace', category: 'badge', tier: 'silver',
    name: 'Trivia Ace', credit_cost: 500,
    style: { kind: 'badge', icon: 'ti-brain', bg: '#f1f5f9', color: '#475569' },
  },
  {
    id: 'badge_streak_keeper', category: 'badge', tier: 'silver',
    name: 'Streak Keeper', credit_cost: 500,
    style: { kind: 'badge', icon: 'ti-flame', bg: '#f1f5f9', color: '#475569' },
  },
  {
    id: 'badge_cup_carnival_champion', category: 'badge', tier: 'gold',
    name: 'Cup Carnival Champion', credit_cost: 1000,
    style: { kind: 'badge', icon: 'ti-trophy', bg: '#fef9c3', color: '#854d0e' },
  },
  {
    id: 'badge_model_beater', category: 'badge', tier: 'gold',
    name: 'Model Beater', credit_cost: 1000,
    style: { kind: 'badge', icon: 'ti-robot', bg: '#fef9c3', color: '#854d0e' },
  },
];
