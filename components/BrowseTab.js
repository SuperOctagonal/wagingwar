'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Avatar from '@/components/Avatar';
import NameFlair from '@/components/NameFlair';
import { TIER_ORDER, TIER_COLORS } from '@/lib/cosmeticsCatalog';

const G = '#00471b';

async function api(path, opts) {
  try {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Request failed (${res.status})`, status: res.status, ...data };
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

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

function ItemPreview({ item }) {
  if (item.category === 'border') return <Avatar profile={{ display_name: 'YOU' }} size={40} border={item.style} />;
  if (item.category === 'flair') return <NameFlair name="your_name" flair={item.style} fontSize={13} fontWeight={700} />;
  const c = TIER_COLORS[item.tier] || TIER_COLORS.maiden;
  return (
    <div style={{ width: 40, height: 40, borderRadius: 10, background: item.style?.bg || c.bg, border: `1.5px solid ${item.style?.color || c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <i className={`ti ${item.style?.icon || 'ti-award'}`} style={{ fontSize: 18, color: item.style?.color || c.text }} />
    </div>
  );
}

function BrowseCard({ item, owned, inBasket, onToggleBasket }) {
  return (
    <div style={{
      border: `1px solid ${inBasket ? G : '#e5e7eb'}`, borderRadius: 10, padding: '12px 14px',
      background: inBasket ? '#f0fdf4' : '#fff', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ItemPreview item={item} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ marginTop: 3 }}><TierTag tier={item.tier} /></div>
        </div>
      </div>

      {owned ? (
        <div style={{ fontSize: 11, fontWeight: 700, color: G, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-check" /> Owned
        </div>
      ) : (
        <button type="button" onClick={onToggleBasket}
          style={{
            background: inBasket ? '#fff' : G, color: inBasket ? G : '#fff',
            border: inBasket ? `1px solid ${G}` : 'none', borderRadius: 6, padding: '7px 10px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
          {inBasket ? `In basket — ${item.credit_cost.toLocaleString()} credits (remove)` : `Add — ${item.credit_cost.toLocaleString()} credits`}
        </button>
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

export default function BrowseTab({ onCheckedOut }) {
  const [catalog, setCatalog] = useState(null);
  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState(new Set());
  const [basket, setBasket] = useState(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  const [toast, setToast] = useState(null);

  const loadMine = useCallback(async () => {
    const mine = await api('/api/cosmetics/mine');
    if (mine.error) return;
    setBalance(mine.balance || 0);
    setOwned(new Set(mine.owned || []));
  }, []);

  useEffect(() => {
    api('/api/cosmetics/catalog').then(data => { if (!data.error) setCatalog(data.items); });
    loadMine();
  }, [loadMine]);

  function showToast(msg, isError) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleBasket(itemId) {
    setBasket(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  const basketItems = useMemo(() => (catalog || []).filter(i => basket.has(i.id)), [catalog, basket]);
  const basketTotal = useMemo(() => basketItems.reduce((sum, i) => sum + i.credit_cost, 0), [basketItems]);
  const canAfford = basketTotal <= balance;

  async function handleCheckout() {
    if (!basketItems.length) return;
    setCheckingOut(true);
    const res = await api('/api/cosmetics/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: [...basket] }),
    });
    setCheckingOut(false);
    if (res.error) {
      // Server is the source of truth on affordability -- this message
      // (and its needed/shortfall numbers) comes straight from the
      // checkout_cosmetics_basket RPC, not recomputed client-side, so it
      // can't drift out of sync with what actually got charged.
      showToast(res.error, true);
      return;
    }
    showToast(`Unlocked ${res.unlocked.length} item${res.unlocked.length !== 1 ? 's' : ''}!`);
    setBasket(new Set());
    await loadMine();
    onCheckedOut?.();
  }

  if (!catalog) return <div style={{ padding: 16, fontSize: 13, color: '#9ca3af' }}>Loading…</div>;

  const byCategory = cat => catalog.filter(i => i.category === cat).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  const borders = byCategory('border');
  const flairs = byCategory('flair');
  const badges = byCategory('badge');

  return (
    <div style={{ padding: 16, maxWidth: 640, paddingBottom: basket.size ? 96 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Browse</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: `1px solid ${G}33`, borderRadius: 20, padding: '4px 12px' }}>
          <i className="ti ti-coin" style={{ fontSize: 13, color: G }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: G }}>{balance.toLocaleString()}</span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 20, lineHeight: 1.5 }}>
        Purely cosmetic — spend credits you&apos;ve already earned. Never purchasable with real money, never cashable. Add multiple items to your basket and unlock them all in one go.
      </p>

      <Section title="Avatar Borders — The Silks Collection">
        {borders.map(item => (
          <BrowseCard key={item.id} item={item} owned={owned.has(item.id)} inBasket={basket.has(item.id)} onToggleBasket={() => toggleBasket(item.id)} />
        ))}
      </Section>

      <Section title="Name Flair">
        {flairs.map(item => (
          <BrowseCard key={item.id} item={item} owned={owned.has(item.id)} inBasket={basket.has(item.id)} onToggleBasket={() => toggleBasket(item.id)} />
        ))}
      </Section>

      <Section title="Badges">
        {badges.map(item => (
          <BrowseCard key={item.id} item={item} owned={owned.has(item.id)} inBasket={basket.has(item.id)} onToggleBasket={() => toggleBasket(item.id)} />
        ))}
      </Section>

      {basket.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${G}`,
          padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', zIndex: 100,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{basket.size} item{basket.size !== 1 ? 's' : ''} in basket</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: canAfford ? '#111827' : '#dc2626' }}>
              {basketTotal.toLocaleString()} credits {!canAfford && `(need ${(basketTotal - balance).toLocaleString()} more)`}
            </div>
          </div>
          <button type="button" onClick={handleCheckout} disabled={checkingOut || !canAfford}
            style={{
              background: canAfford ? G : '#f3f4f6', color: canAfford ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
              cursor: checkingOut || !canAfford ? 'default' : 'pointer', opacity: checkingOut ? 0.6 : 1,
            }}>
            {checkingOut ? 'Unlocking…' : 'Unlock all'}
          </button>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: basket.size ? 90 : 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? '#dc2626' : G, color: '#fff', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: 320, textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
