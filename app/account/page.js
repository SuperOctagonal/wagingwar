'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbFetch } from '@/lib/supabase';
import { getTier, ALL_TIERS } from '@/lib/tiers';
import useIsPro from '@/hooks/useIsPro';

const GREEN = '#1B4332';
const GOLD  = '#B7791F';
const TEXT  = '#111827';
const RING_R    = 50;
const RING_CIRC = 2 * Math.PI * RING_R;

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'points',       label: 'Points History' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings',     label: 'Settings' },
];

const KNOWN_BADGES = [
  { id: 'first_post',     emoji: '💬', name: 'First Post',        req: 'Post your first community message' },
  { id: 'first_bet',      emoji: '📝', name: 'First Bet',         req: 'Log your first bet' },
  { id: 'first_win',      emoji: '🎯', name: 'First Win',         req: 'Record your first winning bet' },
  { id: 'hotstreak',      emoji: '🔥', name: 'Hot Streak',        req: 'Win 3 bets in a row' },
  { id: 'top_punter',     emoji: '🏆', name: 'Top Punter',        req: 'Reach 500 points' },
  { id: 'community_star', emoji: '⭐', name: 'Community Star',    req: 'Post 10 community messages' },
  { id: 'blackbook_pro',  emoji: '📖', name: 'Blackbook Pro',     req: 'Add 10 horses to your blackbook' },
  { id: 'big_winner',     emoji: '💰', name: 'Big Winner',        req: 'Win 5 bets in a row' },
];

const ACTION_ICONS = {
  blackbook_save: '🏇', blackbook_win: '🏇',
  community_post: '💬', community_reply: '💬',
  win_logged: '🎯', bet_logged: '📝',
  upvote_received: '👍', referral: '⭐', tier_up: '🏆',
};
const ACTION_NAMES = {
  blackbook_save: 'Blackbook Save', blackbook_win: 'Blackbook Winner',
  community_post: 'Community Post', community_reply: 'Community Reply',
  win_logged: 'Winning Bet', bet_logged: 'Bet Logged',
  upvote_received: 'Upvote Received', referral: 'Referral', tier_up: 'Tier Up',
};
function actionIcon(t) { return ACTION_ICONS[t] || '🎁'; }
// action_type must be set on every insert; empty rows fall back to 'Points earned'
function actionName(t) { return ACTION_NAMES[t] || (t ? t.replace(/_/g, ' ') : 'Points earned'); }

function fmtMonth(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}
function fmtDay(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return fmtDay(ts);
}

function Card({ title, icon, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '16px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function QuickLink({ href, icon, title, desc }) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</div>
      </div>
      <span style={{ color: '#d1d5db', fontSize: 16 }}>›</span>
    </Link>
  );
}

