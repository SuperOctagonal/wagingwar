'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { getTier, ALL_TIERS } from '@/lib/tiers';
import useIsPro from '@/hooks/useIsPro';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function ProfileRail({ children }) {
  const { user, isLoaded } = useUser();
  const isPro = useIsPro();
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  // Bets/Win%/Posts are computed live from bet_log/posts, NOT read from
  // user_profiles.total_bets/total_wins/total_posts — those columns exist in
  // the Supabase dashboard but nothing in this codebase (frontend or backend)
  // ever writes to them, so they were permanently stuck at 0. Same live-query
  // approach app/account/page.js already uses for its own bet stats.
  const [betStats, setBetStats] = useState({ total: 0, wins: 0 });
  const [postCount, setPostCount] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!isLoaded) return;

    async function load() {
      if (!userId) return;
      try {
        const [profRes, betRes, postRes] = await Promise.all([
          fetch(`${SURL}/rest/v1/user_profiles?clerk_id=eq.${userId}&limit=1`, {
            headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
          }),
          fetch(`${SURL}/rest/v1/bet_log?clerk_id=eq.${userId}&select=result`, {
            headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
          }),
          fetch(`${SURL}/rest/v1/posts?user_id=eq.${userId}&select=id`, {
            headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
          }),
        ]);
        if (profRes.ok) {
          const data = await profRes.json();
          setProfile(data?.[0] ?? {});
        }
        if (betRes.ok) {
          const bets = await betRes.json();
          setBetStats({ total: bets.length, wins: bets.filter(b => b.result === 'win').length });
        }
        if (postRes.ok) {
          const posts = await postRes.json();
          setPostCount(posts.length);
        }
      } catch {}
    }

    load();

    const handler = () => load();
    window.addEventListener('ww:profile:refresh', handler);

    const interval = setInterval(load, 30000);

    return () => {
      window.removeEventListener('ww:profile:refresh', handler);
      clearInterval(interval);
    };
  }, [isLoaded, userId, pathname]);

  if (!isLoaded || !user) return <div className="profile-rail" style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '0.5px solid #e5e7eb' }} />;

  if (!profile) return (
    <div className="profile-rail" style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 11, color: '#d1d5db' }}>Loading…</div>
    </div>
  );

  const tier = getTier(profile.points || 0);
  const totalPoints = profile.points || 0;
  const allTierPts = ALL_TIERS.map(t => t.points).sort((a, b) => a - b);
  const currentTierPts = [...allTierPts].reverse().find(p => totalPoints >= p) ?? 0;
  const nextTierPts = allTierPts.find(p => p > totalPoints) ?? 365000;
  const progress = nextTierPts > currentTierPts
    ? Math.min(100, Math.round((totalPoints - currentTierPts) / (nextTierPts - currentTierPts) * 100))
    : 100;

  const initial = (profile.display_name || '?')[0]?.toUpperCase() || '?';

  return (
    <div className="profile-rail" style={{ width: 220, background: '#fff', borderRight: '0.5px solid #e5e7eb', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 12px' }}>
        {/* Avatar + name + tier badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {user.hasImage
            ? <img src={user.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#00471b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{initial}</div>
          }
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{profile.display_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: isPro ? '#FAEEDA' : '#E1F5EE', color: isPro ? '#854F0B' : '#0F6E56' }}>
                {isPro ? 'PRO' : 'FREE'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${tier.color}22`, color: tier.color }}>{tier.name}</span>
            </div>
          </div>
        </div>

        {/* Points + progress bar — links to rank ladder */}
        <Link href="/community?ladder=1" style={{ display: 'block', textDecoration: 'none', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>
            <span>{totalPoints.toLocaleString()} pts</span>
            <span style={{ color: '#00471b', fontWeight: 600 }}>View ladder →</span>
          </div>
          <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#00471b', borderRadius: 99 }} />
          </div>
        </Link>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[
            { label: 'Bets',  val: betStats.total },
            { label: 'Win%',  val: betStats.total > 0 ? `${Math.round(betStats.wins / betStats.total * 100)}%` : '—' },
            { label: 'Posts', val: postCount },
          ].map(s => (
            <div key={s.label} style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{s.val}</div>
              <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Referral code */}
        {profile.referral_code && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: '#f0fdf4', borderRadius: 4, fontSize: 9, color: '#065f46', wordBreak: 'break-all' }}>
            🎁 wagingwar.com.au?ref={profile.referral_code}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
