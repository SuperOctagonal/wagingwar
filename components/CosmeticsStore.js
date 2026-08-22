'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Avatar from '@/components/Avatar';
import NameFlair from '@/components/NameFlair';
import { punterFallback } from '@/lib/punterFallback';

const G = '#00471b';
const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, diamond: 3 };
const TIER_COLORS = {
  bronze:   { bg: '#fdf4e7', border: '#d97706', text: '#92400e' },
  silver:   { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
  gold:     { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  diamond:  { bg: '#ecfeff', border: '#06b6d4', text: '#0e7490' },
};

async function api(path, opts) {
  try {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})`, status: res.status };
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

function TierTag({ tier }) {
  const c = TIER_COLORS[tier] || TIER_COLORS.bronze;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', padding: '2px 6px', borderRadius: 3, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {tier}
    </span>
  );
}

// Item preview -- what the cosmetic actually looks like, not just its name.
function ItemPreview({ item }) {
  if (item.category === 'border') {
    return <Avatar profile={{ display_name: 'YOU' }} size={40} border={item.style} />;
  }
  if (item.category === 'flair') {
    return <NameFlair name="your_name" flair={item.style} fontSize={13} fontWeight={700} />;
  }
  // badge
  const c = TIER_COLORS[item.tier] || TIER_COLORS.bronze;
  return (
    <div style={{ width: 40, height: 40, borderRadius: 10, background: item.style?.bg || c.bg, border: `1.5px solid ${item.style?.color || c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <i className={`ti ${item.style?.icon || 'ti-award'}`} style={{ fontSize: 18, color: item.style?.color || c.text }} />
    </div>
  );
}

function ItemCard({ item, owned, equipped, canAfford, busy, onUnlock, onEquip, onUnequip }) {
  const isBorderOrFlair = item.category === 'border' || item.category === 'flair';
  return (
    <div style={{
      border: `1px solid ${equipped ? G : '#e5e7eb'}`, borderRadius: 10, padding: '12px 14px',
      background: equipped ? '#f0fdf4' : '#fff', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ItemPreview item={item} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ marginTop: 3 }}><TierTag tier={item.tier} /></div>
        </div>
      </div>

      {!owned ? (
        <button type="button" onClick={onUnlock} disabled={busy || !canAfford}
          style={{
            background: canAfford ? G : '#f3f4f6', color: canAfford ? '#fff' : '#9ca3af',
            border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 11, fontWeight: 700,
            cursor: busy || !canAfford ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}>
          {busy ? 'Unlocking…' : canAfford ? `Unlock — ${item.credit_cost.toLocaleString()} credits` : `Need ${item.credit_cost.toLocaleString()} credits`}
        </button>
      ) : isBorderOrFlair ? (
        equipped ? (
          <button type="button" onClick={onUnequip} disabled={busy}
            style={{ background: '#fff', color: G, border: `1px solid ${G}`, borderRadius: 6, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Equipped — unequip'}
          </button>
        ) : (
          <button type="button" onClick={onEquip} disabled={busy}
            style={{ background: G, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Equipping…' : 'Equip'}
          </button>
        )
      ) : (
        <div style={{ fontSize: 11, fontWeight: 700, color: G, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-check" /> Owned
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
    </div>
  );
}

export default function CosmeticsStore() {
  const { user } = useUser();
  const [catalog, setCatalog] = useState(null);
  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState(new Set());
  const [equipped, setEquipped] = useState({ border: null, flair: null });
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const punterName = user ? (user.username || punterFallback(user.id)) : '';

  const loadMine = useCallback(async () => {
    const mine = await api('/api/cosmetics/mine');
    if (mine.error) return;
    setBalance(mine.balance || 0);
    setOwned(new Set(mine.owned || []));
    setEquipped(mine.equipped || { border: null, flair: null });
  }, []);

  useEffect(() => {
    api('/api/cosmetics/catalog').then(data => { if (!data.error) setCatalog(data.items); });
    loadMine();
  }, [loadMine]);

  function showToast(msg, isError) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleUnlock(item) {
    setBusyId(item.id);
    const res = await api('/api/cosmetics/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: item.id }),
    });
    setBusyId(null);
    if (res.error) { showToast(res.error, true); return; }
    showToast(`Unlocked ${item.name}`);
    await loadMine();
  }

  async function handleEquip(item) {
    setBusyId(item.id);
    const res = await api('/api/cosmetics/equip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: item.id }),
    });
    setBusyId(null);
    if (res.error) { showToast(res.error, true); return; }
    showToast(`Equipped ${item.name}`);
    await loadMine();
  }

  async function handleUnequip(item) {
    setBusyId(item.id);
    const res = await api('/api/cosmetics/equip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: null, category: item.category }),
    });
    setBusyId(null);
    if (res.error) { showToast(res.error, true); return; }
    showToast(`Unequipped ${item.name}`);
    await loadMine();
  }

  if (!catalog) return <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>;

  const byCategory = cat => catalog.filter(i => i.category === cat).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  const borders = byCategory('border');
  const flairs = byCategory('flair');
  const badges = byCategory('badge');
  const ownedBadges = badges.filter(b => owned.has(b.id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: 0 }}>Cosmetics</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: `1px solid ${G}33`, borderRadius: 20, padding: '4px 12px' }}>
          <i className="ti ti-coin" style={{ fontSize: 13, color: G }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: G }}>{balance.toLocaleString()}</span>
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
        Purely cosmetic — spend credits you&apos;ve already earned on avatar borders, name flair, and badges. Never purchasable with real money, never cashable. One equipped border and one equipped flair at a time; badges just accumulate below.
      </p>

      {/* Badge case -- every badge shown, owned ones in full tier colour,
          locked ones dimmed with their price. Self-view only for now (no
          public profile page exists in this app yet to show it to others). */}
      <Section title={`My Badge Case (${ownedBadges.length}/${badges.length})`}>
        {badges.map(item => (
          <ItemCard key={item.id} item={item} owned={owned.has(item.id)} equipped={false}
            canAfford={balance >= item.credit_cost} busy={busyId === item.id}
            onUnlock={() => handleUnlock(item)} onEquip={() => {}} onUnequip={() => {}} />
        ))}
      </Section>

      <Section title="Avatar Borders — The Silks Collection">
        {borders.map(item => (
          <ItemCard key={item.id} item={item} owned={owned.has(item.id)} equipped={equipped.border === item.id}
            canAfford={balance >= item.credit_cost} busy={busyId === item.id}
            onUnlock={() => handleUnlock(item)} onEquip={() => handleEquip(item)} onUnequip={() => handleUnequip(item)} />
        ))}
      </Section>

      <Section title="Name Flair">
        {flairs.map(item => (
          <ItemCard key={item.id} item={item} owned={owned.has(item.id)} equipped={equipped.flair === item.id}
            canAfford={balance >= item.credit_cost} busy={busyId === item.id}
            onUnlock={() => handleUnlock(item)} onEquip={() => handleEquip(item)} onUnequip={() => handleUnequip(item)} />
        ))}
      </Section>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? '#dc2626' : G, color: '#fff', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
