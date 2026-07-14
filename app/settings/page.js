'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const G = '#00471b';

async function sbFetch(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[settings sbFetch]', path, res.status, errBody);
      return null;
    }
    const t = await res.text();
    return t ? JSON.parse(t) : true;
  } catch (err) {
    console.error('[settings sbFetch] network error:', err);
    return null;
  }
}

const NAV = [
  { key: 'profile',       label: 'Profile',          pro: false },
  { key: 'notifications', label: 'Notifications',    pro: false },
  { key: 'betting',       label: 'Betting defaults', pro: true  },
  { key: 'races',         label: 'Races page',       pro: true  },
  { key: 'mybets',        label: 'My Bets',          pro: true  },
  { key: 'insights',      label: 'Insights',         pro: true  },
  { key: 'competition',   label: 'Competition',      pro: true  },
  { key: 'display',       label: 'Display',          pro: false },
  { key: 'privacy',       label: 'Data & privacy',   pro: false },
  { key: 'subscription',  label: 'Subscription',     pro: false },
];

const DEFAULTS = {
  displayName: '', state: 'QLD',
  notifRank1: false, notifBlackbooked: false,
  notifCountdown: 'off', notifSettled: false, notifComp: 'off', notifReply: false,
  defBookmaker: 'Sportsbet', defStake: '', defBetType: 'Win', oddsFormat: 'Decimal',
  bankroll: '', stakingAlert: '',
  racesTab: 'Field', racesGroup: 'All', racesMinRunners: 'None',
  colForm: true, colSpeed: true, colConditions: true, colConnections: true,
  colScore: true, colEdge: true, colValue: true,
  mybetsRange: 'All time', mybetsView: 'Table', mybetsShowScratched: true,
  insightsPeriod: 'All time', insightsMinBets: 5, kellyFraction: 'Half Kelly',
  compAutoEnter: false, compShowPicks: true, compLeaderboard: true,
  theme: 'Dark', density: 'Comfortable', fontSize: 'Medium',
};

function initials(name) {
  if (!name?.trim()) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none',
        cursor: 'pointer', background: on ? G : '#d1d5db',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  );
}

