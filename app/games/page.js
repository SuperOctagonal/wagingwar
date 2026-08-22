'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import useIsMobile from '@/hooks/useIsMobile';
import { fetchDisplayNames } from '@/lib/displayNames';
import { punterFallback } from '@/lib/punterFallback';

const GOLD = '#e8b84a';
const TEXT = '#111827';
const CT_LINE = '#e5e7eb';

const MAIN_TABS = [
  { id: 'trivia', label: 'Trivia', icon: 'ti-brain' },
  { id: 'puzzle', label: 'Puzzle', icon: 'ti-puzzle' },
  { id: 'prizes', label: 'Prizes', icon: 'ti-disc' },
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
// Real sprite assets (CC0, no attribution required) replacing the previous
// canvas shape-drawing -- see public/games/trackdash/CREDITS.md for the
// exact source pack + license of each file. Loaded once at module scope
// (not per-render) since these are small, static, session-long assets.
const SPRITE_BASE = '/games/trackdash';
const HORSE_SRC = `${SPRITE_BASE}/horse_run.png`;
// 5-frame run cycle, 82x66 per frame, laid out in a single horizontal strip.
const HORSE_FRAME_W = 82, HORSE_FRAME_H = 66, HORSE_FRAMES = 5;

function loadSprite(src) {
  if (typeof window === 'undefined') return null;
  const img = new window.Image();
  img.src = src;
  return img;
}

const horseSprite = loadSprite(HORSE_SRC);

// Racing-themed obstacles (hay bale, hurdle) mixed with lighthearted ones
// (traffic cone, ball) for variety -- one is chosen at random per spawn (see
// start()'s spawn logic below). Each keeps the exact w/h bounding box the
// old shape-drawing version used, so collision math is untouched.
const OBSTACLE_TYPES = [
  { key: 'haybale',   w: 24, h: 20, sprite: loadSprite(`${SPRITE_BASE}/obstacle_haybale.png`) },
  { key: 'hurdle',    w: 22, h: 26, sprite: loadSprite(`${SPRITE_BASE}/obstacle_hurdle.png`) },
  { key: 'cone',      w: 16, h: 22, sprite: loadSprite(`${SPRITE_BASE}/obstacle_cone.png`) },
  { key: 'beachball', w: 20, h: 20, sprite: loadSprite(`${SPRITE_BASE}/obstacle_ball.png`) },
];

function drawHorse(ctx, x, y, w, h, elapsedMs) {
  if (!horseSprite || !horseSprite.complete || !horseSprite.naturalWidth) return;
  const frame = Math.floor(elapsedMs / 80) % HORSE_FRAMES;
  ctx.drawImage(
    horseSprite,
    frame * HORSE_FRAME_W, 0, HORSE_FRAME_W, HORSE_FRAME_H,
    x, y, w, h,
  );
}

function drawObstacle(ctx, sprite, x, yTop, w, h) {
  if (!sprite || !sprite.complete || !sprite.naturalWidth) return;
  ctx.drawImage(sprite, x, yTop, w, h);
}

// ─── Track Dash — minimal canvas endless runner ───────────────────────────
function TrackDash({ onCreditsChange }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [highScore, setHighScore] = useState(0);

  const W = 560, H = 180, GROUND = 140;

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s && s.player.y >= GROUND && s.running) s.player.vy = -9;
  }, []);

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
    const s = {
      running: true,
      player: { x: 40, y: GROUND, vy: 0 },
      obstacles: [],
      speed: 4,
      elapsed: 0,
      lastSpawn: 0,
    };
    stateRef.current = s;

    let raf;
    let lastTs = performance.now();
    function loop(ts) {
      const dt = Math.min(32, ts - lastTs);
      lastTs = ts;
      if (!s.running) return;

      s.elapsed += dt;
      s.speed = 4 + s.elapsed / 4000; // gradually speeds up
      s.player.vy += 0.5;
      s.player.y = Math.min(GROUND, s.player.y + s.player.vy);
      if (s.player.y >= GROUND) { s.player.y = GROUND; s.player.vy = 0; }

      s.lastSpawn += dt;
      const spawnGap = Math.max(700, 1400 - s.elapsed / 20);
      if (s.lastSpawn > spawnGap) {
        s.lastSpawn = 0;
        const t = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
        s.obstacles.push({ x: W, w: t.w, h: t.h, sprite: t.sprite });
      }
      s.obstacles.forEach(o => { o.x -= s.speed; });
      s.obstacles = s.obstacles.filter(o => o.x > -20);

      const px = s.player.x, py = s.player.y, pw = 26, ph = 26;
      for (const o of s.obstacles) {
        const ox = o.x, oy = GROUND + 26 - o.h, ow = o.w, oh = o.h;
        if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
          s.running = false;
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d2416';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, GROUND + 26, W, 2);
      drawHorse(ctx, px, py, pw, ph, s.elapsed);
      s.obstacles.forEach(o => drawObstacle(ctx, o.sprite, o.x, GROUND + 26 - o.h, o.w, o.h));
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '12px monospace';
      ctx.fillText(`${Math.floor(s.elapsed / 100)}`, 10, 16);

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
  }, [onCreditsChange]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Track Dash</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
        Space / tap to jump · unlimited plays · credits taper off after a few runs each day
      </div>
      <canvas ref={canvasRef} width={W} height={H} onClick={jump}
        style={{ width: '100%', maxWidth: W, borderRadius: 10, border: `1px solid ${CT_LINE}`, cursor: 'pointer', display: 'block' }} />
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
      const nameMap = await fetchDisplayNames(d.rows.map(r => r.clerk_id));
      setRows(d.rows.map(r => ({ ...r, name: nameMap[r.clerk_id] || punterFallback(r.clerk_id) })));
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
          <span style={{ flex: 1, fontSize: 12, color: TEXT }}>{r.name}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12 }}>{r.score}</span>
        </div>
      ))}
    </div>
  );
}

function PuzzleTab({ onCreditsChange }) {
  const [sub, setSub] = useState('daily');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
        {[{ id: 'daily', label: 'Daily Puzzle' }, { id: 'trackdash', label: 'Track Dash' }].map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: `0.5px solid ${sub === t.id ? '#111827' : CT_LINE}`, cursor: 'pointer', background: sub === t.id ? '#111827' : '#fff', color: sub === t.id ? '#fff' : '#374151' }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'daily' ? <DailyPuzzle onCreditsChange={onCreditsChange} /> : (
        <>
          <TrackDash onCreditsChange={onCreditsChange} />
          <PuzzleLeaderboard />
        </>
      )}
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
          session for why that matters). Icon + label tiles inside a
          bordered group container, not plain pills — active tab is a dark
          green fill with a gold icon and white label, inactive tabs are
          transparent with muted icon/label. */}
      <div style={{ background: '#fff', borderBottom: `0.5px solid ${CT_LINE}`, padding: '8px 16px', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: `1px solid ${CT_LINE}`, borderRadius: 10, background: '#fff' }}>
          {MAIN_TABS.map(t => {
            const active = mainTab === t.id;
            return (
              <button key={t.id} onClick={() => setMainTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: active ? '#0d2416' : 'transparent',
                }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 15, color: active ? GOLD : '#9ca3af' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#fff' : '#6b7280' }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mainTab === 'trivia' && <TriviaTab onCreditsChange={handleCreditsChange} />}
        {mainTab === 'puzzle' && <PuzzleTab onCreditsChange={handleCreditsChange} />}
        {mainTab === 'prizes' && <PrizesTab onCreditsChange={handleCreditsChange} />}
      </div>
    </main>
  );
}
