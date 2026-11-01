'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/admin/DataTable';
import { C, DateRange, NoData, fmtAud } from '@/components/admin/AdminUi';
import { AD_BUCKETS, summarizeAds } from '@/lib/attribution';
import { aestDay } from '@/lib/aestDay';

const BUCKET_LABEL = b => (b === 'other' ? 'other' : b);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

// Uncontrolled fields, read with FormData on submit: what's saved is always
// what's on screen. (With controlled fields, anything typed before React
// hydrated stayed visible but never reached state, so the old default date
// could be saved instead of the one shown.)
function SpendForm({ onSaved }) {
  const today = aestDay();
  const formRef = useRef(null);
  const [ad, setAd] = useState(AD_BUCKETS[0]); // only drives showing the "other" field
  const [state, setState] = useState({ busy: false, msg: null, ok: false });
  const input = { fontSize: 12, padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 6, color: C.ink };

  // Pick up an ad chosen before hydration.
  useEffect(() => {
    const sel = formRef.current?.elements.ad;
    if (sel) setAd(sel.value);
  }, []);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const date = fd.get('date');
    const utm = fd.get('ad') === '__other' ? fd.get('otherAd') : fd.get('ad');
    const amount = Number(fd.get('amount'));
    setState({ busy: true, msg: null, ok: false });
    try {
      const r = await fetch('/api/admin/ad-spend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, utm_content: utm, amount_aud: amount }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setState({ busy: false, msg: j.error || `Error ${r.status}`, ok: false }); return; }
      setState({ busy: false, msg: `Saved ${fmtAud(amount)} for ${utm} on ${date}.`, ok: true });
      form.elements.amount.value = '';
      onSaved();
    } catch {
      setState({ busy: false, msg: 'Network error, not saved.', ok: false });
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: 12, background: C.soft, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Date (AEST)<br />
        <input name="date" type="date" required defaultValue={today} max={today} style={input} />
      </label>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Ad<br />
        <select name="ad" defaultValue={AD_BUCKETS[0]} onChange={e => setAd(e.target.value)} style={input}>
          {AD_BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
          <option value="__other">other…</option>
        </select>
      </label>
      {ad === '__other' && (
        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>utm_content<br />
          <input name="otherAd" required placeholder="e.g. spring1" style={input} />
        </label>
      )}
      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Amount (A$)<br />
        <input name="amount" required type="number" step="0.01" placeholder="0.00" style={{ ...input, width: 110 }} />
      </label>
      <button type="submit" disabled={state.busy} style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer' }}>
        {state.busy ? 'Saving…' : 'Save spend'}
      </button>
      <div style={{ fontSize: 11, color: C.muted, flexBasis: '100%' }}>Same day + ad again replaces the amount. Negative amounts (credits) are allowed.</div>
      {state.msg && <div role="status" style={{ fontSize: 12, fontWeight: 600, color: state.ok ? '#166534' : '#991b1b', flexBasis: '100%' }}>{state.msg}</div>}
    </form>
  );
}

export default function AdsPanel({ ads, users, usersUnavailable = false }) {
  const router = useRouter();
  const today = aestDay();
  const start30 = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10); })();
  // Landing hits are only read back to ads.landingsFrom (lib/adminAds.js).
  const minDay = ads.landingsFrom || undefined;
  const [range, setRange] = useState({ from: start30, to: today });

  const summary = useMemo(() => (ads.ready
    ? summarizeAds({ ...ads, users, from: range.from, to: range.to, dayOf: aestDay })
    : null), [ads, users, range]);

  if (!ads.ready) {
    return ads.missing
      ? <NoData>Not set up yet: {ads.error} Landing hits, attributed sign-ups and spend will show here once the tables exist.</NoData>
      : <NoData>Ads data unavailable: {ads.error} Reload to retry.</NoData>;
  }
  // Clerk down: sign-up figures would read as zero, so show them as unknown.
  const signupCell = v => (usersUnavailable ? <span style={{ color: C.faint }}>—</span> : v);

  const funnelCols = [
    { key: 'bucket', label: 'Ad (utm_content)', render: r => <b>{BUCKET_LABEL(r.bucket)}</b> },
    { key: 'landings', label: 'Landing hits', align: 'right' },
    { key: 'signups', label: 'Sign-ups', align: 'right', render: r => signupCell(r.signups), csv: r => (usersUnavailable ? '' : r.signups) },
    { key: 'rate', label: 'Sign-up rate', align: 'right', sort: r => (r.landings ? r.signups / r.landings : null), render: r => signupCell(pct(r.signups, r.landings)), csv: r => (!usersUnavailable && r.landings ? (r.signups / r.landings).toFixed(4) : '') },
    { key: 'trials', label: 'Trials', align: 'right', render: r => signupCell(r.trials), csv: r => (usersUnavailable ? '' : r.trials) },
    { key: 'paid', label: 'Paid', align: 'right', render: r => signupCell(r.paid), csv: r => (usersUnavailable ? '' : r.paid) },
    { key: 'spend', label: 'Spend (A$)', align: 'right', render: r => (r.spend == null ? <span style={{ color: C.faint }}>no spend</span> : fmtAud(r.spend)) },
    { key: 'costPerSignup', label: 'Cost / sign-up', align: 'right', render: r => (usersUnavailable || r.costPerSignup == null ? '—' : fmtAud(r.costPerSignup)), csv: r => (usersUnavailable || r.costPerSignup == null ? '' : r.costPerSignup) },
  ];

  const spendRows = ads.spend
    .filter(s => (!range.from || s.date >= range.from) && (!range.to || s.date <= range.to))
    .map(s => ({ ...s, key: `${s.date}|${s.utm_content}` }));
  const spendCols = [
    { key: 'date', label: 'Date (AEST)' },
    { key: 'utm_content', label: 'Ad' },
    { key: 'amount_aud', label: 'Amount (A$)', align: 'right', render: r => fmtAud(r.amount_aud) },
  ];

  const t = summary.total;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.ink2 }}>
          <b style={{ color: C.ink }}>{t.landings}</b> landing hits ·{' '}
          {usersUnavailable
            ? <>sign-ups unknown (Clerk unavailable) ·</>
            : <><b style={{ color: C.ink }}>{t.signups}</b> attributed sign-ups ({pct(t.signups, t.landings)}) · {t.trials} trials · {t.paid} paid ·</>}
          {' '}spend <b style={{ color: C.ink }}>{t.spend == null ? 'none entered' : fmtAud(t.spend)}</b>
          {!usersUnavailable && t.costPerSignup != null && <> · <b style={{ color: C.ink }}>{fmtAud(t.costPerSignup)}</b> per sign-up</>}
        </div>
        <DateRange from={range.from} to={range.to} onChange={setRange} presets={[7, 30, 90]} min={minDay} max={today} />
      </div>

      <DataTable columns={funnelCols} rows={summary.rows.map(r => ({ ...r, key: r.bucket }))} csvName="ads-funnel" />
      <div style={{ fontSize: 11, color: C.muted, margin: '6px 0 16px' }}>
        {!usersUnavailable && <>{summary.unattributed} sign-up{summary.unattributed === 1 ? '' : 's'} in this range had no ad attribution (organic, no consent, or before tracking started). </>}
        Trials/paid = those sign-ups&apos; current plan. Landing hits count every page load with utm_content.
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 800, color: C.ink, margin: '0 0 8px' }}>Ad spend</h3>
      <SpendForm onSaved={() => router.refresh()} />
      {spendRows.length ? (
        <DataTable columns={spendCols} rows={spendRows} initialSort="date" csvName="ad-spend" maxHeight={320} />
      ) : (
        <NoData>No spend entered for this date range.</NoData>
      )}
    </div>
  );
}
