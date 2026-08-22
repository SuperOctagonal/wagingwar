'use client';

import { useState } from 'react';
import BrowseTab from '@/components/BrowseTab';
import LockerTab from '@/components/LockerTab';

const G = '#00471b';
const CT_LINE = '#e5e7eb';
const SUB_TABS = [{ id: 'browse', label: 'Browse' }, { id: 'locker', label: 'My Locker' }];

// Container for the two Store halves -- Browse (catalog + basket checkout)
// and Locker (owned items + equip/unequip). Both existed independently
// first (Locker in batch 2, before Browse existed at all -- deliberately
// shown without this picker then, since a "Browse" tab that did nothing
// would have been worse than not having one). Now that both are real,
// this is the single entry point Games' Store tab renders.
export default function StoreTab() {
  const [sub, setSub] = useState('browse');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: `0.5px solid ${sub === t.id ? '#111827' : CT_LINE}`, cursor: 'pointer', fontFamily: 'inherit', background: sub === t.id ? '#111827' : '#fff', color: sub === t.id ? '#fff' : '#374151' }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'browse' ? <BrowseTab /> : <LockerTab />}
    </div>
  );
}
