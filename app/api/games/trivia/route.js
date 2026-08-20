import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Daily quota, split racing/sports -- confirmed with the user against the
// original 5+5 spec when the question pool was expanded to 290.
const DAILY_RACING = 8;
const DAILY_SPORTS = 7;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// Deterministic string hash -> [0,1). Seeding with userId (not just date)
// makes the draw per-user instead of global, while staying stable across
// reloads within the same day for the same user (same inputs -> same
// order every time).
function seededFraction(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return ((h >>> 0) % 100000) / 100000;
}

// Per-user daily draw: unseen questions first (deterministically shuffled),
// topped up with the user's least-recently-seen previously-answered
// questions once the unseen pool runs low -- "cycle through most/all
// before repeating" rather than a hard cutoff or error.
function pickForUser({ questions, category, date, userId, count, lastSeenByQuestion }) {
  const inCategory = questions.filter(q => q.category === category);
  const unseen = inCategory.filter(q => !lastSeenByQuestion.has(q.id));
  const seen = inCategory.filter(q => lastSeenByQuestion.has(q.id));

  const shuffled = list => list
    .map(q => ({ q, r: seededFraction(`${userId}|${date}|${category}|${q.id}`) }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.q);

  const unseenPicked = shuffled(unseen).slice(0, count);
  if (unseenPicked.length >= count) return unseenPicked;

  // Top up from seen questions, oldest-last-answered first.
  const seenOldestFirst = seen
    .slice()
    .sort((a, b) => (lastSeenByQuestion.get(a.id) || '').localeCompare(lastSeenByQuestion.get(b.id) || ''));
  return [...unseenPicked, ...seenOldestFirst.slice(0, count - unseenPicked.length)];
}

async function sb(path) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) { console.error('[games/trivia]', path, res.status, await res.text()); return null; }
  return res.json();
}

// GET: this user's daily draw (8 racing + 7 sports), correct_option
// stripped (never sent to the client before an answer is submitted -- see
// app/api/games/trivia/submit/route.js for the server-side check).
// Per-user and repeat-avoiding -- see pickForUser above -- rather than the
// old global date-only draw every user used to see identically.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const date = todayISO();
  const [all, todayAttempts, allAttempts] = await Promise.all([
    sb('trivia_questions?active=eq.true&select=id,category,question,options,difficulty'),
    sb(`trivia_attempts?clerk_id=eq.${encodeURIComponent(userId)}&date=eq.${date}&select=question_id,correct,category`),
    // Full history (not date-filtered) -- this IS the "seen" set; no
    // separate table needed, trivia_attempts already accumulates it.
    sb(`trivia_attempts?clerk_id=eq.${encodeURIComponent(userId)}&select=question_id,date`),
  ]);
  if (!all) return NextResponse.json({ error: 'Failed to load questions' }, { status: 502 });

  // Most recent attempt date per question_id (a question can theoretically
  // have been answered on more than one past date if the pool was small
  // enough to cycle back to it).
  const lastSeenByQuestion = new Map();
  (allAttempts || []).forEach(a => {
    const prev = lastSeenByQuestion.get(a.question_id);
    if (!prev || a.date > prev) lastSeenByQuestion.set(a.question_id, a.date);
  });

  const racing = pickForUser({ questions: all, category: 'racing', date, userId, count: DAILY_RACING, lastSeenByQuestion });
  const sports = pickForUser({ questions: all, category: 'sports', date, userId, count: DAILY_SPORTS, lastSeenByQuestion });
  const answeredTodayIds = new Set((todayAttempts || []).map(a => a.question_id));

  const shape = q => ({ ...q, answered: answeredTodayIds.has(q.id) });
  return NextResponse.json({
    date,
    racing: racing.map(shape),
    sports: sports.map(shape),
    attempts: todayAttempts || [],
  });
}
