// Seeds trivia batch 1 (50 questions) only -- does not touch the original
// 40 from scripts/seedTrivia.mjs, so re-running this never duplicates them.
// Usage: node scripts/seedTriviaBatch1.mjs
import fs from 'fs';
import { TRIVIA_BATCH_1 } from '../lib/gamesTriviaBatch1.js';

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

const res = await fetch(`${SURL}/rest/v1/trivia_questions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
    Prefer: 'return=representation',
  },
  body: JSON.stringify(TRIVIA_BATCH_1.map(q => ({ ...q, active: true }))),
});

if (!res.ok) {
  console.error('Seed failed:', res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.log(`Inserted ${rows.length} trivia questions (${rows.filter(r => r.category === 'racing').length} racing, ${rows.filter(r => r.category === 'sports').length} sports).`);
