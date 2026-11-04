'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import useUsernameSave from '@/hooks/useUsernameSave';
import PuntersEdgeCredit from '@/components/PuntersEdgeCredit';
import { punterFallback } from '@/lib/punterFallback';
import { USERNAME_MAX } from '@/lib/usernameRules.mjs';
import { shouldShowWelcome, dismissedState, closedState } from '@/lib/welcomeCard.mjs';

// Welcome card at the top of /races for new users and users with no
// username (who it is shown to: lib/welcomeCard.mjs). Dismissible, never a
// modal; tracks nothing. "Not now" and a saved username are remembered in
// Clerk unsafeMetadata.welcomeCard; if that write fails the card just stays
// closed for this page view.
//
// Phones (below 900px) while the cookie banner is up get a compact card --
// headline, username input + Save, "Not now" -- so the race list keeps its
// room; the rest appears once the banner is gone (CookieBanner sets
// --cookie-banner-height on <html> only while it shows). Desktop: unchanged.
//
// nextRace: { key, label } of today's next race still to jump, or null.
// onOpenRace(key): selects that race on the page.
export default function WelcomeCard({ nextRace, onOpenRace }) {
  const { isLoaded, user } = useUser();
  const { save, saving, error, clearError } = useUsernameSave();
  const [closed, setClosed] = useState(false);
  const [savedAs, setSavedAs] = useState(null);
  const [value, setValue] = useState('');
  const [bannerUp, setBannerUp] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setBannerUp(!!root.style.getPropertyValue('--cookie-banner-height'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);

  if (!isLoaded || !user || closed) return null;
  const state = user.unsafeMetadata?.welcomeCard;
  if (!savedAs && !shouldShowWelcome({ hasUsername: !!user.username, createdAt: user.createdAt, state, now: Date.now() })) return null;

  const remember = next => {
    user.update({ unsafeMetadata: { ...user.unsafeMetadata, welcomeCard: next } }).catch(() => {});
  };
  const notNow = () => { setClosed(true); remember(dismissedState(state, Date.now())); };
  const submit = async e => {
    e.preventDefault();
    if (!(await save(value))) return;
    setSavedAs(value.trim());
    remember(closedState(state, Date.now()));
    setTimeout(() => setClosed(true), 2500);
  };

  const ink = '#111827', ink2 = '#374151', muted = '#6b7280', green = '#00471b', border = '#e5e7eb';
  const stepNum = { flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: green, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const link = { color: green, fontWeight: 700, textDecoration: 'underline' };

  return (
    <section className={`ww-welcome${bannerUp ? ' ww-welcome--banner' : ''}`} aria-labelledby="ww-welcome-title" data-testid="welcome-card">
      <style>{`
        .ww-welcome { flex-shrink: 0; margin: 10px 10px 0; background: #fff; border: 1px solid ${border}; border-radius: 10px; overflow-y: auto; max-height: 46vh; }
        .ww-welcome-grid { display: grid; grid-template-columns: 1fr; gap: 14px; padding: 14px; }
        .ww-welcome-fig { display: none; }
        @media (max-width: 899px) {
          .ww-welcome--banner .ww-welcome-extra { display: none !important; }
          .ww-welcome--banner .ww-welcome-grid { padding: 10px 12px; }
          .ww-welcome--banner h2 { margin-bottom: 8px !important; }
          .ww-welcome--banner ol form { margin-top: 0 !important; }
        }
        @media (min-width: 900px) {
          .ww-welcome { max-height: none; }
          .ww-welcome-grid { grid-template-columns: 320px 1fr; gap: 20px; padding: 14px 18px; }
          .ww-welcome form { max-width: 440px; }
          .ww-welcome-fig { display: block; }
        }
      `}</style>
      <div className="ww-welcome-grid">
        <figure className="ww-welcome-fig" style={{ margin: 0 }}>
          <img
            src="/images/welcome-races.webp"
            width={720} height={405} loading="lazy" decoding="async"
            alt="The Races page: a race card with live bookmaker prices, price moves and the Top 3 runners called out"
            style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '720 / 405', borderRadius: 8, border: `1px solid ${border}` }}
          />
          <PuntersEdgeCredit style={{ marginTop: 6, fontSize: 12 }} />
        </figure>

        <div>
          <h2 id="ww-welcome-title" style={{ fontSize: 17, fontWeight: 800, color: ink, margin: 0 }}>Welcome to Waging War</h2>
          <p className="ww-welcome-extra" style={{ fontSize: 13, color: ink2, margin: '2px 0 12px' }}>Live bookmaker prices are free. Here&apos;s where to start.</p>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            <li style={{ display: 'flex', gap: 10 }}>
              <span className="ww-welcome-extra" style={stepNum} aria-hidden="true">1</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={savedAs ? undefined : 'ww-welcome-extra'} style={{ fontSize: 13, color: ink }}>
                  <b>Pick your username.</b> It&apos;s how you appear in Community and the leaderboard.{' '}
                  {savedAs
                    ? <span role="status" style={{ color: '#166534', fontWeight: 700 }}>Saved. You now show as {savedAs}.</span>
                    : <>Right now you show as <b data-testid="welcome-current-name">{user.username || punterFallback(user.id)}</b>.</>}
                </div>
                {!savedAs && (
                  <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }} noValidate>
                    <label htmlFor="ww-welcome-username" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Username</label>
                    <input
                      id="ww-welcome-username" name="username" value={value} maxLength={USERNAME_MAX}
                      onChange={e => { setValue(e.target.value); if (error) clearError(); }}
                      placeholder="Pick your username" autoComplete="off" autoCapitalize="none" spellCheck={false}
                      aria-invalid={!!error} aria-describedby={error ? 'ww-welcome-username-error' : undefined}
                      style={{ flex: '1 1 160px', minWidth: 0, fontSize: 16, padding: '7px 10px', border: `1px solid ${error ? '#dc2626' : '#d1d5db'}`, borderRadius: 6, color: ink }}
                    />
                    <button type="submit" disabled={saving} style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 6, border: 'none', background: green, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    {error && <div id="ww-welcome-username-error" role="alert" data-testid="welcome-username-error" style={{ flexBasis: '100%', fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>{error}</div>}
                  </form>
                )}
              </div>
            </li>
            <li className="ww-welcome-extra" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={stepNum} aria-hidden="true">2</span>
              <div style={{ fontSize: 13 }}>
                {nextRace ? (
                  <Link href={`/races?select=${encodeURIComponent(nextRace.key)}`} data-testid="welcome-next-race" style={link}
                    onClick={e => { if (onOpenRace) { e.preventDefault(); onOpenRace(nextRace.key); } }}>
                    Watch live prices on today&apos;s next race
                  </Link>
                ) : (
                  <Link href="/today" data-testid="welcome-next-race" style={link}>Watch live prices on today&apos;s next race</Link>
                )}
                {nextRace && <span style={{ color: muted }}> ({nextRace.label})</span>}
              </div>
            </li>
            <li className="ww-welcome-extra" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={stepNum} aria-hidden="true">3</span>
              <div style={{ fontSize: 13 }}>
                <Link href="/tip-record" data-testid="welcome-tip-record" style={link}>See the Tip Record</Link>
              </div>
            </li>
          </ol>

          <p className="ww-welcome-extra" style={{ fontSize: 13, color: ink2, margin: '14px 0 0' }}>
            Want scores, pace maps and value? <Link href="/pricing" style={link}>See what Pro adds</Link>{' '}
            <span style={{ color: muted }}>(A$29/month or A$249/year)</span>
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <p className="ww-welcome-extra" style={{ fontSize: 11, color: muted, margin: 0, flex: '1 1 240px' }}>
              Data and analytics. We don&apos;t take bets. 18+ · Please gamble responsibly · Gambling Help 1800 858 858
            </p>
            <button type="button" onClick={notNow} data-testid="welcome-not-now" style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: ink2, textDecoration: 'underline', cursor: 'pointer' }}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