function Inp({ value, onChange, type = 'text', placeholder = '', readOnly = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => !readOnly && onChange(e.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      style={{
        border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px',
        fontSize: 13, width: 280, background: readOnly ? '#f9fafb' : '#fff',
        color: readOnly ? '#9ca3af' : '#111', boxSizing: 'border-box',
        outline: 'none', display: 'block',
      }}
    />
  );
}

function Sel({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px',
        fontSize: 13, background: '#fff', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function TRow({ label, hint, on, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      <Toggle on={on} onChange={onChange} />
      <div>
        <div style={{ fontSize: 13, color: '#111' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

function CSoon() {
  return (
    <span style={{
      fontSize: 10, background: '#fef3c7', color: '#92400e',
      borderRadius: 4, padding: '2px 5px', fontWeight: 600, marginLeft: 6,
    }}>coming soon</span>
  );
}

function SecTitle({ children }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 24px' }}>{children}</h2>;
}

function SaveBt({ saving, onClick }) {
  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f3f4f6' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        style={{
          background: G, color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 28px', fontSize: 13, fontWeight: 600,
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
        }}
      >{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}

function UpgradeOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
    }}>
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: '32px 40px', textAlign: 'center', maxWidth: 300,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>&#128274;</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 8 }}>Pro feature</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>
          Upgrade to unlock this section and 5 more Pro-only settings.
        </div>
        <a
          href="/account"
          style={{
            display: 'inline-block', background: G, color: '#fff', borderRadius: 8,
            padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >Upgrade to Pro</a>
      </div>
    </div>
  );
}

function ProGate({ isPro, children }) {
  if (isPro) return children;
  return (
    <div style={{ position: 'relative', minHeight: 280 }}>
      <div style={{ opacity: 0.12, filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <UpgradeOverlay />
    </div>
  );
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const isPro = useIsPro();
  const [active, setActive] = useState('profile');
  const [s, setS] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [clearStep, setClearStep] = useState(0);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteError, setDeleteError] = useState(null);
  const [portalState, setPortalState] = useState('idle'); // idle | loading | error
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    const clerkName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (!SURL || !SKEY) {
      setS(prev => ({ ...prev, displayName: prev.displayName || clerkName }));
      return;
    }
    sbFetch(`user_settings?clerk_id=eq.${encodeURIComponent(user.id)}&select=settings`).then(rows => {
      const saved = rows?.[0]?.settings || {};
      setS({ ...DEFAULTS, ...saved, displayName: saved.displayName || clerkName });
    });
  }, [user?.id]);

  const set = useCallback((k, v) => setS(prev => ({ ...prev, [k]: v })), []);

  function showToast(t) {
    setToast(t);
    setTimeout(() => setToast(null), 2500);
  }

  async function save() {
    if (!user?.id) return;
    setSaving(true);
    const [res] = await Promise.all([
      sbFetch('user_settings?on_conflict=clerk_id', {
        method: 'POST',
        prefer: 'return=minimal,resolution=merge-duplicates',
        body: { clerk_id: user.id, settings: s, updated_at: new Date().toISOString() },
      }),
      sbFetch(`user_profiles?clerk_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { hide_from_lb: s.compLeaderboard === false },
      }),
    ]);
    setSaving(false);
    showToast(res !== null ? 'saved' : 'error');
  }

  async function exportCSV() {
    if (!user?.id) return;
    const rows = await sbFetch(`bet_log?clerk_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`);
    if (!rows?.length) { alert('No bets found.'); return; }
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'wagingwar_bets.csv',
    });
    a.click();
  }

  async function openPortal() {
    setPortalState('loading');
    try {
      const res = await fetch('/api/create-portal-session', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPortalState('error');
        setTimeout(() => setPortalState('idle'), 4000);
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalState('error');
      setTimeout(() => setPortalState('idle'), 4000);
    }
  }

  async function clearBets() {
    if (!user?.id) return;
    setClearStep(2);
    const res = await sbFetch(`bet_log?clerk_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    setClearStep(0);
    showToast(res !== null ? 'cleared' : 'error');
  }

  async function deleteAccount() {
    if (!user?.id) return;
    setDeleteStep(2);
    setDeleteError(null);
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteStep(1);
        setDeleteError(data.error || 'Deletion failed — try again or contact support');
        return;
      }
      await signOut({ redirectUrl: '/' });
    } catch {
      setDeleteStep(1);
      setDeleteError('Network error — check your connection and try again');
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB');
      setTimeout(() => setAvatarError(null), 4000);
      return;
    }
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await user.setProfileImage({ file });
    } catch (err) {
      setAvatarError(err?.message || 'Upload failed — try again');
      setTimeout(() => setAvatarError(null), 4000);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await user.setProfileImage({ file: null });
    } catch (err) {
      setAvatarError(err?.message || 'Remove failed — try again');
      setTimeout(() => setAvatarError(null), 4000);
    } finally {
      setAvatarUploading(false);
    }
  }

  const email = user?.emailAddresses?.[0]?.emailAddress || '';
  const avatarInitials = initials(s.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' '));

  function renderSection() {
    switch (active) {

      case 'profile': return (
        <>
          <SecTitle>Profile</SecTitle>
          <Field label="Display name">
            <Inp value={s.displayName} onChange={v => set('displayName', v)} placeholder="Your name" />
          </Field>
          <Field label="Email" hint="Managed by your account provider">
            <Inp value={email} onChange={() => {}} readOnly />
          </Field>
          <Field label="State">
            <Sel value={s.state} onChange={v => set('state', v)} options={['QLD','NSW','VIC','SA','WA','TAS','ACT','NT']} />
          </Field>
          <Field label="Avatar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {user?.hasImage
                ? <img src={user.imageUrl} alt="avatar" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e5e7eb', flexShrink: 0 }} />
                : <div style={{ width: 48, height: 48, borderRadius: '50%', background: G, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>{avatarInitials}</div>
              }
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  style={{ background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: avatarUploading ? 'default' : 'pointer', opacity: avatarUploading ? 0.6 : 1 }}
                >
                  {avatarUploading ? 'Uploading…' : 'Upload photo'}
                </button>
                {user?.hasImage && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    disabled={avatarUploading}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#9ca3af', cursor: avatarUploading ? 'default' : 'pointer', textAlign: 'left', textDecoration: 'underline' }}
                  >
                    Remove photo
                  </button>
                )}
                {avatarError && <div style={{ fontSize: 11, color: '#dc2626' }}>{avatarError}</div>}
              </div>
            </div>
          </Field>
          <SaveBt saving={saving} onClick={save} />
        </>
      );

      case 'notifications': return (
        <>
          <SecTitle>Notifications</SecTitle>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: -8, marginBottom: 24 }}>
            Choose your preferences below, then save.
          </p>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Pro only</div>
          {!isPro && (
            <a href="/account" style={{ fontSize: 12, color: G, fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginBottom: 14 }}>Unlock Pro features →</a>
          )}
          {[
            ['notifCountdown', 'Race countdown reminder', ['15min','5min','off']],
            ['notifComp',      'Daily competition reminder', ['1hr','30min','off']],
          ].map(([k, label, opts]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, opacity: isPro ? 1 : 0.5, pointerEvents: isPro ? 'auto' : 'none' }}>
              {isPro
                ? <Sel value={s[k]} onChange={v => set(k, v)} options={opts} />
                : <span style={{ fontSize: 13 }}>&#128274;</span>}
              <span style={{ fontSize: 13 }}>{label}</span>
            </div>
          ))}
          {[
            ['notifSettled',     'Bet result settled'],
            ['notifReply',       'Community reply'],
            ['notifRank1',       'Rank 1 horse scratched'],
            ['notifBlackbooked', 'Blackbooked horse scratched'],
          ].map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, opacity: isPro ? 1 : 0.5, pointerEvents: isPro ? 'auto' : 'none' }}>
              {isPro
                ? <Toggle on={s[k]} onChange={v => set(k, v)} />
                : <span style={{ fontSize: 13 }}>&#128274;</span>}
              <span style={{ fontSize: 13 }}>{label}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 24 }}>
            Not yet delivering — we&apos;ll notify you here when this launches.
          </div>
          <SaveBt saving={saving} onClick={save} />
        </>
      );

      case 'betting': return (
        <ProGate isPro={isPro}>
          <>
            <SecTitle>Betting defaults</SecTitle>
            <Field label="Default bookmaker">
              <Sel value={s.defBookmaker} onChange={v => set('defBookmaker', v)}
                options={['Sportsbet','TAB','Ladbrokes','Neds','Betfair','Bet365']} />
            </Field>
            <Field label="Default stake ($)">
              <Inp type="number" value={s.defStake} onChange={v => set('defStake', v)} placeholder="50" />
            </Field>
            <Field label="Default bet type">
              <Sel value={s.defBetType} onChange={v => set('defBetType', v)} options={['Win','Place','Each-way']} />
            </Field>
            <Field label="Odds format">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ opacity: 0.4, pointerEvents: 'none' }}>
                  <Sel value={s.oddsFormat} onChange={() => {}} options={['Decimal','Fractional']} />
                </div>
                <CSoon />
              </div>
            </Field>
            <Field label="Bankroll ($)" hint="Used to calculate Kelly stake on the Insights page">
              <Inp type="number" value={s.bankroll} onChange={v => set('bankroll', v)} placeholder="1000" />
            </Field>
            <Field label="Staking alert threshold ($)" hint="Warn if a single bet exceeds this amount">
              <Inp type="number" value={s.stakingAlert} onChange={v => set('stakingAlert', v)} placeholder="200" />
            </Field>
            <SaveBt saving={saving} onClick={save} />
          </>
        </ProGate>
      );

      case 'races': return (
        <ProGate isPro={isPro}>
          <>
            <SecTitle>Races page</SecTitle>
            <Field label="Default tab">
              <Sel value={s.racesTab} onChange={v => set('racesTab', v)} options={['Field','Form','Pace Map']} />
            </Field>
            <Field label="Default scoring group" hint="Sets the starting weight emphasis when you open the Races page">
              <Sel value={s.racesGroup} onChange={v => set('racesGroup', v)} options={['All','Speed','Form','Connections','Conditions']} />
            </Field>
            <Field label="Minimum runners filter" hint="Races with fewer runners are hidden by default">
              <Sel value={s.racesMinRunners} onChange={v => set('racesMinRunners', v)} options={['None','4','6','8']} />
            </Field>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 10 }}>Column visibility</div>
              {[['colForm','Form'],['colSpeed','Speed'],['colConditions','Conditions'],
                ['colConnections','Connections'],['colScore','Score'],['colEdge','Edge'],['colValue','Value'],
              ].map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!s[k]} onChange={e => set(k, e.target.checked)}
                    style={{ accentColor: G, width: 15, height: 15 }} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
                </label>
              ))}
            </div>
            <SaveBt saving={saving} onClick={save} />
          </>
        </ProGate>
      );

      case 'mybets': return (
        <ProGate isPro={isPro}>
          <>
            <SecTitle>My Bets</SecTitle>
            <Field label="Default date range">
              <Sel value={s.mybetsRange} onChange={v => set('mybetsRange', v)}
                options={['Today','This week','This month','All time']} />
            </Field>
            <Field label="Default view">
              <Sel value={s.mybetsView} onChange={v => set('mybetsView', v)}
                options={['Table','Terminal','Sessions','Kanban']} />
            </Field>
            <TRow label="Show scratched bets" on={s.mybetsShowScratched} onChange={v => set('mybetsShowScratched', v)} />
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, padding: '10px 12px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              Bets are automatically matched to results when you open the page.
            </div>
            <SaveBt saving={saving} onClick={save} />
          </>
        </ProGate>
      );

      case 'insights': return (
        <ProGate isPro={isPro}>
          <>
            <SecTitle>Insights</SecTitle>
            <Field label="Default time period">
              <Sel value={s.insightsPeriod} onChange={v => set('insightsPeriod', v)}
                options={['All time','Last 90 days','This month']} />
            </Field>
            <Field label="Minimum bets for heatmap cell" hint="Cells with fewer bets are hidden to avoid noise">
              <Sel value={String(s.insightsMinBets)} onChange={v => set('insightsMinBets', +v)} options={['3','5','10']} />
            </Field>
            <Field label="Kelly fraction" hint="Half Kelly is recommended to reduce variance">
              <Sel value={s.kellyFraction} onChange={v => set('kellyFraction', v)}
                options={['Full Kelly','Half Kelly','Quarter Kelly']} />
            </Field>
            <SaveBt saving={saving} onClick={save} />
          </>
        </ProGate>
      );

      case 'competition': return (
        <ProGate isPro={isPro}>
          <>
            <SecTitle>Competition</SecTitle>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ marginTop: 1 }}><Toggle on={s.compAutoEnter} onChange={v => set('compAutoEnter', v)} /></div>
              <div>
                <div style={{ fontSize: 13, color: '#111' }}>Auto-enter with model rank 1 picks</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Automatically submits the model rank 1 pick for each race when you open the Competitions page. Won't submit picks if you don't visit that day.</div>
              </div>
            </div>
            <TRow
              label="Show my picks to other users"
              hint="Your picks count towards the Most Popular percentages"
              on={s.compShowPicks} onChange={v => set('compShowPicks', v)}
            />
            <TRow label="Appear on leaderboard" on={s.compLeaderboard} onChange={v => set('compLeaderboard', v)} />
            <SaveBt saving={saving} onClick={save} />
          </>
        </ProGate>
      );

      case 'display': return (
        <>
          <SecTitle>Display</SecTitle>
          <Field label="Theme">
            <div style={{ display: 'flex', gap: 20 }}>
              {[['Dark', false], ['Light', true]].map(([t, disabled]) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                  <input type="radio" name="theme" value={t} checked={s.theme === t}
                    onChange={() => !disabled && set('theme', t)} disabled={disabled}
                    style={{ accentColor: G }} />
                  <span style={{ fontSize: 13 }}>{t}</span>
                  {disabled && <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '1px 5px' }}>coming soon</span>}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Table density">
            <Sel value={s.density} onChange={v => set('density', v)} options={['Compact','Comfortable']} />
          </Field>
          <Field label="Table font size">
            <Sel value={s.fontSize} onChange={v => set('fontSize', v)} options={['Small','Medium','Large']} />
          </Field>
          <SaveBt saving={saving} onClick={save} />
        </>
      );

      case 'privacy': return (
        <>
          <SecTitle>Data &amp; privacy</SecTitle>
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
            To hide your picks from the Most Popular percentages, go to <strong>Competition</strong> settings and disable &ldquo;Show my picks to other users&rdquo;.
          </p>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Data management</div>

            <div style={{ marginBottom: 20 }}>
              <button type="button" onClick={exportCSV}
                style={{ background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                Export bets as CSV
              </button>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Download your full bet history</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              {clearStep === 0 && (
                <>
                  <button type="button" onClick={() => setClearStep(1)}
                    style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '9px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                    Clear all bets
                  </button>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Permanently delete your entire bet history</div>
                </>
              )}
              {clearStep >= 1 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>Clear all bets?</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>This will permanently delete all your bet history and cannot be undone.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={clearBets} disabled={clearStep === 2}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {clearStep === 2 ? 'Clearing…' : 'Yes, clear all bets'}
                    </button>
                    <button type="button" onClick={() => setClearStep(0)}
                      style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              {deleteStep === 0 && (
                <>
                  <button type="button" onClick={() => setDeleteStep(1)}
                    style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '9px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                    Delete account
                  </button>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Permanently delete your account and all data</div>
                </>
              )}
              {deleteStep === 1 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>Delete your account?</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Your Stripe subscription will be cancelled immediately. All your bets, picks, and settings will be permanently removed. This cannot be undone.</div>
                  {deleteError && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10, fontWeight: 600 }}>{deleteError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={deleteAccount}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Yes, delete my account
                    </button>
                    <button type="button" onClick={() => { setDeleteStep(0); setDeleteError(null); }}
                      style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {deleteStep === 2 && <div style={{ fontSize: 13, color: '#6b7280' }}>Deleting account…</div>}
            </div>
          </div>
        </>
      );

      case 'subscription': return (
        <>
          <SecTitle>Subscription</SecTitle>
          <div style={{
            background: isPro ? '#f0fdf4' : '#f9fafb',
            border: `1px solid ${isPro ? '#86efac' : '#e5e7eb'}`,
            borderRadius: 10, padding: '16px 20px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: isPro ? G : '#374151' }}>
                {isPro ? 'Pro plan' : 'Free plan'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {isPro ? 'Full access to all Pro features' : 'Upgrade for full access'}
              </div>
            </div>
            <span style={{
              background: isPro ? G : '#e5e7eb', color: isPro ? '#fff' : '#374151',
              borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
            }}>{isPro ? 'PRO' : 'FREE'}</span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
              {isPro ? 'Included in your Pro plan' : 'What you unlock with Pro'}
            </div>
            {[
              'Betting defaults pre-filled on every bet',
              'Full Races page column visibility control',
              'My Bets: Sessions, Kanban & Terminal views',
              'Insights — full analytics & Kelly calculator',
              'Daily competition entry & leaderboard',
              'Pro notification alerts (coming soon)',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: G, fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                <span style={{ fontSize: 13, color: '#374151' }}>{f}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            {isPro ? (
              <>
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={portalState === 'loading'}
                  style={{ background: '#f9fafb', color: portalState === 'error' ? '#dc2626' : '#374151', border: `1px solid ${portalState === 'error' ? '#fca5a5' : '#d1d5db'}`, borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: portalState === 'loading' ? 'default' : 'pointer', opacity: portalState === 'loading' ? 0.7 : 1 }}
                >
                  {portalState === 'loading' ? 'Opening…' : portalState === 'error' ? 'Couldn\'t open portal — try again' : 'Manage billing'}
                </button>
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={portalState === 'loading'}
                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 12, cursor: portalState === 'loading' ? 'default' : 'pointer', padding: 0 }}
                >
                  Cancel via billing portal
                </button>
              </>
            ) : (
              <a href="/account" style={{
                display: 'inline-block', background: G, color: '#fff',
                borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>Upgrade to Pro</a>
            )}
          </div>
        </>
      );

      default: return null;
    }
  }

  if (!isLoaded) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f9fafb', overflow: 'hidden' }}>
      <div style={{ background: G, padding: '18px 24px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2, fontFamily: 'Bebas Neue, sans-serif' }}>
          Settings
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <nav style={{ width: 160, flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', paddingTop: 8, overflowY: 'auto' }}>
          {NAV.map(({ key, label, pro }) => {
            const locked = pro && !isPro;
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none',
                  background: isActive ? '#f0fdf4' : 'transparent',
                  borderLeft: `3px solid ${isActive ? G : 'transparent'}`,
                  padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                  color: locked ? '#9ca3af' : isActive ? G : '#374151',
                  fontWeight: isActive ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {locked && <span style={{ fontSize: 11 }}>&#128274;</span>}
                {label}
              </button>
            );
          })}
        </nav>

        <main style={{ flex: 1, padding: '32px 40px', maxWidth: 640, boxSizing: 'border-box', overflowY: 'auto' }}>
          {renderSection()}
        </main>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast === 'error' ? '#dc2626' : G,
          color: '#fff', borderRadius: 8, padding: '10px 20px',
          fontSize: 13, fontWeight: 600, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast === 'saved' ? 'Settings saved' : toast === 'cleared' ? 'All bets cleared' : toast === 'error' ? 'Failed — try again' : 'Failed to save — try again'}
        </div>
      )}
    </div>
  );
}
