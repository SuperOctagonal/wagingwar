'use client';

import ProfileRail from '@/components/ProfileRail';

const GREEN = '#00471b';

function FreeBadge() {
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#dcfce7', color: '#166534', letterSpacing: '0.3px' }}>FREE</span>;
}
function ProBadge() {
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e', letterSpacing: '0.3px' }}>PRO</span>;
}
function MixedBadge() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#dcfce7', color: '#166534', letterSpacing: '0.3px' }}>FREE PREVIEW</span>
      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e', letterSpacing: '0.3px' }}>PRO DETAIL</span>
    </span>
  );
}
function ProPill() {
  return <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginLeft: 5, verticalAlign: 'middle', letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>Pro</span>;
}

const TOC = [
  { id: 'field',     icon: 'ti-layout-list',    title: 'Field tab',        badge: 'mixed' },
  { id: 'form',      icon: 'ti-notebook',        title: 'Form tab',         badge: 'free'  },
  { id: 'pace',      icon: 'ti-map',             title: 'Pace map',         badge: 'pro'   },
  { id: 'scoring',   icon: 'ti-chart-bar',       title: 'Scoring system',   badge: 'pro'   },
  { id: 'edge',      icon: 'ti-currency-dollar', title: 'Edge $ & Value %', badge: 'pro'   },
  { id: 'today',     icon: 'ti-calendar',        title: 'Today',            badge: 'mixed' },
  { id: 'results',   icon: 'ti-flag-check',      title: 'Results',          badge: 'mixed' },
  { id: 'mybets',    icon: 'ti-report-money',    title: 'My Bets & P&L',   badge: 'pro'   },
  { id: 'insights',  icon: 'ti-chart-line',      title: 'Insights',         badge: 'pro'   },
  { id: 'tools',     icon: 'ti-tool',            title: 'Betting tools',    badge: 'pro'   },
  { id: 'blackbook', icon: 'ti-bookmark',        title: 'Blackbook',        badge: 'pro'   },
  { id: 'community', icon: 'ti-users',           title: 'Community',        badge: 'mixed' },
  { id: 'comps',     icon: 'ti-trophy',          title: 'Competitions',     badge: 'pro'   },
  { id: 'settings',  icon: 'ti-settings',        title: 'Settings',         badge: 'mixed' },
];

function TocBadgeDot({ badge }) {
  if (badge === 'free')  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />;
  if (badge === 'pro')   return <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
    </span>
  );
}

