'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsMobile from '@/hooks/useIsMobile';
import { fetchDisplayNames } from '@/lib/displayNames';
import { punterFallback } from '@/lib/punterFallback';
import { fetchEquippedCosmetics } from '@/lib/cosmetics';
import MainTabBar from '@/components/MainTabBar';
import Avatar from '@/components/Avatar';
import NameFlair from '@/components/NameFlair';
import StoreTab from '@/components/StoreTab';

const GOLD = '#e8b84a';
const TEXT = '#111827';
const CT_LINE = '#e5e7eb';

const MAIN_TABS = [
  { id: 'trivia', label: 'Trivia', icon: 'ti-brain' },
  { id: 'puzzle', label: 'Puzzle', icon: 'ti-puzzle' },
  { id: 'trackdash', label: 'Track Dash', icon: 'ti-run' },
  { id: 'prizes', label: 'Prizes', icon: 'ti-disc' },
  { id: 'store', label: 'Store', icon: 'ti-building-store' },
];

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) return null;
  return res.json();
}

// ─── Credits pill — shown in the header on every tab ──────────────────────
function CreditsBadge({ account }) {
  if (!account) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d2416', border: `1px solid ${GOLD}`, borderRadius: 999, padding: '6px 14px' }}>
      <i className="ti ti-coin" style={{ fontSize: 13, color: GOLD }} />
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: GOLD }}>
        {(account.balance ?? 0).toLocaleString()}
      </span>
      {account.login_streak > 1 && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>
          🔥 {account.login_streak}d streak
        </span>
      )}
    </div>
  );
}

