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

// ── helpers ────────────────────────────────────────────────────────────────
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

const ACTION_ICONS = {
  blackbook_save:  '🏇',
  blackbook_win:   '🏇',
  community_post:  '💬',
  community_reply: '💬',
  win_logged:      '🎯',
  bet_logged:      '📝',
  upvote_received: '👍',
  referral:        '⭐',
  tier_up:         '🏆',
};
const ACTION_NAMES = {
  blackbook_save:  'Blackbook Save',
  blackbook_win:   'Blackbook Winner',
  community_post:  'Community Post',
  community_reply: 'Community Reply',
  win_logged:      'Winning Bet',
  bet_logged:      'Bet Logged',
  upvote_received: 'Upvote Received',
  referral:        'Referral',
  tier_up:         'Tier Up',
};
function actionIcon(t) { return ACTION_ICONS[t] || '🎁'; }
function actionName(t) { return ACTION_NAMES[t] || (t || '').replace(/_/g, ' '); }

function fmtPL(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
}

const RES_STYLE = {
  win:   { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  place: { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' },
  loss:  { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
};

// ── shared card shell ──────────────────────────────────────────────────────
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
      {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, lineHeight: 1.2 }}>{sub}</div>}
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function QuickLink({ href, icon, title, desc }) {
  return (
    <Link
      href={href}
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</div>
      </div>
      <span style={{ color: '#d1d5db', fontSize: 16, lineHeight: 1 }}>›</span>
    </Link>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user, isLoaded } = useUser();
  const { signOut }        = useClerk();
  const isPro              = useIsPro();

  const [profile,      setProfile]      = useState(null);
  const [recentBets,   setRecentBets]   = useState(null);
  const [allResults,   setAllResults]   = useState(null);
  const [badges,       setBadges]       = useState(null);
  const [pointsLog,    setPointsLog]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showDelete,   setShowDelete]   = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [prof, recent, allR, bdg, plog] = await Promise.all([
        sbFetch(`user_profiles?clerk_id=eq.${userId}&limit=1`),
        sbFetch(`bet_log?clerk_id=eq.${userId}&order=created_at.desc&limit=5`),
        sbFetch(`bet_log?clerk_id=eq.${userId}&select=result`),
        sbFetch(`user_badges?clerk_id=eq.${userId}&order=earned_at.desc`),
        sbFetch(`points_log?clerk_id=eq.${userId}&order=created_at.desc&limit=50`),
      ]);
      setProfile(prof?.[0] ?? null);
      setRecentBets(recent ?? []);
      setAllResults(allR ?? []);
      setBadges(bdg ?? []);
      setPointsLog(plog ?? []);
      setLoading(false);
    })();
  }, [userId]);

  // ── loading / unauthenticated guards ────────────────────────────────────
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

  // ── derived values ───────────────────────────────────────────────────────
  const pts      = profile?.points || 0;
  const tier     = getTier(pts);
  const nextTier = tier.num < 262 ? ALL_TIERS[tier.num] : null;

  const ptsInTier = pts - tier.points;
  const tierRange = nextTier ? nextTier.points - tier.points : 1;
  const progress  = nextTier ? Math.min(Math.round((ptsInTier / tierRange) * 100), 100) : 100;
  const ptsToNext = nextTier ? nextTier.points - pts : 0;

  const totalBets = allResults?.length || profile?.total_bets || 0;
  const wins      = allResults?.filter(b => b.result === 'win').length ?? 0;
  const winPct    = totalBets > 0 ? Math.round((wins / totalBets) * 100) : null;

  const email       = user.emailAddresses?.[0]?.emailAddress ?? '';
  const displayName = profile?.display_name || user.firstName || email.split('@')[0] || 'Punter';
  const initial     = (displayName[0] ?? '?').toUpperCase();
  const memberSince = fmtMonth(user.createdAt || profile?.created_at);

  const stripeMonthlyUrl = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_URL || '/sign-up';
  const stripeAnnualUrl  = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_URL  || '/sign-up';

  const now       = Date.now();
  const WEEK      = 7  * 864e5;
  const MONTH     = 30 * 864e5;
  const ptsThisWeek  = pointsLog.filter(e => now - new Date(e.created_at) <= WEEK).reduce((s, e) => s + (e.points_earned || 0), 0);
  const ptsThisMonth = pointsLog.filter(e => now - new Date(e.created_at) <= MONTH).reduce((s, e) => s + (e.points_earned || 0), 0);
  const dayTotals    = {};
  pointsLog.forEach(e => { const d = e.created_at?.slice(0, 10); if (d) dayTotals[d] = (dayTotals[d] || 0) + (e.points_earned || 0); });
  const bestDay = Object.values(dayTotals).length ? Math.max(...Object.values(dayTotals)) : 0;

  return (
    <main className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>

      {/* ── 1. Hero banner ─────────────────────────────────────────────── */}
      <div style={{ background: GREEN, padding: '40px 24px 44px', textAlign: 'center' }}>
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          border: `3px solid ${GOLD}`, background: 'rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28, fontWeight: 800, color: '#fff',
        }}>
          {initial}
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4, letterSpacing: '-0.01em' }}>
          {displayName}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>{email}</div>

        {/* Plan badge */}
        {isPro ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: GOLD, color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 20 }}>
            👑 PRO
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20 }}>
            FREE
          </span>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          Serious punter. Data driven.&nbsp;&nbsp;·&nbsp;&nbsp;Member since {memberSince}
        </div>
      </div>

      {/* ── 2. Stats row ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 0' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Total Points" value={pts.toLocaleString()} />
          <StatBox label="Current Rank"  value={`#${tier.num}`} sub={tier.name} />
          <StatBox label="Bets Logged"   value={totalBets > 0 ? totalBets.toLocaleString() : '0'} />
          <StatBox
            label="Win Rate"
            value={winPct !== null ? `${winPct}%` : '—'}
            sub={winPct !== null ? `${wins} of ${totalBets} wins` : 'No data yet'}
          />
        </div>
      </div>

      {/* ── body ───────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── 3. Rank progress ─────────────────────────────────────────── */}
        <Card title="Rank Progress" icon={tier.emoji}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{tier.name}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Tier {tier.num} of 262</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 9, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: tier.color, borderRadius: 5,
                transition: 'width 0.6s ease',
              }} />
            </div>

            {nextTier && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{pts.toLocaleString()} pts</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{nextTier.points.toLocaleString()} pts</span>
              </div>
            )}
          </div>

          {nextTier ? (
            <div style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>
                <strong>{ptsToNext.toLocaleString()} pts</strong> to reach {nextTier.emoji} <strong>{nextTier.name}</strong>
              </span>
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 8, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#166534', fontWeight: 700 }}>
              👑 Maximum tier reached — Melbourne Cup. Legendary status!
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: '#e5e7eb', textAlign: 'right' }}>
            262 tiers · Adaminaby Picnic Maiden → Melbourne Cup
          </div>
        </Card>

        {/* ── 4. Points History ────────────────────────────────────────── */}
        <Card title="Points History" icon="🕐">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3" style={{ marginBottom: 20 }}>
            {[
              { label: 'This Week',  value: ptsThisWeek  },
              { label: 'This Month', value: ptsThisMonth },
              { label: 'Best Day',   value: bestDay      },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '12px 8px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{value}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Feed */}
          {pointsLog.length > 0 ? (
            <div>
              {pointsLog.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < pointsLog.length - 1 ? '0.5px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{actionIcon(entry.action_type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{actionName(entry.action_type)}</div>
                    {entry.action_detail && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.action_detail}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{timeAgo(entry.created_at)}</div>
                    {entry.daily_limit_hit ? (
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#9ca3af' }}>+0 pts</span>
                        <div style={{ fontSize: 9, color: '#d1d5db', marginTop: 1 }}>Limit reached</div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>+{entry.points_earned} pts</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🕐</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>No points history yet.</div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>Start posting, logging bets and saving horses to your blackbook!</div>
            </div>
          )}
        </Card>

        {/* ── 5. Subscription ──────────────────────────────────────────── */}
        {isPro ? (
          <Card title="Subscription" icon="👑">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                👑
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>Pro Subscriber</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>All features unlocked</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
              {[
                'Unlimited meetings per day',
                'Full scores + edge calculations',
                'Pace maps for every race',
                'Unlimited bet tracker',
                'Blackbook across all meetings',
                'Community posting and replies',
                'Model vs market odds comparison',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: TEXT }}>
                  <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            <a
              href="https://billing.stripe.com"
              style={{ display: 'inline-block', background: '#f9fafb', border: '0.5px solid #e5e7eb', color: '#374151', fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 8, textDecoration: 'none' }}
            >
              Manage Subscription
            </a>
          </Card>
        ) : (
          <Card title="Subscription" icon="⚡">
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Upgrade to Pro</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.65 }}>
                You&apos;re on the free plan. Upgrade to unlock everything and get a 7-day free trial.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {[
                'Unlimited meetings per day',
                'Full scores + edge calculations',
                'Pace maps for every race',
                'Unlimited bet tracker',
                'Blackbook across all meetings',
                'Community posting and replies',
                'Model vs market odds comparison',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#9ca3af' }}>
                  <span style={{ color: '#d1d5db', flexShrink: 0 }}>✗</span>
                  {f}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <a
                href={stripeMonthlyUrl}
                style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 800, padding: '12px 16px', borderRadius: 8, textDecoration: 'none' }}
              >
                Subscribe $29/mo
              </a>
              <a
                href={stripeAnnualUrl}
                style={{ flex: '1 1 140px', display: 'block', textAlign: 'center', background: GOLD, color: '#fff', fontSize: 13, fontWeight: 800, padding: '12px 16px', borderRadius: 8, textDecoration: 'none' }}
              >
                Best Value $249/yr
              </a>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>7-day free trial included</div>
          </Card>
        )}

        {/* ── 6. Recent Bets ───────────────────────────────────────────── */}
        <Card title="Recent Bets" icon="📈">
          {recentBets && recentBets.length > 0 ? (
            <>
              <div style={{ marginBottom: 14 }}>
                {recentBets.map((b, i) => {
                  const res = (b.result ?? '').toLowerCase();
                  const rs  = RES_STYLE[res] || RES_STYLE.loss;
                  const pl  = fmtPL(b.pl ?? b.profit_loss ?? b.pnl);
                  return (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < recentBets.length - 1 ? '0.5px solid #f1f5f9' : 'none' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.horse_name || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {b.track || b.venue || '—'}
                          {(b.date || b.created_at) ? ` · ${fmtDay(b.date || b.created_at)}` : ''}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                        background: rs.bg, color: rs.text, border: `0.5px solid ${rs.border}`,
                        textTransform: 'capitalize', flexShrink: 0,
                      }}>
                        {b.result || '—'}
                      </span>
                      {pl && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: Number(b.pl ?? b.profit_loss ?? b.pnl) >= 0 ? '#16a34a' : '#dc2626', minWidth: 54, textAlign: 'right', flexShrink: 0 }}>
                          {pl}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <Link href="/mybets" style={{ fontSize: 12, fontWeight: 700, color: GREEN, textDecoration: 'none' }}>
                View all bets →
              </Link>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>No bets logged yet.</div>
              <Link href="/mybets" style={{ fontSize: 12, fontWeight: 700, color: GREEN, textDecoration: 'none' }}>
                Start tracking bets →
              </Link>
            </div>
          )}
        </Card>

        {/* ── 7. Achievements ──────────────────────────────────────────── */}
        <Card title="Achievements" icon="🏅">
          {badges && badges.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {badges.map((b, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fefce8', border: '0.5px solid #fde68a', borderRadius: 8 }}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{b.badge_emoji || '🏅'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{b.badge_name || 'Badge'}</div>
                    {b.earned_at && (
                      <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                        Earned {fmtMonth(b.earned_at)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏅</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>No badges earned yet.</div>
              <div style={{ fontSize: 12 }}>Start posting in the community to earn your first badge!</div>
            </div>
          )}
        </Card>

        {/* ── 8. Quick Links ───────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 12, paddingLeft: 2 }}>Quick Links</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <QuickLink href="/mybets"    icon="📈" title="My Bets"          desc="Track your P&amp;L" />
            <QuickLink href="/blackbook" icon="📖" title="Blackbook"         desc="Saved horses" />
            <QuickLink href="/community" icon="👥" title="Community"         desc="Tips &amp; discussion" />
            <QuickLink href="/upcoming"  icon="🚀" title="Upcoming Features" desc="What&apos;s next" />
            <QuickLink href="/results"   icon="🏁" title="Results"           desc="Recent form" />
            <QuickLink href="/insights"  icon="💡" title="Insights"          desc="Analytics dashboard" />
          </div>
        </div>

        {/* ── 9. Danger zone ───────────────────────────────────────────── */}
        <Card title="Account Settings" icon="⚙️">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => signOut({ redirectUrl: '/' })}
              style={{
                width: '100%', textAlign: 'left', background: 'transparent',
                border: '1px solid #fca5a5', color: '#dc2626',
                fontSize: 13, fontWeight: 700, padding: '11px 16px',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Sign Out
            </button>

            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                style={{
                  width: '100%', textAlign: 'left', background: 'transparent',
                  border: '1px solid #e5e7eb', color: '#6b7280',
                  fontSize: 13, fontWeight: 600, padding: '11px 16px',
                  borderRadius: 8, cursor: 'pointer',
                }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                To request account deletion, email us at{' '}
                <a href="mailto:adam@wagingwar.com.au" style={{ color: GREEN, fontWeight: 700 }}>
                  adam@wagingwar.com.au
                </a>
                . We&apos;ll delete your data within 30 days in accordance with our{' '}
                <Link href="/privacy" style={{ color: GREEN, fontWeight: 700 }}>Privacy Policy</Link>.
              </div>
            )}
          </div>
        </Card>

      </div>
    </main>
  );
}
