import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { earnCredits } from '@/lib/credits';
import { AU_VENUE_STATE } from '@/lib/venues';
import { getVenueHint } from '@/lib/venueHints';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_GUESSES = 6;
const BASE_PUZZLE_CREDITS = 30;
const STREAK_BONUS_PER_DAY = 5;
const STREAK_BONUS_CAP = 50;

// "Guess the venue" -- a Wordle-style daily puzzle reusing the venue
// allowlist that already exists for the racing data pipeline (lib/venues.js),
// rather than inventing a separate word list. Restricted to single-word,
// reasonable-length venue names so the letter-grid UI stays sane.
const CANDIDATE_WORDS = Object.keys(AU_VENUE_STATE).filter(v => !v.includes(' ') && v.length >= 5 && v.length <= 10);

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}
function yesterdayISO() {
  return new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}
function seededIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return (h >>> 0) % mod;
}
function wordForDate(date) {
  return CANDIDATE_WORDS[seededIndex(date, CANDIDATE_WORDS.length)];
}

// Wordle-style per-letter feedback: 'correct' (right letter, right spot),
// 'present' (in the word, wrong spot), 'absent'. Handles duplicate letters
// the standard way (present/correct counts don't exceed the letter's
// actual occurrences in the target).
function scoreGuess(guess, target) {
  const g = guess.toUpperCase().padEnd(target.length, ' ').slice(0, target.length);
  const result = new Array(target.length).fill('absent');
  const targetLetters = target.split('');
  const used = new Array(target.length).fill(false);

  for (let i = 0; i < target.length; i++) {
    if (g[i] === targetLetters[i]) { result[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < target.length; i++) {
    if (result[i] === 'correct') continue;
    const idx = targetLetters.findIndex((l, j) => l === g[i] && !used[j]);
    if (idx !== -1) { result[i] = 'present'; used[idx] = true; }
  }
  return result;
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { console.error('[games/puzzle/daily]', opts.method || 'GET', path, res.status, await res.text()); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// GET: today's word length + whether this user has already completed
// today's puzzle (one attempt/day, per the spec) -- never the word itself.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const date = todayISO();
  const word = wordForDate(date);
  const existing = await sb(`puzzle_scores?clerk_id=eq.${encodeURIComponent(userId)}&game_type=eq.daily_puzzle&date=eq.${date}&select=score`);
  return NextResponse.json({
    date,
    wordLength: word.length,
    maxGuesses: MAX_GUESSES,
    completed: !!(existing && existing.length),
    score: existing?.[0]?.score ?? null,
    // Category-level hint, safe to send unconditionally -- it never gives
    // away the word itself (see lib/venueHints.js), just narrows the
    // category the way a crossword clue does.
    hint: getVenueHint(word, AU_VENUE_STATE[word]),
  });
}

// POST: two actions --
//  { action: 'guess', guess }     -> per-letter feedback for one guess
//  { action: 'complete', won, guessCount } -> records today's result once,
//    applies streak bonus, awards credits. Guarded by a SELECT-before-INSERT
//    (no unique DB constraint, since track_dash intentionally allows many
//    rows/day in the same table -- see app/api/games/puzzle/trackdash).
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const date = todayISO();
  const word = wordForDate(date);

  if (body.action === 'guess') {
    const guess = (body.guess || '').toUpperCase().trim();
    if (guess.length !== word.length) return NextResponse.json({ error: `Guess must be ${word.length} letters` }, { status: 400 });
    const feedback = scoreGuess(guess, word);
    const won = guess === word;
    return NextResponse.json({ feedback, won });
  }

  if (body.action === 'complete') {
    const existing = await sb(`puzzle_scores?clerk_id=eq.${encodeURIComponent(userId)}&game_type=eq.daily_puzzle&date=eq.${date}&select=score`);
    if (existing && existing.length) return NextResponse.json({ error: 'Already completed today' }, { status: 409 });

    const won = !!body.won;
    const guessCount = Math.max(1, Math.min(MAX_GUESSES, +body.guessCount || MAX_GUESSES));
    const score = won ? (MAX_GUESSES + 1 - guessCount) : 0; // fewer guesses = higher score

    await sb('puzzle_scores', { method: 'POST', prefer: 'return=minimal', body: { clerk_id: userId, game_type: 'daily_puzzle', score, date } });

    let awarded = 0, balance = null;
    if (won) {
      const account = await sb(`user_credits?clerk_id=eq.${encodeURIComponent(userId)}&select=login_streak`);
      // Reuses login_streak as a rough proxy for "consecutive days active"
      // for the puzzle streak bonus -- there's no separate puzzle-specific
      // streak column in the schema, and tying the bonus to the same daily
      // engagement streak the login system already tracks is a reasonable,
      // simple choice rather than adding a new column for this alone.
      const streak = account?.[0]?.login_streak || 1;
      const bonus = Math.min((streak - 1) * STREAK_BONUS_PER_DAY, STREAK_BONUS_CAP);
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const isPro = user?.publicMetadata?.plan === 'pro';
      const result = await earnCredits(userId, BASE_PUZZLE_CREDITS + bonus, 'daily_puzzle', { isPro });
      awarded = result.awarded;
      balance = result.balance;
    }

    return NextResponse.json({ recorded: true, score, awarded, balance, word: won ? undefined : word });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
