'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Avatar from '@/components/Avatar';
import NameFlair from '@/components/NameFlair';
import { getTier } from '@/lib/tiers';
import { TIER_COLORS } from '@/lib/cosmeticsCatalog';

const G = '#00471b';

function TierTag({ tier }) {
  const c = TIER_COLORS[tier] || TIER_COLORS.maiden;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px',
      padding: '2px 6px', borderRadius: 3, background: c.bg, color: c.text,
      border: `1px solid ${c.border}`, boxShadow: c.accent ? `0 0 0 1px ${c.accent}` : 'none',
    }}>
      {tier}
    </span>
  );
}

function BadgeCard({ badge }) {
  const c = TIER_COLORS[badge.tier] || TIER_COLORS.maiden;
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: badge.style?.bg || c.bg, border: `1.5px solid ${badge.style?.color || c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${badge.style?.icon || 'ti-award'}`} style={{ fontSize: 18, color: badge.style?.color || c.text }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</div>
        <div style={{ marginTop: 3 }}><TierTag tier={badge.tier} /></div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.3px', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function PublicProfilePage() {
  const { clerkId } = useParams();
  const { isLoaded: authLoaded, user: viewer } = useUser();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoaded || !viewer || !clerkId) return;
    fetch(`/api/profile/${clerkId}`)
      .then(async res => {
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Failed to load profile'); return; }
        setProfile(await res.json());
      })
      .catch(() => setError('Network error'));
  }, [authLoaded, viewer, clerkId]);

  if (!authLoaded) return null;
  if (!viewer) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Sign in to view profiles.</div>
      </main>
    );
  }
  if (error) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>{error}</div>
      </main>
    );
  }
  if (!profile) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      </main>
    );
  }

  const tier = getTier(profile.points || 0);
  const isOwnProfile = viewer.id === profile.clerkId;

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>

        {/* Header card */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Avatar profile={{ display_name: profile.displayName }} size={72} border={profile.equipped.border?.style} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <NameFlair name={profile.displayName} flair={profile.equipped.flair?.style} fontSize={18} fontWeight={800} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: `${tier.color}22`, color: tier.color }}>{tier.name}</span>
            {isOwnProfile && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280' }}>This is you</span>}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <StatCard label="Points" value={profile.points.toLocaleString()} />
          <StatCard label="Login Streak" value={`${profile.loginStreak}d`} />
          <StatCard label="Track Dash Best" value={profile.trackDashBest != null ? profile.trackDashBest : '—'} />
        </div>

        {/* Beat the Model record */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>Beat the Model</div>
          {profile.beatModel.total === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>No resolved picks yet.</div>
          ) : (
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>{profile.beatModel.correct}/{profile.beatModel.total}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Record</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', fontFamily: 'JetBrains Mono, monospace' }}>{profile.beatModel.hitPct.toFixed(0)}%</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Hit rate</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: profile.beatModel.streak > 0 ? '#16a34a' : '#111827', fontFamily: 'JetBrains Mono, monospace' }}>{profile.beatModel.streak}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Current streak</div>
              </div>
            </div>
          )}
        </div>

        {/* Badge case */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
            Badge Case ({profile.badges.length})
          </div>
          {profile.badges.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>No badges unlocked yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {profile.badges.map(b => <BadgeCard key={b.id} badge={b} />)}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
