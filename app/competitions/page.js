'use client';
import { useState } from 'react';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';

const COMP_RACES = [
  { id: 1, meeting: 'Randwick',      race: 'R3', time: '1:30pm', dist: '1200m', cls: 'BM78',   horses: ['Valiant Prince','Coastal Star','River Queen','Thunder Road','Golden Arrow'] },
  { id: 2, meeting: 'Flemington',    race: 'R5', time: '2:15pm', dist: '1600m', cls: 'G3',     horses: ['Monarch Bay','Swift Desire','Timeless Belle','First Option','Ironside'] },
  { id: 3, meeting: 'Eagle Farm',    race: 'R7', time: '3:00pm', dist: '1400m', cls: 'BM84',   horses: ['Sunlit Promise','Deep Impact','Royal Salute','Steel Magnolia','Chase The Dawn'] },
  { id: 4, meeting: 'Morphettville', race: 'R4', time: '3:45pm', dist: '2000m', cls: 'Listed', horses: ['Eternal Flame','Bold Venture','Highland Chief','Jade Dragon','Silver Spur'] },
  { id: 5, meeting: 'Doomben',       race: 'R6', time: '4:30pm', dist: '1000m', cls: 'BM72',   horses: ['Rocket Science','True North','Midnight Star','Desert Wind','Cool Runnings'] },
  { id: 6, meeting: 'Caulfield',     race: 'R8', time: '5:15pm', dist: '1800m', cls: 'G2',     horses: ['Phantom Force','Winged Victory','Ocean Surge','Fire Dance','Lucky Strike'] },
];

const LEADERBOARD = [
  { rank: 1, name: 'TrailBlazer99',   tier: 'Randwick Open',      pts: 28, picks: [true, true, false, true, true, true]   },
  { rank: 2, name: 'FleetwoodMac',    tier: 'Kembla Grange BM78', pts: 24, picks: [true, false, true, true, true, false]  },
  { rank: 3, name: 'HorseWhisperer',  tier: 'Emerald BM64',       pts: 20, picks: [true, true, true, false, false, true]  },
  { rank: 4, name: 'PunterPro',       tier: 'Grafton BM70',       pts: 18, picks: [false, true, true, true, false, true]  },
  { rank: 5, name: 'GoldCoastGambit', tier: 'Broken Hill Maiden', pts: 15, picks: [true, false, false, true, true, false] },
];

const HOW_IT_WORKS = [
  { emoji: '🎯', title: 'Free Entry',     desc: 'Enter every Saturday for free. No purchase required. Open to all Waging War members.' },
  { emoji: '🏇', title: 'Pick a Winner',  desc: 'Select your top pick in each of the 6 featured races from the dropdown.' },
  { emoji: '🏆', title: 'Points System',  desc: '5 points for each correct pick. Bonus points for long-shots paying $10+.' },
  { emoji: '📅', title: 'Weekly Reset',   desc: 'Leaderboard resets every Saturday. New competition, new chance to top the table.' },
  { emoji: '🎁', title: 'Top Prize',      desc: 'Weekly recognition for the member with the most points. More prizes coming soon.' },
];

const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

export default function CompetitionsPage() {
  const [tab, setTab] = useState('thisweek');
  const [picks, setPicks] = useState({});
  const isPro = useIsPro();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isMobile = useIsMobile();
  const handlePick = (raceId, horse) => setPicks(p => ({ ...p, [raceId]: horse }));
  const allPicked = COMP_RACES.every(r => picks[r.id]);

  return (
    <main className="mob-page" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>Saturday Comp</h1>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#dcfce7', color: '#166534' }}>FREE ENTRY</span>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Free weekly competition</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {[{ id: 'thisweek', label: 'This Week' }, { id: 'leaderboard', label: 'Leaderboard' }, { id: 'howitworks', label: 'How It Works' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? '#00471b' : 'transparent'}`, color: tab === t.id ? '#00471b' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* This Week */}
      {tab === 'thisweek' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ background: '#1a2634', padding: '12px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Saturday 14 June — 6 Races</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Pick one winner from each race. Entries close 12:00pm Saturday.</div>
          </div>
          {COMP_RACES.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, padding: '12px 16px', borderBottom: i < COMP_RACES.length - 1 ? '0.5px solid #e5e7eb' : 'none', flexWrap: isMobile ? 'wrap' : undefined }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a2634', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{r.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{r.meeting} {r.race}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{r.time}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#f3f4f6', color: '#6b7280' }}>{r.dist}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#eff6ff', color: '#1d4ed8' }}>{r.cls}</span>
                </div>
              </div>
              <select
                value={picks[r.id] || ''}
                onChange={e => handlePick(r.id, e.target.value)}
                style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: picks[r.id] ? '#f0fdf4' : '#fff', color: picks[r.id] ? '#065f46' : '#9ca3af', cursor: 'pointer', minWidth: isMobile ? 'auto' : 140, width: isMobile ? '100%' : undefined, flexBasis: isMobile ? '100%' : undefined }}>
                <option value="">Select horse…</option>
                {r.horses.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <div style={{ padding: '12px 16px', borderTop: '0.5px solid #e5e7eb', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: isMobile ? 'flex-start' : 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{Object.keys(picks).length}/{COMP_RACES.length} picks made</span>
            <button disabled={!allPicked}
              onClick={() => !isPro && setUpgradeOpen(true)}
              style={{ padding: '8px 20px', background: allPicked ? '#00471b' : '#e5e7eb', color: allPicked ? '#fff' : '#9ca3af', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: allPicked ? 'pointer' : 'default', width: isMobile ? '100%' : undefined }}>
              Submit Picks
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {tab === 'leaderboard' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ background: '#1a2634', padding: '10px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Week of 14 June</div>
          </div>
          {LEADERBOARD.map((e, i) => (
            <div key={e.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < LEADERBOARD.length - 1 ? '0.5px solid #e5e7eb' : 'none' }}>
              <span style={{ fontSize: 18, width: 28, flexShrink: 0, textAlign: 'center' }}>{MEDAL_EMOJI[i] || `#${e.rank}`}</span>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#00471b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {e.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{e.name}</div>
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{e.tier}</div>
              </div>
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {e.picks.map((p, pi) => (
                  <span key={pi} style={{ fontSize: 10, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: p ? '#dcfce7' : '#fee2e2', color: p ? '#166534' : '#991b1b' }}>
                    {p ? '✓' : '✗'}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#00471b', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{e.pts}</div>
            </div>
          ))}
        </div>
      )}

      {/* How It Works */}
      {tab === 'howitworks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {HOW_IT_WORKS.map(item => (
            <div key={item.title} style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #e5e7eb', padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{item.emoji}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 5 }}>{item.title}</div>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </main>
  );
}