// ─── Trivia tab ─────────────────────────────────────────────────────────
// One question at a time: current index into the combined [racing, sports]
// list, auto-advancing ~1.1s after each answer so the per-question result
// (reused from the old TriviaSet's styling) is still visible before moving
// on. Root cause of the completion summary "never appearing": it wasn't a
// logic bug (the derived allAnswered/sessionCorrect state was already
// correct) -- the old all-15-at-once layout put the summary banner above a
// long scrollable list, so a user finishing question 15 at the bottom of
// the page never scrolled back up to see it. Sequential flow removes the
// scroll entirely; the summary is simply the final screen.
function TriviaQuestionCard({ q, categoryLabel, index, total, onAnswer, answering }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          {categoryLabel} · Question {index + 1} of {total}
        </span>
      </div>
      <div style={{ background: CT_LINE, height: 4, borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${(index / total) * 100}%`, height: '100%', background: '#0d2416', transition: 'width .3s ease' }} />
      </div>
      <div style={{ background: '#fff', border: `1px solid ${CT_LINE}`, borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 14 }}>{q.question}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {q.options.map((opt, i) => {
            const isSelected = q.selected === i;
            const showResult = q.answered || q.result;
            const isCorrect = q.result && q.result.correctOption === i;
            const isWrongPick = q.result && isSelected && !q.result.correct;
            let bg = '#fff', border = CT_LINE, color = TEXT;
            if (showResult) {
              if (isCorrect) { bg = '#f0fdf4'; border = '#16a34a'; color = '#16a34a'; }
              else if (isWrongPick) { bg = '#fef2f2'; border = '#dc2626'; color = '#dc2626'; }
            }
            return (
              <button key={i} disabled={q.answered || answering}
                onClick={() => onAnswer(q, i)}
                style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: q.answered ? 'default' : 'pointer', textAlign: 'left' }}>
                {opt}
              </button>
            );
          })}
        </div>
        {q.result && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: q.result.correct ? '#16a34a' : '#dc2626' }}>
            {q.result.correct ? `+${q.result.awarded} credits` : 'Not quite — try tomorrow’s set'}
          </div>
        )}
      </div>
    </div>
  );
}

function TriviaTab({ onCreditsChange }) {
  const [data, setData] = useState(null);
  const [answering, setAnswering] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const advanceTimerRef = useRef(null);

  const load = useCallback(() => {
    api('/api/games/trivia').then(d => {
      setData(d);
      if (d) {
        const all = [...d.racing, ...d.sports];
        const firstUnanswered = all.findIndex(q => !q.answered);
        setCurrentIndex(firstUnanswered === -1 ? all.length : firstUnanswered);
      }
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current); }, []);

  const handleAnswer = useCallback(async (question, optionIndex) => {
    setAnswering(true);
    const result = await api('/api/games/trivia/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: question.id, selected_option: optionIndex }),
    });
    setAnswering(false);
    if (!result) return;
    setData(prev => {
      const patch = list => list.map(q => q.id === question.id ? { ...q, answered: true, selected: optionIndex, result } : q);
      return { ...prev, racing: patch(prev.racing), sports: patch(prev.sports) };
    });
    if (result.balance != null) onCreditsChange(result.balance);
    // Brief pause so the correct/incorrect highlight + credits line (above)
    // is actually visible before moving on, rather than an instant cut.
    advanceTimerRef.current = setTimeout(() => setCurrentIndex(i => i + 1), 1100);
  }, [onCreditsChange]);

  if (!data) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>Loading today&apos;s questions…</div>;

  // Session summary -- derived from the per-question `result` objects
  // already attached by handleAnswer (no new API call, existing inline
  // per-question feedback untouched), falling back to the GET route's
  // `attempts` for any question answered in an earlier pageload this
  // session (a mid-session reload has `answered:true` but no client-side
  // `result`, since that's only ever attached at the moment of a fresh
  // submit). CREDITS_PER_CORRECT is a fixed 10/correct (see submit route),
  // so it's safe to derive awarded credits from the correctness flag alone
  // rather than needing the original submit response for pre-reload answers.
  const attemptsMap = new Map((data.attempts || []).map(a => [a.question_id, a.correct]));
  const isCorrect = q => q.result ? q.result.correct : attemptsMap.get(q.id);
  const allQuestions = [...data.racing, ...data.sports];
  const allAnswered = allQuestions.length > 0 && allQuestions.every(q => q.answered);
  const sessionCorrect = allQuestions.filter(q => q.answered && isCorrect(q)).length;
  const sessionAwarded = sessionCorrect * 10;
  const sessionAccuracy = allQuestions.length ? Math.round(sessionCorrect / allQuestions.length * 100) : 0;

  const currentQuestion = allQuestions[currentIndex];
  const categoryLabel = currentIndex < data.racing.length ? 'Racing' : 'Sports';

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          {data.racing.length} racing + {data.sports.length} sports questions daily · 10 credits per correct answer · resets at midnight AEST
        </div>
        {sessionAwarded > 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, fontFamily: 'JetBrains Mono, monospace' }}>+{sessionAwarded} this set</div>
        )}
      </div>

      {allAnswered ? (
        <div style={{ background: '#0d2416', borderRadius: 10, padding: '16px 18px', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: GOLD, fontFamily: 'JetBrains Mono, monospace' }}>{sessionCorrect}/{allQuestions.length}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>Correct</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: GOLD, fontFamily: 'JetBrains Mono, monospace' }}>+{sessionAwarded}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>Credits earned</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: GOLD, fontFamily: 'JetBrains Mono, monospace' }}>{sessionAccuracy}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>Accuracy</div>
          </div>
        </div>
      ) : currentQuestion ? (
        <TriviaQuestionCard
          key={currentQuestion.id}
          q={currentQuestion}
          categoryLabel={categoryLabel}
          index={currentIndex}
          total={allQuestions.length}
          onAnswer={handleAnswer}
          answering={answering}
        />
      ) : null}
    </div>
  );
}

// ─── Daily Puzzle (Wordle-style "guess the venue") ────────────────────────
function DailyPuzzle({ onCreditsChange }) {
  const [status, setStatus] = useState(null);
  const [guesses, setGuesses] = useState([]); // [{ guess, feedback }]
  const [current, setCurrent] = useState('');
  const [won, setWon] = useState(false);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revealedWord, setRevealedWord] = useState(null);

  useEffect(() => { api('/api/games/puzzle/daily').then(s => { setStatus(s); setFinished(!!s?.completed); }); }, []);

  const submitGuess = useCallback(async () => {
    if (!status || current.length !== status.wordLength || submitting) return;
    setSubmitting(true);
    const result = await api('/api/games/puzzle/daily', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'guess', guess: current }),
    });
    setSubmitting(false);
    if (!result) return;
    const newGuesses = [...guesses, { guess: current.toUpperCase(), feedback: result.feedback }];
    setGuesses(newGuesses);
    setCurrent('');

    if (result.won || newGuesses.length >= status.maxGuesses) {
      setWon(!!result.won);
      const completeResult = await api('/api/games/puzzle/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', won: !!result.won, guessCount: newGuesses.length }),
      });
      setFinished(true);
      // Server only ever includes `word` when the puzzle wasn't won (see
      // that route's POST /complete) -- nothing to reveal on a win, the
      // guess grid already shows it.
      if (completeResult?.word) setRevealedWord(completeResult.word);
      if (completeResult?.balance != null) onCreditsChange(completeResult.balance);
    }
  }, [status, current, guesses, submitting, onCreditsChange]);

  if (!status) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>Loading today&apos;s puzzle…</div>;

  const letterBg = f => f === 'correct' ? '#16a34a' : f === 'present' ? '#e8b84a' : '#9ca3af';

  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Guess the Venue</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
        {status.wordLength} letters · {status.maxGuesses} guesses · one attempt per day
      </div>
      {status.hint && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: `1px solid ${CT_LINE}`, borderRadius: 6, padding: '7px 10px', marginBottom: 16, fontSize: 12, color: '#374151' }}>
          <i className="ti ti-bulb" style={{ fontSize: 13, color: GOLD, flexShrink: 0 }} />
          <span><strong>Hint:</strong> {status.hint}</span>
        </div>
      )}

      {status.completed && !guesses.length ? (
        <div style={{ fontSize: 12, color: '#6b7280' }}>You&apos;ve already played today&apos;s puzzle — come back tomorrow.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {guesses.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                {g.guess.split('').map((ch, j) => (
                  <div key={j} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: letterBg(g.feedback[j]), color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    {ch}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {guesses.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, fontSize: 10, color: '#6b7280', flexWrap: 'wrap' }}>
              {[['correct', 'Correct letter & spot'], ['present', 'Correct letter, wrong spot'], ['absent', 'Not in the word']].map(([f, label]) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: letterBg(f) }} />
                  {label}
                </div>
              ))}
            </div>
          )}

          {!finished && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={current}
                onChange={e => setCurrent(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, status.wordLength))}
                onKeyDown={e => e.key === 'Enter' && submitGuess()}
                placeholder={`${status.wordLength}-letter venue`}
                style={{ flex: 1, border: `1px solid ${CT_LINE}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, letterSpacing: 2, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}
              />
              <button onClick={submitGuess} disabled={current.length !== status.wordLength || submitting}
                style={{ padding: '8px 18px', background: '#0d2416', color: GOLD, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: current.length !== status.wordLength ? 0.5 : 1 }}>
                Guess
              </button>
            </div>
          )}

          {finished && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: won ? '#16a34a' : '#dc2626' }}>
                {won ? `Solved in ${guesses.length}! Credits added.` : 'Out of guesses — see you tomorrow.'}
              </div>
              {!won && revealedWord && (
                <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>The venue was</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#991b1b', letterSpacing: 2, fontFamily: 'JetBrains Mono, monospace' }}>{revealedWord}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Track Dash sprite art ──────────────────────────────────────────────────
// Real sprite assets (CC0, no attribution required) -- see
// public/games/trackdash/CREDITS.md for the exact source pack + license of
// each file. Loaded once at module scope (not per-render) since these are
// small, static, session-long assets.
//
// horse_run.png was re-processed after the first ship: the OpenGameArt
// source, despite being an RGBA PNG, had every pixel's alpha baked to 255 --
// i.e. a fake "transparent" background that was actually solid opaque white
// (confirmed by reading the raw pixel buffer, not just the PNG color-type
// byte). That's what rendered as a white box behind the horse. Fixed by
// chroma-keying pure-white pixels to alpha 0 (with a short falloff band for
// anti-aliased edge pixels) and re-saving losslessly -- the horse's own
// palette (browns + black) never touches white, so nothing of the actual art
// was at risk. The four Kenney obstacle PNGs already had real alpha
// channels; nothing needed doing there.
const SPRITE_BASE = '/games/trackdash';
const HORSE_SRC = `${SPRITE_BASE}/horse_run.png`;
// 5-frame run cycle, 82x66 per frame, laid out in a single horizontal strip.
const HORSE_FRAME_W = 82, HORSE_FRAME_H = 66, HORSE_FRAMES = 5;
const HORSE_ASPECT = HORSE_FRAME_W / HORSE_FRAME_H;

function loadSprite(src) {
  if (typeof window === 'undefined') return null;
  const img = new window.Image();
  img.src = src;
  return img;
}

const horseSprite = loadSprite(HORSE_SRC);

// Racing-themed obstacles (hay bale, hurdle) mixed with lighthearted ones
// (traffic cone, ball) for variety -- one is chosen at random per spawn (see
// start()'s spawn logic below). `w`/`h` now match each source PNG's real
// pixel aspect ratio (the first ship forced several square source images
// into portrait boxes, distorting them) -- see each sprite's real dimensions
// in public/games/trackdash/CREDITS.md.
//
// `hit` is a per-side inset (fraction of w/h) shrinking the *collision* box
// away from the drawn box -- draw size is unaffected. Measured directly from
// each PNG's alpha channel (fraction of the box that's actually transparent
// padding on that side), then padded a further ~5-8% for a forgiving margin
// (standard runner-game practice: the hitbox should read as slightly more
// generous than the art, never a "why did that count" moment). Most of these
// sprites already fill their box tightly -- hurdle's real art starts ~27%
// down from the top of its box (the fence posts don't reach the top), so
// that's the one obstacle that needed a real inset; the rest get a small
// uniform margin only.
const NO_INSET = { l: 0.08, r: 0.08, t: 0.08, b: 0.08 };
const OBSTACLE_TYPES = [
  { key: 'haybale',   w: 46, h: 46, sprite: loadSprite(`${SPRITE_BASE}/obstacle_haybale.png`), hit: NO_INSET },
  { key: 'hurdle',    w: 46, h: 46, sprite: loadSprite(`${SPRITE_BASE}/obstacle_hurdle.png`), hit: { l: 0.06, r: 0.06, t: 0.22, b: 0.06 } },
  { key: 'cone',      w: 36, h: 35, sprite: loadSprite(`${SPRITE_BASE}/obstacle_cone.png`), hit: NO_INSET },
  { key: 'beachball', w: 30, h: 30, sprite: loadSprite(`${SPRITE_BASE}/obstacle_ball.png`), hit: NO_INSET },
];

// Player hitbox inset -- measured from horse_run.png's alpha channel across
// all 5 run-cycle frames (the union of where the horse's body/legs/head
// ever actually are, so a mid-stride leg extension never gets clipped by
// too-tight an inset): real art occupies roughly x 22-77 of 82 and y 26-56
// of 66 within the frame. That's a LOT of transparent padding (the previous
// hitbox was the full drawn box, which is what made collisions feel
// unfairly early after the redesign scaled the box up without touching
// this). Padded a couple more percent past the measured art edges for a
// forgiving margin, same reasoning as the obstacle insets above.
const PLAYER_HIT = { l: 0.24, r: 0.08, t: 0.34, b: 0.14 };

// Gap between obstacle spawns -- randomized around a speed-scaled baseline
// rather than the fixed deterministic curve the game shipped with (which
// made spacing fully predictable once you learned the curve). `elapsed` is
// the run's elapsed ms, same input the old fixed formula used, so the
// baseline still tightens as the run speeds up. The random factor widens
// spacing out in both directions -- never so tight it's unfair (hard floor
// below), never so loose it reads as dead time (1.5x ceiling on a baseline
// that's already shrinking).
function rollSpawnGap(elapsedMs) {
  const baseline = Math.max(700, 1400 - elapsedMs / 20);
  const gap = baseline * (0.7 + Math.random() * 0.8); // random in [0.7x, 1.5x] of baseline
  return Math.max(500, gap);
}

// Player runs left-to-right through the scene (obstacles approach from the
// right), but the source sprite sheet faces left -- flipped here via
// scale(-1,1) around the sprite's own right edge rather than baking a
// mirrored copy of the asset, so the single source file stays the source of
// truth.
function drawHorse(ctx, x, y, w, h, elapsedMs) {
  if (!horseSprite || !horseSprite.complete || !horseSprite.naturalWidth) return;
  const frame = Math.floor(elapsedMs / 80) % HORSE_FRAMES;
  ctx.save();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(horseSprite, frame * HORSE_FRAME_W, 0, HORSE_FRAME_W, HORSE_FRAME_H, 0, 0, w, h);
  ctx.restore();
}

function drawObstacle(ctx, sprite, x, yTop, w, h) {
  if (!sprite || !sprite.complete || !sprite.naturalWidth) return;
  ctx.drawImage(sprite, x, yTop, w, h);
}

// ─── Track Dash scene layers ────────────────────────────────────────────────
// Fixed logical coordinate space the game always draws in; the canvas
// element is scaled to the actual container width via CSS (aspectRatio),
// so this never needs to know its real on-screen pixel size.
const SCENE_W = 1200, SCENE_H = 260;
// Every band below fills its own full rect before anything is drawn on top
// of it, so there's no way for a gap to open between bands regardless of
// bump/post/mark shapes -- the first ship had exactly that bug (hill bumps
// were drawn as a silhouette *inside* the sky rect instead of the hill band
// owning its own filled rect, leaving an unpainted strip between sky and
// fence).
const SKY_TOP = 0, SKY_H = 80;                    // sky: 0..80
const HILL_TOP = SKY_H, HILL_H = 70;              // hills: 80..150
const FENCE_TOP = HILL_TOP + HILL_H, FENCE_H = 46; // fence: 150..196
const FENCE_BOTTOM = FENCE_TOP + FENCE_H;
const RAIL_Y = FENCE_BOTTOM;                       // gold rail marking the running line
const RAIL_H = 3;
const DIRT_TOP = RAIL_Y + RAIL_H;                  // dirt: ..260
const FOOT_LINE = DIRT_TOP + 14;                   // where feet / obstacle bases actually rest

const SKY_TOP_COLOR = '#0a1a12', SKY_BOTTOM_COLOR = '#173a27';
const HILL_BASE_COLOR = '#173a27';
const HILL_COLOR = '#0d2416';
const FENCE_COLOR = '#1c4d2e';
const POST_COLOR = '#0d2416';
const DIRT_COLOR = '#5c4028';
const DIRT_MARK_COLOR = 'rgba(0,0,0,0.18)';

// Deterministic pseudo-random ground-texture marks (fixed seed layout,
// scrolled at render time) -- avoids re-rolling Math.random() every frame,
// which would make the dirt band flicker instead of scroll.
const DIRT_MARKS = Array.from({ length: 26 }, (_, i) => ({
  xFrac: (i * 197 % 997) / 997,
  yFrac: (i * 71 % 131) / 131,
  w: 6 + (i % 4) * 2,
}));
const HILL_BUMPS = Array.from({ length: 8 }, (_, i) => ({
  h: 32 + (i % 3) * 16,
  w: 220,
}));

// Clouds -- simple flat puffs (each just 3 overlapping circles, one fill
// colour, no gradients/outlines) tiled across a fixed-width repeat unit so
// they scroll seamlessly, same tiling technique as the hill band but at a
// much slower parallax rate (clouds read as further away / higher up than
// the hills). 3 per repeat unit, unit repeated 3x across SCENE_W's width in
// draw() the same way HILL_BUMPS is, so it always covers the canvas plus a
// margin on both sides regardless of scroll offset.
const CLOUD_UNIT_W = 520;
const CLOUDS = [
  { cx: 90,  cy: 22, scale: 1.0 },
  { cx: 260, cy: 40, scale: 0.7 },
  { cx: 420, cy: 16, scale: 0.85 },
];
const CLOUD_COLOR = 'rgba(210, 222, 228, 0.14)';

function drawCloud(ctx, cx, cy, scale) {
  const r = 11 * scale;
  ctx.beginPath();
  ctx.arc(cx - r * 1.1, cy + r * 0.3, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 1.2, cy + r * 0.25, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function drawScene(ctx, scrollPx) {
  // Sky
  const skyGrad = ctx.createLinearGradient(0, SKY_TOP, 0, SKY_H);
  skyGrad.addColorStop(0, SKY_TOP_COLOR);
  skyGrad.addColorStop(1, SKY_BOTTOM_COLOR);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, SKY_TOP, SCENE_W, SKY_H);

  // Clouds -- flat, subtle, drift very slowly (far slower than the hills)
  ctx.fillStyle = CLOUD_COLOR;
  const cloudShift = (scrollPx * 0.03) % CLOUD_UNIT_W;
  for (let u = -1; u <= Math.ceil(SCENE_W / CLOUD_UNIT_W) + 1; u++) {
    const unitX = u * CLOUD_UNIT_W - cloudShift;
    CLOUDS.forEach(c => drawCloud(ctx, unitX + c.cx, c.cy, c.scale));
  }

  // Hill/skyline band -- base rect filled first so the band can never show
  // a gap, then bump silhouettes drawn on top with peaks touching the
  // sky/hill seam and bases sitting on the hill/fence seam. Slow parallax
  // (much slower than the foreground) so it reads as distant background.
  ctx.fillStyle = HILL_BASE_COLOR;
  ctx.fillRect(0, HILL_TOP, SCENE_W, HILL_H);
  const bumpW = HILL_BUMPS[0].w;
  const hillShift = (scrollPx * 0.12) % bumpW;
  const tiled = HILL_BUMPS.concat(HILL_BUMPS, HILL_BUMPS);
  const hillBase = HILL_TOP + HILL_H;
  ctx.fillStyle = HILL_COLOR;
  ctx.beginPath();
  ctx.moveTo(-hillShift - bumpW, hillBase);
  tiled.forEach((b, i) => {
    const cx = -hillShift + i * b.w - bumpW;
    ctx.quadraticCurveTo(cx, hillBase - b.h, cx + b.w / 2, hillBase);
  });
  ctx.lineTo(SCENE_W + bumpW * 2, hillBase);
  ctx.closePath();
  ctx.fill();

  // Fence/track band
  ctx.fillStyle = FENCE_COLOR;
  ctx.fillRect(0, FENCE_TOP, SCENE_W, FENCE_H);
  const postSpacing = 60;
  const postShift = scrollPx % postSpacing;
  ctx.fillStyle = POST_COLOR;
  for (let x = -postShift; x < SCENE_W + postSpacing; x += postSpacing) {
    ctx.fillRect(x, FENCE_TOP, 5, FENCE_H);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, FENCE_TOP + 14, SCENE_W, 2);
  ctx.fillRect(0, FENCE_BOTTOM - 16, SCENE_W, 2);

  // Gold rail stripe marking the running line
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, RAIL_Y, SCENE_W, RAIL_H);

  // Dirt/ground band with scattered texture marks, scrolled at full
  // foreground speed so it reads as the ground the horse is running on.
  ctx.fillStyle = DIRT_COLOR;
  ctx.fillRect(0, DIRT_TOP, SCENE_W, SCENE_H - DIRT_TOP);
  ctx.fillStyle = DIRT_MARK_COLOR;
  const markShift = scrollPx % SCENE_W;
  DIRT_MARKS.forEach(m => {
    let x = m.xFrac * SCENE_W - markShift;
    x = ((x % SCENE_W) + SCENE_W) % SCENE_W;
    const y = DIRT_TOP + 6 + m.yFrac * (SCENE_H - DIRT_TOP - 12);
    ctx.fillRect(x, y, m.w, 2);
  });
}

// ─── Track Dash — canvas endless runner ────────────────────────────────────
function TrackDash({ onCreditsChange }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [highScore, setHighScore] = useState(0);

  const W = SCENE_W, H = SCENE_H;
  const GROUND = FOOT_LINE; // top-of-box y when the player is resting on the ground
  const PLAYER_H = 76, PLAYER_W = Math.round(PLAYER_H * HORSE_ASPECT);
  const PLAYER_X = Math.round(W * 0.075);
  // Canvas is ~2.14x wider than the original 560px design -- scale
  // horizontal speed by the same factor so obstacles take the same amount
  // of *time* to cross the screen (same difficulty/pacing), not the same
  // pixel distance.
  const SPEED_SCALE = W / 560;

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s && s.player.y >= GROUND - PLAYER_H && s.running) s.player.vy = -9;
  }, [GROUND, PLAYER_H]);

  useEffect(() => {
    function onKey(e) { if (e.code === 'Space') { e.preventDefault(); jump(); } }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  const start = useCallback(() => {
    setLastResult(null);
    setPlaying(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // crisp pixel-art scaling
    const playerRestY = GROUND - PLAYER_H;
    const s = {
      running: true,
      player: { x: PLAYER_X, y: playerRestY, vy: 0 },
      obstacles: [],
      cleared: 0,
      speed: 4 * SPEED_SCALE,
      elapsed: 0,
      lastSpawn: 0,
      nextSpawnGap: rollSpawnGap(0),
      scroll: 0,
    };
    stateRef.current = s;

    let raf;
    let lastTs = performance.now();
    function loop(ts) {
      const dt = Math.min(32, ts - lastTs);
      lastTs = ts;
      if (!s.running) return;

      s.elapsed += dt;
      s.speed = SPEED_SCALE * (4 + s.elapsed / 4000); // gradually speeds up
      s.scroll += s.speed;
      s.player.vy += 0.5;
      s.player.y = Math.min(playerRestY, s.player.y + s.player.vy);
      if (s.player.y >= playerRestY) { s.player.y = playerRestY; s.player.vy = 0; }

      s.lastSpawn += dt;
      if (s.lastSpawn > s.nextSpawnGap) {
        s.lastSpawn = 0;
        s.nextSpawnGap = rollSpawnGap(s.elapsed);
        const t = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
        s.obstacles.push({ x: W, w: t.w, h: t.h, sprite: t.sprite, hit: t.hit, cleared: false });
      }
      s.obstacles.forEach(o => { o.x -= s.speed; });
      s.obstacles = s.obstacles.filter(o => o.x > -60);

      // Collision uses inset hitboxes (see PLAYER_HIT / OBSTACLE_TYPES[].hit)
      // -- shrunk from the drawn box to match each sprite's actual visible
      // art, not its full transparent-padded bounding box. Draw calls below
      // still use the untouched full px/py/pw/ph and ox/oy/ow/oh.
      const px = s.player.x, py = s.player.y, pw = PLAYER_W, ph = PLAYER_H;
      const phx = px + pw * PLAYER_HIT.l, phy = py + ph * PLAYER_HIT.t;
      const phw = pw * (1 - PLAYER_HIT.l - PLAYER_HIT.r), phh = ph * (1 - PLAYER_HIT.t - PLAYER_HIT.b);
      for (const o of s.obstacles) {
        const ox = o.x, oy = GROUND - o.h, ow = o.w, oh = o.h;
        const ohx = ox + ow * o.hit.l, ohy = oy + oh * o.hit.t;
        const ohw = ow * (1 - o.hit.l - o.hit.r), ohh = oh * (1 - o.hit.t - o.hit.b);
        if (phx < ohx + ohw && phx + phw > ohx && phy < ohy + ohh && phy + phh > ohy) {
          s.running = false;
        }
        if (!o.cleared && ox + ow < px) { o.cleared = true; s.cleared += 1; }
      }

      drawScene(ctx, s.scroll);
      drawHorse(ctx, px, py, pw, ph, s.elapsed);
      s.obstacles.forEach(o => drawObstacle(ctx, o.sprite, o.x, GROUND - o.h, o.w, o.h));

      // HUD — score + in-run clear streak, overlaid top-left of the scene.
      ctx.font = '700 22px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(`${Math.floor(s.elapsed / 100)}`, 22, 40);
      ctx.fillStyle = GOLD;
      ctx.fillText(`${Math.floor(s.elapsed / 100)}`, 20, 38);
      ctx.font = '700 13px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(`STREAK ${s.cleared}`, 22, 60);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`STREAK ${s.cleared}`, 20, 58);

      if (s.running) { raf = requestAnimationFrame(loop); }
      else {
        setPlaying(false);
        const score = Math.floor(s.elapsed / 100);
        setHighScore(h => Math.max(h, score));
        api('/api/games/puzzle/trackdash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) })
          .then(r => { if (r) { setLastResult({ score, ...r }); if (r.balance != null) onCreditsChange(r.balance); } });
      }
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onCreditsChange, GROUND, PLAYER_H, PLAYER_W, PLAYER_X, SPEED_SCALE, W]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Track Dash</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
        Space / tap to jump · unlimited plays · credits taper off after a few runs each day
      </div>
      <canvas ref={canvasRef} width={W} height={H} onClick={jump}
        style={{ width: '100%', aspectRatio: `${W} / ${H}`, borderRadius: 10, border: `1px solid ${CT_LINE}`, cursor: 'pointer', display: 'block' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button onClick={start} disabled={playing}
          style={{ padding: '8px 18px', background: '#0d2416', color: GOLD, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: playing ? 'default' : 'pointer', opacity: playing ? 0.5 : 1 }}>
          {playing ? 'Running…' : 'Start run'}
        </button>
        {highScore > 0 && <span style={{ fontSize: 11, color: '#6b7280' }}>Best this session: <b>{highScore}</b></span>}
      </div>
      {lastResult && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#374151' }}>
          Score {lastResult.score} · run #{lastResult.playNumber} today
          {lastResult.awarded > 0 ? <span style={{ color: '#16a34a', fontWeight: 700 }}> · +{lastResult.awarded} credits</span> : <span style={{ color: '#9ca3af' }}> · no credits this run (daily cap reached)</span>}
        </div>
      )}
    </div>
  );
}

function PuzzleLeaderboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api('/api/games/leaderboard?game_type=track_dash').then(async d => {
      if (!d) return;
      const [nameMap, cosmeticsMap] = await Promise.all([
        fetchDisplayNames(d.rows.map(r => r.clerk_id)),
        fetchEquippedCosmetics(d.rows.map(r => r.clerk_id)),
      ]);
      setRows(d.rows.map(r => ({ ...r, name: nameMap[r.clerk_id] || punterFallback(r.clerk_id), cosmetics: cosmeticsMap[r.clerk_id] })));
    });
  }, []);
  if (!rows.length) return null;
  return (
    <div style={{ padding: '0 16px 16px', maxWidth: 420 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
        Track Dash — Today&apos;s Top Scores
      </div>
      {rows.slice(0, 10).map((r, i) => (
        <div key={r.clerk_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 9 ? `1px solid ${CT_LINE}` : 'none' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', width: 18 }}>#{i + 1}</span>
          <Avatar profile={{ display_name: r.name }} size={18} border={r.cosmetics?.border?.style} />
          <span style={{ flex: 1 }}><NameFlair name={r.name} flair={r.cosmetics?.flair?.style} fontSize={12} fontWeight={400} color={TEXT} /></span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12 }}>{r.score}</span>
        </div>
      ))}
    </div>
  );
}


// Order must match lib/wheel.js's PRIZE_TABLE exactly -- purely a display
// label, the server has already decided the actual prize before this ever
// renders. Plain reward language throughout ("received", "reward"), never
// "won"/"jackpot"/"bet" -- this is a loyalty spin, not a betting mechanic.
// Two alternating brand colours (no red/gold-heavy casino palette, no
// suit/chip/card iconography anywhere in this component) -- teal and dark
// green only, gold reserved for the ring/hub/pointer trim, same restraint
// as the rest of this page.
const WHEEL_TEAL = '#0F6E56';
const WHEEL_DARK_GREEN = '#173404';
const WHEEL_SEGMENTS = [
  { label: '+10 Credits' },
  { label: '+25 Credits' },
  { label: '+50 Credits' },
  { label: '+100 Credits' },
  { label: 'Streak Shield' },
  { label: 'Loyal Punter Badge' },
];

function segmentIndexForPrize(prize) {
  if (prize.type === 'credits') return WHEEL_SEGMENTS.findIndex(s => s.label === `+${prize.value} Credits`);
  if (prize.type === 'streak_shield') return 4;
  if (prize.type === 'badge') return 5;
  return 0;
}

// 340px wheel, precise 60deg segments (360 / 6, exact, no eyeballing).
// Every label sits at the identical LABEL_RADIUS and is positioned by the
// identical trig formula (only `i` changes), so all six are uniform --
// angle measured clockwise from 12 o'clock to match the wheel's own
// rotate(deg) convention, x/y from actual sin/cos rather than a hand-tuned
// translate() pixel offset.
const WHEEL_SIZE = 340;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const LABEL_RADIUS = WHEEL_RADIUS * 0.62;
const SEGMENT_DEG = 360 / WHEEL_SEGMENTS.length; // 60, exact

function labelPosition(index) {
  const midAngleDeg = index * SEGMENT_DEG + SEGMENT_DEG / 2;
  const rad = (midAngleDeg * Math.PI) / 180;
  const x = LABEL_RADIUS * Math.sin(rad);
  const y = -LABEL_RADIUS * Math.cos(rad);
  return { x, y };
}

function PrizeWheel({ status, onSpin, spinning, rotation }) {
  const gradient = WHEEL_SEGMENTS
    .map((_, i) => `${i % 2 === 0 ? WHEEL_TEAL : WHEEL_DARK_GREEN} ${i * SEGMENT_DEG}deg ${(i + 1) * SEGMENT_DEG}deg`)
    .join(', ');
  // Thicker dark dividers at each of the 6 exact segment boundaries
  // (0/60/120/180/240/300deg), drawn as radial lines from the hub to the
  // rim rather than relying on the conic-gradient's own (thin, antialiased)
  // colour seam.
  const dividerAngles = Array.from({ length: WHEEL_SEGMENTS.length }, (_, i) => i * SEGMENT_DEG);

  return (
    <div style={{ position: 'relative', width: WHEEL_SIZE, height: WHEEL_SIZE, margin: '0 auto' }}>
      {/* Gold outer ring */}
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: GOLD, padding: 6, boxSizing: 'border-box',
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%', position: 'relative', overflow: 'hidden',
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 3s cubic-bezier(0.17, 0.67, 0.2, 1)' : 'none',
        }}>
          {dividerAngles.map(angle => (
            <div key={angle} style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 3, height: WHEEL_RADIUS,
              background: WHEEL_DARK_GREEN,
              transformOrigin: '50% 0%',
              transform: `translate(-50%, 0) rotate(${angle}deg)`,
            }} />
          ))}
          {WHEEL_SEGMENTS.map((s, i) => {
            const { x, y } = labelPosition(i);
            return (
              <div key={i} style={{
                position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)', width: 84,
                fontSize: 10, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.25,
              }}>
                {s.label}
              </div>
            );
          })}
          {/* Gold centre hub with dark pin */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 32, height: 32, borderRadius: '50%', background: GOLD,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: WHEEL_DARK_GREEN }} />
          </div>
        </div>
      </div>
      {/* Gold pointer at top */}
      <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `18px solid ${GOLD}`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
    </div>
  );
}

