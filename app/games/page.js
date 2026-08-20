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
  { id: 'trivia', label: 'Trivia' },
  { id: 'puzzle', label: 'Puzzle' },
  { id: 'prizes', label: 'Prizes' },
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
function TriviaSet({ title, questions, onAnswer, answering }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {questions.map(q => (
          <div key={q.id} style={{ background: '#fff', border: `1px solid ${CT_LINE}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>{q.question}</div>
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
                  <button key={i} disabled={q.answered || answering === q.id}
                    onClick={() => onAnswer(q, i)}
                    style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: q.answered ? 'default' : 'pointer', textAlign: 'left' }}>
                    {opt}
                  </button>
                );
              })}
            </div>
            {q.result && (
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: q.result.correct ? '#16a34a' : '#dc2626' }}>
                {q.result.correct ? `+${q.result.awarded} credits` : 'Not quite — try tomorrow’s set'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TriviaTab({ onCreditsChange }) {
  const [data, setData] = useState(null);
  const [answering, setAnswering] = useState(null);

  const load = useCallback(() => { api('/api/games/trivia').then(setData); }, []);
  useEffect(() => { load(); }, [load]);

  const handleAnswer = useCallback(async (question, optionIndex) => {
    setAnswering(question.id);
    const result = await api('/api/games/trivia/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: question.id, selected_option: optionIndex }),
    });
    setAnswering(null);
    if (!result) return;
    setData(prev => {
      const patch = list => list.map(q => q.id === question.id ? { ...q, answered: true, selected: optionIndex, result } : q);
      return { ...prev, racing: patch(prev.racing), sports: patch(prev.sports) };
    });
    if (result.balance != null) onCreditsChange(result.balance);
  }, [onCreditsChange]);

  if (!data) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>Loading today&apos;s questions…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
        5 racing + 5 sports questions daily · 10 credits per correct answer · resets at midnight AEST
      </div>
      <TriviaSet title="Racing" questions={data.racing} onAnswer={handleAnswer} answering={answering} />
      <TriviaSet title="Sports" questions={data.sports} onAnswer={handleAnswer} answering={answering} />
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
      if (completeResult?.balance != null) onCreditsChange(completeResult.balance);
    }
  }, [status, current, guesses, submitting, onCreditsChange]);

  if (!status) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>Loading today&apos;s puzzle…</div>;

  const letterBg = f => f === 'correct' ? '#16a34a' : f === 'present' ? '#e8b84a' : '#9ca3af';

  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Guess the Venue</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
        {status.wordLength} letters · {status.maxGuesses} guesses · one attempt per day
      </div>

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
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: won ? '#16a34a' : '#dc2626' }}>
              {won ? `Solved in ${guesses.length}! Credits added.` : 'Out of guesses — see you tomorrow.'}
            </div>
          )}
        </>
      )}
    </div>
  );
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
      if (s.lastSpawn > spawnGap) { s.lastSpawn = 0; s.obstacles.push({ x: W, w: 14, h: 24 }); }
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
      ctx.fillStyle = '#e8b84a';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = '#f87171';
      s.obstacles.forEach(o => ctx.fillRect(o.x, GROUND + 26 - o.h, o.w, o.h));
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
const WHEEL_SEGMENTS = [
  { label: '+10 Credits', color: '#0d2416' },
  { label: '+25 Credits', color: '#173404' },
  { label: '+50 Credits', color: '#0d2416' },
  { label: '+100 Credits', color: '#173404' },
  { label: 'Streak Shield', color: '#3b2a0d' },
  { label: 'Loyal Punter Badge', color: '#173404' },
];

function segmentIndexForPrize(prize) {
  if (prize.type === 'credits') return WHEEL_SEGMENTS.findIndex(s => s.label === `+${prize.value} Credits`);
  if (prize.type === 'streak_shield') return 4;
  if (prize.type === 'badge') return 5;
  return 0;
}

function PrizeWheel({ status, onSpin, spinning, rotation }) {
  const seg = 360 / WHEEL_SEGMENTS.length;
  const gradient = WHEEL_SEGMENTS.map((s, i) => `${s.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
  return (
    <div style={{ position: 'relative', width: 240, height: 240, margin: '0 auto' }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: `conic-gradient(${gradient})`,
        border: `3px solid ${GOLD}`,
        transform: `rotate(${rotation}deg)`,
        transition: spinning ? 'transform 3s cubic-bezier(0.17, 0.67, 0.2, 1)' : 'none',
        position: 'relative',
      }}>
        {WHEEL_SEGMENTS.map((s, i) => {
          const angle = i * seg + seg / 2;
          return (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%', width: 100,
              // rotate(angle) positions the label out along the wedge's
              // radius; the final rotate(-angle) counter-rotates the text
              // itself back to horizontal -- without it (previously a
              // no-op rotate(0deg)) the text inherited the full wedge
              // angle, reading upside-down for every bottom-half segment.
              transform: `rotate(${angle}deg) translate(0, -92px) rotate(${-angle}deg)`,
              transformOrigin: 'top left',
              fontSize: 9, fontWeight: 700, color: '#fff', textAlign: 'center',
            }}>
              {s.label}
            </div>
          );
        })}
      </div>
      {/* Pointer */}
      <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `14px solid ${GOLD}` }} />
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
          session for why that matters). */}
      <div style={{ background: '#fff', borderBottom: `0.5px solid ${CT_LINE}`, padding: '8px 16px', display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {MAIN_TABS.map(t => {
          const active = mainTab === t.id;
          return (
            <button key={t.id} onClick={() => setMainTab(t.id)}
              style={{ padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: `0.5px solid ${active ? '#111827' : CT_LINE}`, cursor: 'pointer', background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151' }}>
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mainTab === 'trivia' && <TriviaTab onCreditsChange={handleCreditsChange} />}
        {mainTab === 'puzzle' && <PuzzleTab onCreditsChange={handleCreditsChange} />}
        {mainTab === 'prizes' && <PrizesTab onCreditsChange={handleCreditsChange} />}
      </div>
    </main>
  );
}
