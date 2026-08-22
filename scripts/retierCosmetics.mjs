// One-time data migration: re-tiers the existing cosmetic_items rows from
// the old bronze/silver/gold/diamond scale to the new 7-tier racing-graded
// scale, per the mapping in lib/cosmeticsCatalog.js. Requires the
// cosmetic_items_tier_check constraint to already be swapped to the new
// values (see the DDL run before this) -- will fail loudly on the old
// constraint if run first.
// Usage: node scripts/retierCosmetics.mjs
import fs from 'fs';
import { COSMETIC_CATALOG } from '../lib/cosmeticsCatalog.js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SURL = env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = env.SUPABASE_SERVICE_KEY;

if (!SURL || !SKEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' };

let updated = 0, failed = 0;
for (const item of COSMETIC_CATALOG) {
  const res = await fetch(`${SURL}/rest/v1/cosmetic_items?id=eq.${item.id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ tier: item.tier }),
  });
  if (!res.ok) {
    console.error(`FAILED ${item.id} -> ${item.tier}:`, res.status, await res.text());
    failed++;
    continue;
  }
  const rows = await res.json();
  if (!rows.length) {
    console.error(`FAILED ${item.id}: no matching row (id typo, or item not seeded yet?)`);
    failed++;
    continue;
  }
  console.log(`ok: ${item.id} -> ${item.tier}`);
  updated++;
}

console.log(`\n${updated} updated, ${failed} failed.`);
if (failed > 0) process.exit(1);
