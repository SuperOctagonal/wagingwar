import ProfileRail from '@/components/ProfileRail';

const SECTIONS = [
  {
    id: 'field-tab',
    icon: 'ti-layout-list',
    title: 'Field tab',
    live: true,
    desc: "The Field tab is your main race analysis view. Every runner in the field is scored across four factor groups and ranked highest to lowest — rank 1 is the model's top selection.",
    bullets: [
      "Rank — model's top pick is rank 1, highlighted in gold",
      'Last 4 runs — colour-coded finishing positions (gold=1st, silver=2nd, bronze=3rd)',
      'Career record — starts-wins-seconds-thirds',
      'Form / Speed / Conditions / Connections — four scored factor groups',
      'Score — total model score out of 100',
      'Edge $ — our fair value price for the runner',
      'Live $ — current market odds',
      'Value % — gap between Edge and Live. Green = value, red = overbet',
      'Pace — expected race position (Leader/Presser/Midfield/Closer/Backmarker)',
      'Click any horse name to see full career stats popup',
    ],
  },
  {
    id: 'form-tab',
    icon: 'ti-notebook',
    title: 'Form tab',
    live: true,
    desc: 'The Form tab shows every runner sorted by tab/barrier number, with a detailed card for each horse.',
    bullets: [
      'Tab number and barrier position',
      'Career record and win percentage',
      'Sire, dam, grandsire and win distances',
      'Last 4 runs: date, track, class, distance, weight, SP, margin',
      'Jockey 12-month stats at this track',
      'Trainer 12-month stats at this track',
      'Jockey-trainer combo record',
      '1st-up and 2nd-up split records',
      'Course & distance record',
    ],
  },
  {
    id: 'pace-map',
    icon: 'ti-map',
    title: 'Pace map',
    live: true,
    desc: 'The Pace Map plots every runner by their expected position in the run — sorted by barrier number so you can see the shape of the race at a glance.',
    bullets: [
      'Leaders — horses expected to lead or fight for the front',
      'Pressers — on-pace horses sitting just off the leader',
      'Midfield — horses settling in the middle of the pack',
      'Closers — horses who run on from off the pace',
      'Backmarkers — horses that will trail the field',
      'A lone leader is a huge advantage — look for single Leaders',
      'Wide barriers in Leader/Presser positions can be disadvantaged in big fields',
    ],
  },
  {
    id: 'scoring-system',
    icon: 'ti-chart-bar',
    title: 'Scoring system',
    live: true,
    desc: 'Each horse is scored across four factor groups. The total score determines the rank order.',
    bullets: [
      'Form — recent finishing positions, class of race, days since last start',
      'Speed — sectional ratings and race times relative to class',
      'Conditions — track condition suitability (Good/Soft/Heavy/Synthetic)',
      'Connections — jockey/trainer form, combo record, course/distance stats',
      'Weights — click the Weights button to adjust how much each group counts',
      'Score ranges from 0–100. A score above 60 is strong; above 70 is elite',
    ],
  },
  {
    id: 'edge-value',
    icon: 'ti-currency-dollar',
    title: 'Edge $ & Value %',
    live: true,
    desc: "Edge $ is our model's fair value price for each runner, calculated from their score relative to the field. Value % shows how the market price compares.",
    bullets: [
      'Edge $ — what our model thinks the horse should pay',
      'Live $ — current bookmaker win odds',
      'Value % — (Live - Edge) / Edge × 100. Positive = market is paying more than our model',
      '+30% or higher = strong value. Look for rank 1 or 2 horses with high value %',
      'Negative value = horse is overbacked by the market — avoid',
      'Value betting over time produces better ROI than backing favourites',
    ],
  },
  {
    id: 'my-bets',
    icon: 'ti-report-money',
    title: 'My Bets & ROI',
    live: true,
    desc: 'Log every bet from the races page and track your running P&L and ROI over time.',
    bullets: [
      'Click + Bet on any runner in the Field tab to open the bet logger',
      'Enter stake, odds and bookmaker',
      'Bets are stored in Supabase against your account',
      'Settle bets manually by marking Win, Place or Loss',
      'Insights page shows your win rate, average odds and ROI breakdown',
      'Export your full bet log to CSV at any time',
    ],
  },
  {
    id: 'community-guide',
    icon: 'ti-users',
    title: 'Community',
    live: true,
    desc: 'The Community is a forum for punters to share tips, analysis and race-day chat. Your activity earns points that move you up the 262-race rank ladder.',
    bullets: [
      "Post in any section — Today's Races, Tips & Analysis, Winning Bets, General Chat",
      'Earn points: Post +10, Reply +5, Upvote received +10, Bet logged +2, Winner logged +15',
      'Refer a friend +200 pts',
      'Your rank is named after an Australian race — starting at Adaminaby Picnic Maiden up to Melbourne Cup',
      'Click your tier badge to see the full 262-race rank ladder',
      'Upvote good posts — the arrow button on each post card',
    ],
  },
  {
    id: 'saturday-comp',
    icon: 'ti-trophy',
    title: 'Saturday comp',
    live: true,
    desc: 'Every Saturday, pick one horse in each of 6 selected metro races. Score points based on finishing position and climb the weekly leaderboard.',
    bullets: [
      'Free to enter — open to all registered users',
      'Entries close Saturday 9:00am AEST',
      'Scoring: 3 pts for 1st, 2 pts for 2nd, 1 pt for 3rd',
      'Maximum 18 points per week',
      'Top 3 earn bonus community points: 500 / 300 / 200 pts',
      'Leaderboard resets every Monday',
    ],
  },
];

export default function LearnPage() {
  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      <ProfileRail />
      <main className="mob-page" style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
      <div className="learn-content" style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Waging War — how it works</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 32 }}>Everything you need to get the most out of the platform</p>
        {SECTIONS.map(s => (
          <div key={s.id} id={s.id} style={{ border: '0.5px solid #e5e7eb', borderLeft: '3px solid #00471b', background: '#fff', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: '#00471b' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{s.title}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: s.live ? '#dcfce7' : '#f3f4f6', color: s.live ? '#166534' : '#6b7280' }}>
                {s.live ? 'Live' : 'Coming soon'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.8, margin: '10px 0 0 0' }}>
              {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        ))}
      </div>
      </main>
    </div>
  );
}