function PrizesTab({ onCreditsChange }) {
  const [status, setStatus] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);

  const load = useCallback(() => { api('/api/games/wheel').then(setStatus); }, []);
  useEffect(() => { load(); }, [load]);

  const spin = useCallback(async (source) => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const res = await api('/api/games/wheel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
    if (!res) { setSpinning(false); return; }
    const idx = segmentIndexForPrize(res.prize);
    const seg = 360 / WHEEL_SEGMENTS.length;
    // Several full turns + land in the middle of the target segment
    const targetDeg = 360 * 4 + (360 - (idx * seg + seg / 2));
    setRotation(r => r - (r % 360) + targetDeg);
    setTimeout(() => {
      setSpinning(false);
      setResult(res);
      if (res.balance != null) onCreditsChange(res.balance);
      load();
    }, 3000);
  }, [spinning, onCreditsChange, load]);

  if (!status) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Daily Loyalty Spin</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 20 }}>
        One free spin per day · resets at midnight AEST · no cash prizes, ever
      </div>

      <PrizeWheel status={status} onSpin={spin} spinning={spinning} rotation={rotation} />

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button onClick={() => spin('free')} disabled={spinning || !status.freeSpinAvailable}
          style={{ padding: '10px 28px', background: '#0d2416', color: GOLD, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: spinning || !status.freeSpinAvailable ? 'default' : 'pointer', opacity: spinning || !status.freeSpinAvailable ? 0.5 : 1 }}>
          {status.freeSpinAvailable ? 'Spin today’s wheel' : 'Come back tomorrow'}
        </button>

        {status.bonusSpinsAvailable > 0 && (
          <button onClick={() => spin('bonus')} disabled={spinning}
            style={{ padding: '8px 22px', background: '#fff', color: '#374151', border: `1px solid ${CT_LINE}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: spinning ? 'default' : 'pointer' }}>
            Use a bonus spin ({status.bonusSpinsAvailable} available)
          </button>
        )}

        {result && (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
            You received: {result.label}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#9ca3af', display: 'flex', gap: 14 }}>
          {status.streakShields > 0 && <span>🛡️ {status.streakShields} streak shield{status.streakShields !== 1 ? 's' : ''}</span>}
          {status.badges.length > 0 && <span>🏅 {status.badges.join(', ')}</span>}
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 10, color: '#9ca3af', maxWidth: 320, margin: '28px auto 0', lineHeight: 1.6 }}>
        Extra spins are earned by referring a friend — never purchasable. Prizes are bonus credits, streak protection and cosmetic badges only; nothing here is redeemable for cash.
      </div>
    </div>
  );
}

export default function GamesPage() {
  const { user, isLoaded } = useUser();
  const isMobile = useIsMobile();
  const [mainTab, setMainTab] = useState('trivia');
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    api('/api/games/credits').then(setAccount);
    // Claim today's daily-login credits once per page load -- the route
    // itself is idempotent (no-op if already claimed today), so this is
    // safe to fire unconditionally rather than needing client-side "have I
    // claimed today" state.
    api('/api/games/credits', { method: 'POST' }).then(r => {
      if (r?.claimed) setAccount(a => ({ ...a, balance: r.balance, login_streak: r.streak }));
    });
  }, [user?.id]);

  const handleCreditsChange = useCallback(balance => {
    setAccount(a => a ? { ...a, balance } : a);
  }, []);

  if (!isLoaded) return null;
  if (!user) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Sign in to play.</div>
      </main>
    );
  }

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#0d2416', padding: isMobile ? '12px 16px' : '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>🎮 Games</span>
        <CreditsBadge account={account} />
      </div>

      {/* Persistent tab bar — built as a real always-visible component from
          the start, above whichever tab is active, not a breadcrumb (see
          the Competitions "Beat the Model" tab-bar fix earlier this
          session for why that matters). Shared MainTabBar component (also
          used by Competitions' Today/Beat the Model/All-time nav) so the
          icon-tile styling lives in one place. */}
      <MainTabBar tabs={MAIN_TABS} activeId={mainTab} onSelect={setMainTab} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mainTab === 'trivia' && <TriviaTab onCreditsChange={handleCreditsChange} />}
        {mainTab === 'puzzle' && <DailyPuzzle onCreditsChange={handleCreditsChange} />}
        {mainTab === 'trackdash' && (
          <>
            <TrackDash onCreditsChange={handleCreditsChange} />
            <PuzzleLeaderboard />
          </>
        )}
        {mainTab === 'prizes' && <PrizesTab onCreditsChange={handleCreditsChange} />}
        {/* Browse (catalog + basket checkout) now exists alongside Locker,
            so the Store tab renders the real Browse/Locker picker. */}
        {mainTab === 'store' && <StoreTab />}
      </div>
    </main>
  );
}
