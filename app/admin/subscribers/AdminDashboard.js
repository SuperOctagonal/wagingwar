'use client';

import { useMemo } from 'react';
import { C, Panel, NoData, KpiTile, fmtAud } from '@/components/admin/AdminUi';
import SignupsPanel from './SignupsPanel';
import AdsPanel from './AdsPanel';
import DataHealthPanel, { HEALTH } from './DataHealthPanel';
import { summarizeAds } from '@/lib/attribution';
import { aestDay } from '@/lib/aestDay';
import SubscribersTable from './SubscribersTable';

const SECTIONS = [
  ['overview', 'Overview'],
  ['signups', 'Sign-ups'],
  ['ads', 'Ads'],
  ['data-health', 'Data health'],
  ['tip-record', 'Tip Record'],
  ['subscribers', 'Subscribers'],
];

function sum(arr, key) { return arr.reduce((t, d) => t + d[key], 0); }

export default function AdminDashboard({ rows, mrr, stripeError, signups, ads, health, healthDates, generatedAt }) {
  const kpi = useMemo(() => {
    const counts = { FREE: 0, TRIAL: 0, PRO: 0, CANCELLED: 0, PAST_DUE: 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    const n = signups.length;
    const last7 = signups.slice(n - 7), prev7 = signups.slice(n - 14, n - 7);
    const last30 = signups.slice(n - 30), prev30 = signups.slice(n - 60, n - 30);
    return {
      counts,
      s7: sum(last7, 'total'), s7d: sum(last7, 'total') - sum(prev7, 'total'),
      s30: sum(last30, 'total'), s30d: sum(last30, 'total') - sum(prev30, 'total'),
      spark30: last30.map(d => d.total),
      spark90: signups.slice(n - 90).map(d => d.total),
      // Ads, last 30 AEST days (same window as the Ads panel default).
      ads30: ads.ready ? summarizeAds({ ...ads, users: rows, from: last30[0]?.date, to: last30[last30.length - 1]?.date, dayOf: aestDay }).total : null,
    };
  }, [rows, signups, ads]);

  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: C.soft }}>
      {/* Sticky jump bar */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: `1px solid ${C.border}`, overflowX: 'auto', whiteSpace: 'nowrap' }} aria-label="Admin sections">
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 16px', display: 'flex', gap: 2 }}>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} style={{ display: 'inline-block', padding: '12px 10px', fontSize: 12, fontWeight: 700, color: C.ink2, textDecoration: 'none' }}>{label}</a>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink, margin: 0 }}>Admin dashboard</h1>
          <div style={{ fontSize: 11, color: C.muted }}>Data as of {new Date(generatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' })} AEST</div>
        </div>

        {stripeError && (
          <div role="status" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
            <b>Plan data unavailable:</b> {stripeError} Plan status, plan counts and MRR are shown as unknown, not guessed.
          </div>
        )}

        {/* KPI strip */}
        <section id="overview" style={{ scrollMarginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
          <KpiTile label="Total users" value={rows.length.toLocaleString('en-AU')} sub={`${kpi.s30} joined in last 30 days`} />
          <KpiTile label="Free" value={stripeError ? null : kpi.counts.FREE} />
          <KpiTile label="Trial" value={stripeError ? null : kpi.counts.TRIAL} />
          <KpiTile label="Pro" value={stripeError ? null : kpi.counts.PRO} />
          <KpiTile label="Cancelled" value={stripeError ? null : kpi.counts.CANCELLED} />
          <KpiTile label="Past due" value={stripeError ? null : kpi.counts.PAST_DUE} />
          <KpiTile
            label="Pro MRR"
            value={mrr ? fmtAud(mrr.aud) : null}
            sub={mrr ? `${kpi.counts.PRO} active Pro, list price${mrr.nonAudSubscriptions ? ` · ${mrr.nonAudSubscriptions} non-AUD not counted` : ''}` : null}
          />
          <KpiTile label="Sign-ups 7d" value={kpi.s7} delta={kpi.s7d} deltaLabel="vs prior 7d" spark={kpi.spark30} sparkLabel="Daily sign-ups, last 30 days" />
          <KpiTile label="Sign-ups 30d" value={kpi.s30} delta={kpi.s30d} deltaLabel="vs prior 30d" spark={kpi.spark90} sparkLabel="Daily sign-ups, last 90 days" />
          <KpiTile label="Ad spend 30d" value={kpi.ads30?.spend != null ? fmtAud(kpi.ads30.spend) : null} sub={kpi.ads30 ? `${kpi.ads30.landings} landing hits` : null} />
          <KpiTile label="Cost / sign-up 30d" value={kpi.ads30?.costPerSignup != null ? fmtAud(kpi.ads30.costPerSignup) : null} sub={kpi.ads30 ? `${kpi.ads30.signups} attributed sign-ups` : null} />
          <KpiTile
            label="Data health today"
            value={health?.ok && health.overall ? HEALTH[health.overall].label : null}
            sub={health?.ok ? `${health.counts.red} problem · ${health.counts.amber} warning · ${health.counts.green} OK` : null}
          />
          <KpiTile label="Tips settled" pending="Not built yet (Stage 4)" />
          <KpiTile label="Strike rate" pending="Not built yet (Stage 4)" />
          <KpiTile label="Tip ROI" pending="Not built yet (Stage 4)" />
        </section>

        <Panel id="signups" title="Sign-ups per day" subtitle="New Clerk accounts per AEST day, split by current plan">
          <SignupsPanel signups={signups} />
        </Panel>

        <Panel id="ads" title="Ads to sign-ups" subtitle="Landing hits, attributed sign-ups, trials, paid and spend (A$) per ad">
          <AdsPanel ads={ads} users={rows} />
        </Panel>

        <Panel id="data-health" title="Data health" subtitle="Meetings, race cards, results, track conditions, scratchings and scrapers, per racing day">
          <DataHealthPanel initial={health} dates={healthDates} />
        </Panel>

        <Panel id="tip-record" title="Tip Record health" subtitle="Unsettled tips, snapshot freshness, record to date">
          <NoData>Not built yet (Stage 4).</NoData>
        </Panel>

        <Panel id="subscribers" title="Subscribers" subtitle={`${rows.length} total users`}>
          <SubscribersTable rows={rows} />
        </Panel>
      </div>
    </div>
  );
}