export default function HowItWorksPage() {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', background: '#fff', scrollBehavior: 'smooth' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 24px 48px' }}>

          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>How It Works</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 28 }}>Everything you need to get the most out of the platform</p>

          {/* Badge legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, fontSize: 11, color: '#374151' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#dcfce7', color: '#166534' }}>FREE</span> Available on all plans</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e' }}>PRO</span> Requires Pro subscription</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#dcfce7', color: '#166534' }}>FREE PREVIEW</span><span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e' }}>PRO DETAIL</span> Some features free, full detail requires Pro</span>
          </div>

          {/* Table of contents */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 40 }}>
            {TOC.map(t => (
              <a key={t.id} href={`#${t.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '0.5px solid #e5e7eb', borderRadius: 7, textDecoration: 'none', background: '#f9fafb', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = GREEN}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <i className={`ti ${t.icon}`} style={{ fontSize: 14, color: GREEN, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', flex: 1, lineHeight: 1.3 }}>{t.title}</span>
                <TocBadgeDot badge={t.badge} />
              </a>
            ))}
          </div>

          {/* ── Section cards ── */}

          {/* 1. Field tab */}
          <div id="field" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-layout-list" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Field tab</span>
              <MixedBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>The Field tab is your main race analysis view. Every runner is scored across four factor groups and ranked highest to lowest — rank 1 is the model&apos;s top selection.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Rank — the model&apos;s top pick is rank 1, highlighted in gold<ProPill /></li>
              <li>Last 4 runs — colour-coded finishing positions (gold = 1st, silver = 2nd, bronze = 3rd)</li>
              <li>Career record — starts-wins-seconds-thirds</li>
              <li>Form / Speed / Conditions / Connections — four scored factor groups feeding the total score</li>
              <li>Score — total model score out of 100<ProPill /></li>
              <li>Edge $ — our model&apos;s fair value price for the runner<ProPill /></li>
              <li>Value % — the gap between our price and the market&apos;s — green means value, red means overbet<ProPill /></li>
              <li>Pace — expected running position: Leader, Presser, Midfield, Closer or Backmarker</li>
              <li>Click any horse name to open its full career stats popup</li>
            </ul>
          </div>

          {/* 2. Form tab */}
          <div id="form" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-notebook" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Form tab</span>
              <FreeBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Every runner sorted by tab/barrier number, with a detailed card for each horse.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Tab number and barrier position</li>
              <li>Career record and win percentage</li>
              <li>Sire, dam, grandsire and preferred win distances</li>
              <li>Last 4 runs — date, track, class, distance, weight, starting price, margin</li>
              <li>Jockey and trainer 12-month stats at this track</li>
              <li>Jockey-trainer combination record</li>
              <li>1st-up and 2nd-up form splits</li>
              <li>Course and distance record</li>
            </ul>
          </div>

          {/* 3. Pace map */}
          <div id="pace" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-map" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Pace map</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>The Pace Map plots every runner by their expected position in the run, sorted by barrier so you can see the shape of the race at a glance.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Leaders — expected to lead or fight for the front</li>
              <li>Pressers — on-pace, sitting just off the leader</li>
              <li>Midfield — settling in the middle of the pack</li>
              <li>Closers — run on from off the pace</li>
              <li>Backmarkers — trail the field</li>
              <li>A lone leader is a big advantage — watch for single-Leader races</li>
              <li>Wide barriers drawn into Leader/Presser roles can be disadvantaged in big fields</li>
            </ul>
          </div>

          {/* 4. Scoring system */}
          <div id="scoring" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-chart-bar" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Scoring system</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Every horse is scored across four factor groups. The combined total determines the rank order.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Form — recent finishing positions, class of race, days since last start</li>
              <li>Speed — sectional and race-time ratings relative to class</li>
              <li>Conditions — suitability to the declared track condition (Good/Soft/Heavy/Synthetic)</li>
              <li>Connections — jockey and trainer form, combo record, course and distance stats</li>
              <li>Weights panel — adjust how much each group counts toward the total score</li>
              <li>Track condition toggle — re-score the whole field instantly under a different track condition, without waiting for the real condition to change</li>
              <li>Score runs 0–100. Above 60 is strong, above 70 is elite</li>
            </ul>
          </div>

          {/* 5. Edge $ and Value % */}
          <div id="edge" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-currency-dollar" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Edge $ and Value %</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Edge $ is our model&apos;s fair value price for each runner. Value % shows how that compares to the market.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Edge $ — what the model thinks the horse should pay</li>
              <li>Value % — the percentage gap between the market price and Edge $</li>
              <li>+30% or higher is strong value — look for well-ranked horses with high value %</li>
              <li>Negative value means the market price is shorter than our price — possibly overbet</li>
              <li>Betting to value over time produces better long-run returns than backing favourites</li>
            </ul>
          </div>

          {/* 6. Today */}
          <div id="today" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-calendar" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Today</span>
              <MixedBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Your at-a-glance view of everything running today.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Every meeting and race running today, with countdowns to the next jump</li>
              <li>Today&apos;s top picks — the model&apos;s highest-ranked selections across the day<ProPill /></li>
              <li>Scratchings and late changes as they come in</li>
              <li>Track condition shown per meeting</li>
            </ul>
          </div>

          {/* 7. Results */}
          <div id="results" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-flag-check" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Results</span>
              <MixedBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Browse how today&apos;s races actually panned out — and how the model performed.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Full results for every race, every meeting, today</li>
              <li>Model performance — how the model&apos;s top picks actually finished<ProPill /></li>
              <li>Upsets — biggest results the model didn&apos;t see coming<ProPill /></li>
              <li>Barrier bias, pace bias and weight-class breakdowns across the day<ProPill /></li>
              <li>Browse any past date — today&apos;s results are always free<ProPill /></li>
            </ul>
          </div>

          {/* 8. My Bets */}
          <div id="mybets" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-report-money" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>My Bets and P&amp;L</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Log every bet and track your running profit, loss and ROI over time.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Log a bet directly from the Field tab, or with the Quick Log form</li>
              <li>Enter stake, odds and bookmaker</li>
              <li>Bets are settled automatically as results come in, or you can settle manually</li>
              <li>Switch between Table, Terminal, Sessions or Kanban views of your bet log</li>
              <li>Export your full bet history to CSV any time</li>
            </ul>
          </div>

          {/* 9. Insights */}
          <div id="insights" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-chart-line" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Insights</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Your betting performance, broken down.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Win rate, average odds and overall ROI</li>
              <li>Performance broken down by bookmaker, track and bet type</li>
              <li>Track your edge over time, not just your balance</li>
            </ul>
          </div>

          {/* 10. Betting tools */}
          <div id="tools" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-tool" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Betting tools</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>A professional staking and pricing suite, in one place.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Kelly staking — calculates the mathematically optimal stake size from your edge and bankroll, with Full/Half/Quarter Kelly options</li>
              <li>Dutching — spreads a stake across multiple runners so your return is equal no matter which one wins</li>
              <li>Each-way dutch — dutches the win and place pools separately so returns are balanced across runners</li>
              <li>Multi builder — build and price multi-leg bets, see combined odds and potential payout instantly</li>
              <li>EV calculator — check whether a bet has positive expected value against your own probability estimate</li>
              <li>Odds converter — convert instantly between decimal, fractional, American and implied probability</li>
              <li>Quick tools — a pinned strip for fast odds conversion and EV checks without leaving the page</li>
            </ul>
          </div>

          {/* 11. Blackbook */}
          <div id="blackbook" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-bookmark" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Blackbook</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Keep a personal watchlist of horses to follow.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Add any horse straight from the Races page</li>
              <li>Get alerted when a blackbooked horse is running again</li>
              <li>See every run since you blackbooked it, with its own flat-stake P&amp;L</li>
              <li>Earn points when a blackbooked horse wins</li>
            </ul>
          </div>

          {/* 12. Community */}
          <div id="community" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-users" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Community</span>
              <MixedBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Share tips, analysis and race-day chat with other punters.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Post and reply in Today&apos;s Races, Tips &amp; Analysis, Winning Bets or General Chat<ProPill /></li>
              <li>Earn points for activity: posting, replying, upvotes received, logging bets, logging winners, and blackbook wins</li>
              <li>Your rank is named after an Australian race, climbing a ladder of over 260 tiers from Adaminaby Picnic Maiden up to the Melbourne Cup</li>
              <li>Click your tier badge to see the full ladder</li>
              <li>Browse and upvote posts for free — posting requires Pro</li>
            </ul>
          </div>

          {/* 13. Competitions */}
          <div id="comps" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-trophy" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Competitions</span>
              <ProBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>A daily prediction contest built from the day&apos;s biggest meetings.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Each day, the top meetings by total prizemoney are automatically selected</li>
              <li>Pick a horse in each of the last four races at each selected meeting</li>
              <li>Score 3 points for a winning pick, 2 for second, 1 for third</li>
              <li>Get all four picks right at a meeting and earn a bonus</li>
              <li>Leaderboard tracks All-time, Yearly, Monthly and Weekly standings</li>
            </ul>
          </div>

          {/* 14. Settings */}
          <div id="settings" style={{ border: '0.5px solid #e5e7eb', borderLeft: `3px solid ${GREEN}`, background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-settings" style={{ fontSize: 18, color: GREEN }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Settings</span>
              <MixedBadge />
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>Set your defaults once, use them everywhere.</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9, margin: '10px 0 0 0' }}>
              <li>Profile, avatar and display preferences</li>
              <li>Default bookmaker, stake and bet type for faster bet logging<ProPill /></li>
              <li>Page-level defaults for Races, My Bets, Insights and Competitions<ProPill /></li>
              <li>Manage your subscription and billing anytime</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}