function ManageSubButton() {
  const [state, setState] = useState('idle'); // idle | loading | error

  async function handleClick() {
    setState('loading');
    try {
      const res = await fetch('/api/create-portal-session', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setState('error');
        setTimeout(() => setState('idle'), 4000);
        return;
      }
      window.location.href = data.url;
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        style={{ display: 'inline-block', background: state === 'error' ? '#fee2e2' : '#f9fafb', border: `0.5px solid ${state === 'error' ? '#fca5a5' : '#e5e7eb'}`, color: state === 'error' ? '#dc2626' : '#374151', fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 8, cursor: state === 'loading' ? 'default' : 'pointer', opacity: state === 'loading' ? 0.7 : 1 }}
      >
        {state === 'loading' ? 'Opening…' : state === 'error' ? 'Couldn\'t open billing portal — try again' : 'Manage Subscription'}
      </button>
    </div>
  );
}

export default function AccountPage() {
  const { user, isLoaded } = useUser();
  const { signOut }        = useClerk();
  const isPro              = useIsPro();

  const [profile,    setProfile]    = useState(null);
  const [allResults, setAllResults] = useState(null);
  const [badges,     setBadges]     = useState(null);
  const [pointsLog,  setPointsLog]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('overview');
  const [showDelete, setShowDelete] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [prof, allR, bdg, plog] = await Promise.all([
        sbFetch(`user_profiles?clerk_id=eq.${userId}&limit=1`),
        sbFetch(`bet_log?clerk_id=eq.${userId}&select=result&order=created_at.desc`),
        sbFetch(`user_badges?clerk_id=eq.${userId}&order=earned_at.desc`),
        sbFetch(`points_log?clerk_id=eq.${userId}&select=*&order=created_at.desc&limit=50`),
      ]);
      if (plog?.length) console.log('[points_log row sample]', plog[0]);
      setProfile(prof?.[0] ?? null);
      setAllResults(allR ?? []);
      setBadges(bdg ?? []);
      setPointsLog(plog ?? []);
      setLoading(false);
    })();
  }, [userId]);

  if (!isLoaded || (userId && loading)) {
    return (
      <main className="flex-1 overflow-y-auto mob-page flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex-1 overflow-y-auto mob-page flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Sign in to view your account.</p>
          <Link href="/sign-in" style={{ background: GREEN, color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 8, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  // ── derived values ─────────────────────────────────────────────────────────
  const pts      = profile?.points || 0;
  const tier     = getTier(pts);
  const nextTier = tier.num < 262 ? ALL_TIERS[tier.num] : null;
  const ptsInTier = pts - tier.points;
  const tierRange = nextTier ? nextTier.points - tier.points : 1;
  const progress  = nextTier ? Math.min(Math.round((ptsInTier / tierRange) * 100), 100) : 100;
  const ptsToNext = nextTier ? nextTier.points - pts : 0;

  const totalBets = allResults?.length || 0;
  const wins      = allResults?.filter(b => b.result === 'win').length ?? 0;
  const winPct    = totalBets > 0 ? Math.round((wins / totalBets) * 100) : null;

  const settledBets = (allResults ?? []).filter(b => b.result && b.result !== 'pending');
  let currentStreak = 0;
  for (const b of settledBets) {
    if (b.result === 'win') currentStreak++;
    else break;
  }
  let longestStreak = 0, tmpStreak = 0;
  for (const b of settledBets) {
    if (b.result === 'win') { tmpStreak++; if (tmpStreak > longestStreak) longestStreak = tmpStreak; }
    else tmpStreak = 0;
  }

  const email       = user.emailAddresses?.[0]?.emailAddress ?? '';
  const displayName = profile?.display_name || user.firstName || email.split('@')[0] || 'Punter';
  const initial     = (displayName[0] ?? '?').toUpperCase();
  const memberSince = fmtMonth(user.createdAt || profile?.created_at);

  const stripeMonthlyUrl = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '/sign-up';
  const stripeAnnualUrl  = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_URL  || '/sign-up';

  const now        = Date.now();
  const WEEK       = 7  * 864e5;
  const MONTH      = 30 * 864e5;
  const getPts = e => e.points_earned ?? e.pts ?? e.points ?? 0;
  const ptsThisWeek  = pointsLog.filter(e => now - new Date(e.created_at) <= WEEK).reduce((s, e) => s + getPts(e), 0);
  const ptsThisMonth = pointsLog.filter(e => now - new Date(e.created_at) <= MONTH).reduce((s, e) => s + getPts(e), 0);
  const dayTotals    = {};
  pointsLog.forEach(e => { const d = e.created_at?.slice(0, 10); if (d) dayTotals[d] = (dayTotals[d] || 0) + getPts(e); });
  const bestDay = Object.values(dayTotals).length ? Math.max(...Object.values(dayTotals)) : 0;

  const earnedBadgeNames = new Set((badges || []).map(b => b.badge_name || b.name || ''));
  const lockedBadges     = KNOWN_BADGES.filter(kb => !earnedBadgeNames.has(kb.name));

  const proFeatures = [
    'Unlimited meetings per day',
    'Full scores + edge calculations',
    'Pace maps for every race',
    'Unlimited bet tracker',
    'Blackbook across all meetings',
    'Community posting and replies',
    'Model vs market odds comparison',
  ];

  return (
    <main className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>

      {/* ── HERO ── */}
      <div style={{ background: GREEN, padding: '20px 20px 18px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="flex flex-col md:flex-row items-center gap-5 md:gap-8">

            {/* Left — avatar + name + email + badge */}
            <div className="flex flex-col items-center md:items-start flex-shrink-0">
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                border: `2.5px solid ${GOLD}`, background: 'rgba(0,0,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8, fontSize: 20, fontWeight: 800, color: '#fff',
              }}>
                {initial}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 7 }}>{email}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isPro
                  ? <span style={{ background: GOLD, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 10px', borderRadius: 20 }}>👑 PRO</span>
                  : <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>FREE</span>
                }
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Since {memberSince}</span>
              </div>
            </div>

            {/* Centre — progress ring */}
            <div style={{ flexShrink: 0, position: 'relative', width: 110, height: 110, overflow: 'visible' }}>
              <svg width="110" height="110" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                <circle cx="55" cy="55" r={RING_R} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="8" />
                <circle
                  cx="55" cy="55" r={RING_R}
                  fill="none"
                  stroke={GOLD}
                  strokeWidth="8"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC * (1 - progress / 100)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{progress}%</span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>to next</span>
              </div>
            </div>

            {/* Right — points + tier */}
            <div className="flex flex-col items-center md:items-end md:ml-auto">
              <div style={{ fontSize: 36, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{pts.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>total points</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{tier.emoji} {tier.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Tier {tier.num} of 262</div>
              {nextTier ? (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>{ptsToNext.toLocaleString()} pts to {nextTier.name}</div>
              ) : (
                <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginTop: 5 }}>👑 Max tier reached!</div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── TABS BAR ── */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', minWidth: 'max-content', maxWidth: 860, margin: '0 auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, minWidth: 90, padding: '13px 16px',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                color: activeTab === t.id ? GREEN : '#6b7280',
                background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? `2px solid ${GREEN}` : '2px solid transparent',
                cursor: 'pointer', transition: 'color 0.15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* ─── OVERVIEW ──────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.15s ease' }}>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Total Bets"     value={totalBets} />
              <StatBox label="Win Rate"       value={winPct !== null ? `${winPct}%` : '—'} sub={winPct !== null ? `${wins} of ${totalBets}` : 'No data'} />
              <StatBox label="Current Streak" value={currentStreak} sub="wins" />
              <StatBox label="Longest Streak" value={longestStreak} sub="all time" />
            </div>

            {/* Subscription */}
            {isPro ? (
              <Card title="Subscription" icon="👑">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👑</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>Pro Subscriber</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>All features unlocked</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {proFeatures.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: TEXT }}>
                      <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <ManageSubButton />
              </Card>
            ) : (
              <Card title="Upgrade to Pro" icon="⚡">
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Unlock Everything</div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.65 }}>
                    You&apos;re on the free plan. Upgrade to get a 7-day free trial and access all features.
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
                  {proFeatures.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#9ca3af' }}>
                      <span style={{ color: '#d1d5db', flexShrink: 0 }}>✗</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <a href={stripeMonthlyUrl} style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 800, padding: '12px 16px', borderRadius: 8, textDecoration: 'none' }}>
                    Subscribe $29/mo
                  </a>
                  <a href={stripeAnnualUrl} style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GOLD, color: '#fff', fontSize: 13, fontWeight: 800, padding: '12px 16px', borderRadius: 8, textDecoration: 'none' }}>
                    Best Value $249/yr
                  </a>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>7-day free trial included</div>
              </Card>
            )}

            {/* Quick links */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 12, paddingLeft: 2 }}>Quick Links</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <QuickLink href="/mybets"    icon="📈" title="My Bets"          desc="Track your P&L" />
                <QuickLink href="/blackbook" icon="📖" title="Blackbook"        desc="Saved horses" />
                <QuickLink href="/community" icon="👥" title="Community"        desc="Tips & discussion" />
                <QuickLink href="/upcoming"  icon="🚀" title="Upcoming"         desc="What's next" />
                <QuickLink href="/results"   icon="🏁" title="Results"          desc="Recent form" />
                <QuickLink href="/insights"  icon="💡" title="Insights"         desc="Analytics dashboard" />
              </div>
            </div>

          </div>
        )}

        {/* ─── POINTS HISTORY ────────────────────────────────────────────── */}
        {activeTab === 'points' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.15s ease' }}>

            {/* Summary stat boxes */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'This Week',  value: ptsThisWeek  },
                { label: 'This Month', value: ptsThisMonth },
                { label: 'Best Day',   value: bestDay      },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '10px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{value}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Activity feed */}
            <Card title="Points History" icon="🕐">
              {pointsLog.length > 0 ? (
                <div>
                  {pointsLog.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < pointsLog.length - 1 ? '0.5px solid #f1f5f9' : 'none' }}>
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{actionIcon(entry.action_type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{actionName(entry.action_type)}</div>
                        {entry.action_detail && (
                          <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.action_detail}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 2 }}>{timeAgo(entry.created_at)}</div>
                        {entry.daily_limit_hit ? (
                          <div>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#f3f4f6', color: '#9ca3af' }}>+0 pts</span>
                            <div style={{ fontSize: 8, color: '#d1d5db' }}>Limit</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>+{entry.points_earned ?? entry.pts ?? entry.points ?? 0} pts</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🕐</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>No points history yet.</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>Start posting, logging bets and saving horses to your blackbook!</div>
                </div>
              )}
            </Card>

          </div>
        )}

        {/* ─── ACHIEVEMENTS ──────────────────────────────────────────────── */}
        {activeTab === 'achievements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.15s ease' }}>

            {badges && badges.length > 0 ? (
              <Card title="Earned Badges" icon="🏅">
                <div className="grid grid-cols-3 gap-3">
                  {badges.map((b, i) => (
                    <div key={i} style={{ textAlign: 'center', background: '#fefce8', border: '0.5px solid #fde68a', borderRadius: 10, padding: '14px 8px' }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{b.badge_emoji || '🏅'}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{b.badge_name || 'Badge'}</div>
                      {b.earned_at && <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>{fmtDay(b.earned_at)}</div>}
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '24px 20px', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🏅</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>No badges earned yet.</div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>Keep posting, betting and engaging to earn your first badge!</div>
              </div>
            )}

            <Card title="Locked Badges" icon="🔒">
              {lockedBadges.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {lockedBadges.map(kb => (
                    <div key={kb.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 24, filter: 'grayscale(1)', opacity: 0.5, flexShrink: 0 }}>{kb.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{kb.name}</span>
                          <span style={{ fontSize: 10 }}>🔒</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{kb.req}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#16a34a', fontWeight: 600, fontSize: 13 }}>
                  🎉 You&apos;ve unlocked all known badges!
                </div>
              )}
            </Card>

          </div>
        )}

        {/* ─── SETTINGS ──────────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.15s ease' }}>

            <Card title="Subscription" icon="💳">
              {isPro ? (
                <div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.6 }}>
                    You&apos;re on the <strong>Pro plan</strong>. Manage your billing and subscription details via Stripe.
                  </div>
                  <ManageSubButton />
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.6 }}>
                    You&apos;re on the <strong>free plan</strong>. Upgrade to unlock all features with a 7-day free trial.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a href={stripeMonthlyUrl} style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 16px', borderRadius: 8, textDecoration: 'none' }}>
                      Subscribe $29/mo
                    </a>
                    <a href={stripeAnnualUrl} style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GOLD, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 16px', borderRadius: 8, textDecoration: 'none' }}>
                      Best Value $249/yr
                    </a>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Account" icon="⚙️">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => signOut({ redirectUrl: '/' })}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: 8, cursor: 'pointer' }}
                >
                  Sign Out
                </button>

                {!showDelete ? (
                  <button
                    onClick={() => setShowDelete(true)}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 13, fontWeight: 600, padding: '11px 16px', borderRadius: 8, cursor: 'pointer' }}
                  >
                    Delete Account
                  </button>
                ) : (
                  <div style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                    To request account deletion, email{' '}
                    <a href="mailto:adam@wagingwar.com.au" style={{ color: GREEN, fontWeight: 700 }}>adam@wagingwar.com.au</a>.
                    We&apos;ll delete your data within 30 days in line with our{' '}
                    <Link href="/privacy" style={{ color: GREEN, fontWeight: 700 }}>Privacy Policy</Link>.
                  </div>
                )}
              </div>
            </Card>

          </div>
        )}

      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>
    </main>
  );
}
