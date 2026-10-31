-- NOT APPLIED. Draft for review only -- do not run until approved.
--
-- Lets a rank-1 tip whose race_feature_snapshots row was captured under the
-- wrong venue name join to its results, WITHOUT editing any snapshot row.
--
-- Case: 30 Oct 2026 Pakenham ran on the turf but the CSV-sourced rows were
-- labelled "PAKENHAM SYNTHETIC". The data fix (supabase/data_fixes/
-- 20261031_merge_pakenham_2026-10-30.sql, applied 2026-10-31) moved
-- race_schedule/race_cards to PAKENHAM; the 86 snapshots stay under
-- PAKENHAM SYNTHETIC by rule, so their 8 rank-1 tips show as 'no_result'.
--
-- snapshot_venue_aliases maps (date, from_venue) -> to_venue. tip_results
-- resolves each snapshot's venue through it (falling back to the snapshot's
-- own venue) and uses that one effective venue for every join: results,
-- dead-heat count, abandoned meeting, scratchings.
--
-- View columns: CREATE OR REPLACE VIEW keeps the existing 18 columns (same
-- names, order, types). `venue` now returns the effective venue (PAKENHAM
-- for these 8 rows, so the Tip Record shows the name the Results page
-- uses); `snapshot_venue` is appended with the snapshot's own stored name.
--
-- Simulated read-only against live data 2026-10-31 (the exact view body
-- below with this table inlined as VALUES; rank-1 tips dated up to and
-- including 30 Oct, so today's racing doesn't move the numbers):
--                 settled  wins   units    ROI      excluded (ab/scr/no_sp/no_result)
--   before         1869     483   -139.98  -7.49%   108 (41/11/8/48)
--   after          1877     485   -134.78  -7.18%   100 (41/11/8/40)
-- One row per snapshot holds (2000 rows, 2000 distinct snapshot_id).
-- The 8 Pakenham tips: 2 winners (LOMU R4 $3.20, ZOURAIN R8 $10.00),
-- 6 losers -> +5.20 units.

begin;

create table if not exists snapshot_venue_aliases (
  date        date not null,
  from_venue  text not null,
  to_venue    text not null,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (date, from_venue),
  check (upper(from_venue) <> upper(to_venue))
);

comment on table snapshot_venue_aliases is
  'Per-date venue alias for race_feature_snapshots rows captured under the wrong venue name. tip_results joins snapshots to results/scratchings/today_meetings via coalesce(to_venue, snapshot venue). Snapshot rows themselves are never edited.';

-- Service-key access only, same as tip_results: RLS on with no policies,
-- and no table privileges for the public API roles.
alter table snapshot_venue_aliases enable row level security;
revoke all on snapshot_venue_aliases from anon, authenticated;

insert into snapshot_venue_aliases (date, from_venue, to_venue, note) values
  ('2026-10-30', 'PAKENHAM SYNTHETIC', 'PAKENHAM',
   'Turf meeting (Soft 6) mislabelled synthetic by the CSV import; results under PAKENHAM.')
on conflict (date, from_venue) do nothing;

create or replace view tip_results
with (security_invoker = true)
as
select
  snap.id as snapshot_id,
  snap.date,
  ev.venue,
  rr.state,
  snap.race_num,
  regexp_replace(snap.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', '') as horse_name,
  snap.total_score,
  snap.ww_price,
  snap.market_price,
  snap.field_size,
  snap.field_rank,
  snap.captured_at,
  rr.finish_pos,
  rr.sp,
  rr.result_status,
  case when rr.finish_pos = 1 then dh.winners else 1 end as dead_heat_winners,
  (st.started and rr.sp is not null) as settled,
  case
    when st.started and rr.sp is not null then null
    when st.started then 'no_sp'
    when ab.abandoned then 'abandoned'
    when sc.scratched then 'scratched'
    else 'no_result'
  end as excluded_reason,
  -- new: the venue the snapshot row itself is stored under
  snap.venue as snapshot_venue
from race_feature_snapshots snap
-- new: effective venue = alias for this date + snapshot venue, else the snapshot's own
cross join lateral (
  select coalesce(
    (select a.to_venue from snapshot_venue_aliases a
      where a.date = snap.date and upper(a.from_venue) = upper(snap.venue)),
    snap.venue
  ) as venue
) ev
left join race_results rr
  on rr.date = snap.date
 and upper(rr.venue) = upper(ev.venue)
 and rr.race_num::text = snap.race_num::text
 and upper(rr.horse_name) = upper(regexp_replace(snap.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', ''))
left join lateral (
  select count(*) as winners
  from race_results rr2
  where rr2.date = rr.date
    and upper(rr2.venue) = upper(rr.venue)
    and rr2.race_num::text = rr.race_num::text
    and rr2.finish_pos = 1
) dh on rr.finish_pos = 1
cross join lateral (
  select coalesce(rr.finish_pos > 0 or rr.result_status in ('FF', 'BD'), false) as started
) st
cross join lateral (
  select exists (
    select 1 from today_meetings m
    where m.date = snap.date and upper(m.venue) = upper(ev.venue) and m.is_abandoned
  ) as abandoned
) ab
cross join lateral (
  select exists (
    select 1 from scratchings s
    where s.date = snap.date
      and upper(s.venue) = upper(ev.venue)
      and s.race_num::text = snap.race_num::text
      and upper(regexp_replace(s.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', ''))
        = upper(regexp_replace(snap.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', ''))
  ) as scratched
) sc
where snap.field_rank = 1;

comment on view tip_results is
  'One row per rank-1 (Top pick) race_feature_snapshots row, left-joined to its race_results row via the effective venue (snapshot_venue_aliases for that date, else the snapshot venue; venue = effective, snapshot_venue = as stored). settled = horse started (finish_pos > 0, or result_status FF/BD) and sp is not null; win = sp / dead_heat_winners - 1, anything else -1. excluded_reason (when not settled): no_sp, abandoned, scratched, no_result (checked in that order).';

commit;

-- Verification after applying:
--   1. One row per snapshot (expect 1):
--        select max(c) from (select snapshot_id, count(*) c from tip_results group by snapshot_id) x;
--   2. tip_results privileges unchanged (expect no rows):
--        select grantee, privilege_type from information_schema.role_table_grants
--         where table_schema = 'public' and table_name in ('tip_results', 'snapshot_venue_aliases')
--           and grantee in ('anon', 'authenticated');
--   3. The 8 Pakenham tips settle (expect 8 rows, settled true, venue PAKENHAM,
--      snapshot_venue PAKENHAM SYNTHETIC):
--        select race_num, horse_name, venue, snapshot_venue, settled, finish_pos, sp
--          from tip_results where date = '2026-10-30' and snapshot_venue = 'PAKENHAM SYNTHETIC';
--   4. Totals up to 30 Oct match the simulation above: 1877 settled, 485 wins, -134.78 units.
