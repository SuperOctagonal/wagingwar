import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// Tiny deterministic string hash -> [0,1), so "today's 5 questions" are the
// same for every user (fair, and makes a future leaderboard/stats
// meaningful) without needing a stored daily-selection table.
function seededFraction(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return ((h >>> 0) % 100000) / 100000;
}

function pickDaily(questions, category, date, count) {
  return questions
    .filter(q => q.category === category)
    .map(q => ({ q, r: seededFraction(`${date}|${category}|${q.id}`) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, count)
    .map(x => x.q);
}

async function sb(path) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) { console.error('[games/trivia]', path, res.status, await res.text()); return null; }
  return res.json();
}

// GET: today's 5 racing + 5 sports questions, correct_option stripped
// (never sent to the client before an answer is submitted -- see
// app/api/games/trivia/submit/route.js for the server-side check), plus
// which ones this user has already answered today.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const date = todayISO();
  const [all, attempts] = await Promise.all([
    sb('trivia_questions?active=eq.true&select=id,category,question,options,difficulty'),
    sb(`trivia_attempts?clerk_id=eq.${encodeURIComponent(userId)}&date=eq.${date}&select=question_id,correct,category`),
  ]);
  if (!all) return NextResponse.json({ error: 'Failed to load questions' }, { status: 502 });

  const racing = pickDaily(all, 'racing', date, 5);
  const sports = pickDaily(all, 'sports', date, 5);
  const answeredIds = new Set((attempts || []).map(a => a.question_id));

  const shape = q => ({ ...q, answered: answeredIds.has(q.id) });
  return NextResponse.json({
    date,
    racing: racing.map(shape),
    sports: sports.map(shape),
    attempts: attempts || [],
  });
}
