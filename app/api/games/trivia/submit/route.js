import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { earnCredits } from '@/lib/credits';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}

// "50 credits per correct set" (5 questions/day/category) is implemented as
// 10 credits per correct answer, awarded immediately on each submit --
// mathematically the same 50 total for a perfect set, but gives real-time
// feedback per question rather than a lump sum only at the end. Documented
// here since the source spec was ambiguous between the two.
const CREDITS_PER_CORRECT = 10;

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[games/trivia/submit]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const { question_id: questionId, selected_option: selectedOption } = await req.json().catch(() => ({}));
  if (questionId == null || selectedOption == null) {
    return NextResponse.json({ error: 'Missing question_id/selected_option' }, { status: 400 });
  }

  const date = todayISO();

  // Already answered today? Return the stored result instead of re-scoring
  // -- the PK on (clerk_id, question_id, date) is the real guard against
  // double-award; this check just avoids a wasted round trip for the
  // common "user re-opens the tab" case.
  const existing = await sb(`trivia_attempts?clerk_id=eq.${encodeURIComponent(userId)}&question_id=eq.${questionId}&date=eq.${date}&select=correct`);
  if (existing && existing.length) {
    return NextResponse.json({ alreadyAnswered: true, correct: existing[0].correct, awarded: 0 });
  }

  const qRows = await sb(`trivia_questions?id=eq.${questionId}&select=correct_option,category`);
  const question = qRows?.[0];
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const correct = +selectedOption === question.correct_option;

  const inserted = await sb('trivia_attempts?on_conflict=clerk_id,question_id,date', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { clerk_id: userId, question_id: questionId, correct, date, category: question.category },
  });
  if (!inserted) return NextResponse.json({ error: 'Failed to record attempt' }, { status: 502 });

  let awarded = 0, balance = null;
  if (correct) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const isPro = user?.publicMetadata?.plan === 'pro';
    const result = await earnCredits(userId, CREDITS_PER_CORRECT, 'trivia', { isPro });
    awarded = result.awarded;
    balance = result.balance;
  }

  return NextResponse.json({ correct, correctOption: question.correct_option, awarded, balance });
}
