// Seeds/updates the cosmetic_items catalog from lib/cosmeticsCatalog.js.
// Re-runnable: upserts on id, so editing an entry in the catalog file and
// re-running this script updates it in place instead of duplicating rows.
// Usage: node scripts/seedCosmetics.mjs
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

const res = await fetch(`${SURL}/rest/v1/cosmetic_items?on_conflict=id`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(COSMETIC_CATALOG.map(item => ({ ...item, active: true }))),
});

if (!res.ok) {
  console.error('Seed failed:', res.status, await res.text());
  process.exit(1);
}

const rows = await res.json();
console.log(`Seeded ${rows.length} cosmetic items.`);
const byCategory = rows.reduce((m, r) => { m[r.category] = (m[r.category] || 0) + 1; return m; }, {});
console.log(byCategory);
