'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { useState, useEffect, useRef } from 'react';
import useIsPro from '@/hooks/useIsPro';

const NAV_LINKS = [
  { id: 'races',        label: 'Races',        href: '/races',        public: true },
  { id: 'today',        label: 'Today',        href: '/today' },
  { id: 'results',      label: 'Results',      href: '/results' },
  { id: 'mybets',       label: 'My Bets',      href: '/mybets' },
  { id: 'insights',     label: 'Insights',     href: '/insights' },
  { id: 'community',    label: 'Community',    href: '/community' },
  { id: 'competitions', label: 'Competitions', href: '/competitions' },
  { id: 'blackbook',    label: 'Blackbook',    href: '/blackbook' },
  { id: 'upcoming',     label: 'Upcoming',     href: '/upcoming',     public: true },
  { id: 'learn',        label: 'Learn',        href: '/learn' },
];

const MOB_TABS = [
  { id: 'races',        label: 'Racing',    icon: 'horse-toy',    public: true },
  { id: 'today',        label: 'Today',     icon: 'calendar' },
  { id: 'mybets',       label: 'My Bets',   icon: 'report-money' },
  { id: 'insights',     label: 'Insights',  icon: 'chart-bar' },
  { id: 'results',      label: 'Results',   icon: 'flag-check' },
  { id: 'community',    label: 'Community', icon: 'users' },
  { id: 'competitions', label: 'Comps',     icon: 'trophy' },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut, openSignIn } = useClerk();
  const isPro = useIsPro();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLearnMenu, setShowLearnMenu] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navRefreshing, setNavRefreshing] = useState(false);
  const dropdownRef = useRef(null);

  // Derive current page id from pathname
  const currentPage = pathname === '/' ? 'home' : pathname.slice(1).split('/')[0];

  function handleRefresh() {
    if (navRefreshing) return;
    setNavRefreshing(true);
    router.refresh();
    window.dispatchEvent(new CustomEvent('ww:refresh'));
    setTimeout(() => setNavRefreshing(false), 1500);
  }

  function navigate(href, isPublic) {
    if (!isPublic && !user) {
      openSignIn({ redirectUrl: href });
      return;
    }
    router.push(href);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const initial = user
    ? (user.firstName || user.emailAddresses?.[0]?.emailAddress || 'U').charAt(0).toUpperCase()
    : null;

  return (
    <>
      {/* ── TOP NAV ── */}
      <nav className="bg-brand h-11 flex-shrink-0 flex items-center px-3.5 gap-0 border-b border-[#003314]">
        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginRight: 16, textDecoration: 'none' }}>
          <img src="/images/icon-app.png" alt="Waging War" style={{ height: 36, width: 36, objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span className="font-bold text-white text-lg tracking-wider leading-none">WAGING WAR</span>
            <span className="text-yellow-400 text-xs tracking-widest font-semibold leading-none">RACING ANALYTICS</span>
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex h-full flex-1">
          {NAV_LINKS.map(link => {
            if (link.id === 'learn') {
              return (
                <div key={link.id} style={{ position: 'relative' }} onMouseEnter={() => setShowLearnMenu(true)} onMouseLeave={() => setShowLearnMenu(false)}>
                  <button
                    onClick={() => navigate(link.href, link.public)}
                    className={[
                      'h-full px-[11px] font-space text-[10px] font-semibold uppercase tracking-[0.5px]',
                      'border-b-2 whitespace-nowrap transition-colors',
                      currentPage === link.id
                        ? 'text-white border-amber-400'
                        : 'text-white/55 border-transparent hover:text-white/85',
                    ].join(' ')}
                  >
                    {link.label} ▾
                  </button>
                  {showLearnMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 460, padding: '8px 0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 16px 6px' }}>Races page</div>
                          {[
                            { icon: 'ti-layout-list', label: 'Field tab',      desc: 'Ranked runners by score',   id: 'field-tab' },
                            { icon: 'ti-notebook',    label: 'Form tab',       desc: 'Deep dive per runner',      id: 'form-tab' },
                            { icon: 'ti-map',         label: 'Pace map',       desc: 'How the race unfolds',      id: 'pace-map' },
                            { icon: 'ti-chart-bar',   label: 'Scoring system', desc: 'How horses are ranked',     id: 'scoring-system' },
                          ].map(item => (
                            <button key={item.id} onClick={() => { setShowLearnMenu(false); router.push(`/learn#${item.id}`); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: '#00471b', width: 20, flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{item.label}</div>
                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{item.desc}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                        <div style={{ borderLeft: '1px solid #f3f4f6' }}>
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 16px 6px' }}>Betting tools</div>
                          {[
                            { icon: 'ti-currency-dollar', label: 'Edge $ & Value %',  desc: 'Finding value bets',        id: 'edge-value' },
                            { icon: 'ti-report-money',    label: 'My Bets & ROI',     desc: 'Track your performance',    id: 'my-bets' },
                            { icon: 'ti-users',           label: 'Community guide',   desc: 'Points, ranks & posting',   id: 'community-guide' },
                            { icon: 'ti-trophy',          label: 'Saturday comp',     desc: 'How competitions work',     id: 'saturday-comp' },
                          ].map(item => (
                            <button key={item.id} onClick={() => { setShowLearnMenu(false); router.push(`/learn#${item.id}`); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: '#00471b', width: 20, flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{item.label}</div>
                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{item.desc}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={link.id}
                onClick={() => navigate(link.href, link.public)}
                className={[
                  'h-full px-[11px] font-space text-[10px] font-semibold uppercase tracking-[0.5px]',
                  'border-b-2 whitespace-nowrap transition-colors',
                  currentPage === link.id
                    ? 'text-white border-amber-400'
                    : 'text-white/55 border-transparent hover:text-white/85',
                ].join(' ')}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex gap-2 items-center">
          <style>{`@keyframes ww-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <button
            onClick={handleRefresh}
            title="Refresh data"
            className="hidden sm:flex items-center justify-center w-7 h-7 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
          >
            <i className="ti ti-refresh" style={{ fontSize: 13, display: 'inline-block', animation: navRefreshing ? 'ww-spin 0.8s linear infinite' : 'none' }} />
          </button>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-[36px] h-[36px] rounded text-white/80 hover:text-white"
            onClick={() => setDrawerOpen(true)}
          >
            <i className="ti ti-menu-2" style={{ fontSize: 20 }} />
          </button>

          {/* Account button + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                if (!user) { openSignIn(); return; }
                setDropdownOpen(v => !v);
              }}
              className="bg-white/10 border border-white/20 rounded-md text-white text-[10px] font-semibold font-space px-2.5 py-[5px] flex items-center gap-[5px] min-w-[80px]"
            >
              {isLoaded && user ? (
                <>
                  <span className="w-[22px] h-[22px] rounded-full bg-amber-400 text-gray-900 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                    {initial}
                  </span>
                  <span className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {user.firstName || 'Account'}
                  </span>
                  <span style={{ background: isPro ? '#FAEEDA' : '#E1F5EE', color: isPro ? '#854F0B' : '#0F6E56', fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                    {isPro ? 'PRO' : 'FREE'}
                  </span>
                </>
              ) : (
                <>
                  <i className="ti ti-user text-sm" />
                  <span>Sign in</span>
                </>
              )}
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && user && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                {/* User info header */}
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-900 truncate">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.firstName || 'Account'}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {user.emailAddresses?.[0]?.emailAddress}
                  </div>
                </div>
                {/* Menu items */}
                {[
                  { label: 'My Account',  icon: 'user-circle', href: '/account' },
                  { label: 'Community',   icon: 'users',       href: '/community' },
                  { label: 'Settings',    icon: 'settings',    href: '/settings' },
                ].map(item => (
                  <button
                    key={item.href}
                    onClick={() => { setDropdownOpen(false); router.push(item.href); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                  >
                    <i className={`ti ti-${item.icon} text-sm text-gray-400`} />
                    {item.label}
                  </button>
                ))}
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => { setDropdownOpen(false); signOut(() => router.push('/')); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                  >
                    <i className="ti ti-logout text-sm text-red-400" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── MOBILE NAV DRAWER ── */}
      {drawerOpen && (
        <>
          {/* Overlay */}
          <div
            className="md:hidden fixed inset-0 z-[9997]"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <div
            className="md:hidden fixed top-0 left-0 bottom-0 flex flex-col z-[9998]"
            style={{ width: 280, background: '#1B4332', transform: 'translateX(0)', transition: 'transform 0.25s ease' }}
          >
            {/* Drawer header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <Link href="/" onClick={() => setDrawerOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <img src="/images/icon-app.png" alt="Waging War" style={{ height: 28, width: 28, objectFit: 'contain' }} />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span className="font-bold text-white text-base tracking-wider leading-none">WAGING WAR</span>
                  <span className="text-yellow-400 text-[9px] tracking-widest font-semibold leading-none">RACING ANALYTICS</span>
                </div>
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 20 }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {NAV_LINKS.map(link => (
                <button
                  key={link.id}
                  onClick={() => { setDrawerOpen(false); navigate(link.href, link.public); }}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', height: 48,
                    padding: '0 16px', gap: 12,
                    fontSize: 13, fontWeight: 600, textAlign: 'left',
                    background: currentPage === link.id ? 'rgba(255,255,255,0.07)' : 'none',
                    border: 'none', borderLeft: currentPage === link.id ? '3px solid #6ee7b7' : '3px solid transparent',
                    color: currentPage === link.id ? '#6ee7b7' : 'rgba(255,255,255,0.75)',
                    cursor: 'pointer',
                  }}
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* User section at bottom */}
            {user && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#fbbf24', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {initial}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{user.firstName || 'Account'}</div>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: isPro ? '#FAEEDA' : '#E1F5EE', color: isPro ? '#854F0B' : '#0F6E56' }}>
                      {isPro ? 'PRO' : 'FREE'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => { setDrawerOpen(false); signOut(() => router.push('/')); }}
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MOBILE TAB BAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-brand border-t border-white/10 z-[1000] h-14 flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {MOB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(`/${tab.id}`, tab.public)}
            className={[
              'flex-1 min-w-[52px] flex flex-col items-center justify-center',
              'font-space text-[9px] font-semibold whitespace-nowrap border-t-2 transition-colors',
              currentPage === tab.id
                ? 'text-amber-400 border-amber-400'
                : 'text-white/45 border-transparent',
            ].join(' ')}
          >
            <i className={`ti ti-${tab.icon} text-[15px] mb-0.5`} />
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}
