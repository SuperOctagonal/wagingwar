-- NOT APPLIED. Written for review only -- do not run until approved.
--
-- Tip Record settlement rule, decided 2026-10-30, now defined in ONE place
-- (this view) instead of in app code:
--
--   * A rank-1 tip is SETTLED (counts as a bet) when its horse started and
--     has a result line WITH an SP: a finishing position (finish_pos > 0),
--     or FF (failed to finish) or BD (brought down). Win (finish_pos = 1) =
--     sp / dead_heat_winners - 1, as before; anything else, FF/BD included,
--     = -1.
--   * EXCLUDED (not a bet) otherwise, with excluded_reason:
--       'no_sp'      started, result line present, but no SP recorded
--                    (symmetrical: winners and losers alike)
--       'abandoned'  the meeting was abandoned (today_meetings.is_abandoned)
--       'scratched'  the tipped horse is in scratchings
--       'no_result'  no result line at all (includes races not run yet;
--                    the app treats today's/future dates as pending)
--     Checked in that order. These used to be computed in lib/tipRecord.js
--     (classifyUnsettled); the app now reads these two columns instead.
--
-- CREATE OR REPLACE VIEW can only append columns, so the existing 16
-- columns are unchanged (same names, order and types) and `settled` +
-- `excluded_reason` are added at the end. Privileges are preserved by
-- CREATE OR REPLACE (anon/authenticated stay revoked from the original
-- migration); verification query below.

create or replace view tip_results
with (security_invoker = true)
as
select
  snap.id as snapshot_id,
  snap.date,
  snap.venue,
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
  -- new: settlement rule
  (st.started and rr.sp is not null) as settled,
  case
    when st.started and rr.sp is not null then null
    when st.started then 'no_sp'
    when ab.abandoned then 'abandoned'
    when sc.scratched then 'scratched'
    else 'no_result'
  end as excluded_reason
from race_feature_snapshots snap
left join race_results rr
  on rr.date = snap.date
 and upper(rr.venue) = upper(snap.venue)
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
    where m.date = snap.date and upper(m.venue) = upper(snap.venue) and m.is_abandoned
  ) as abandoned
) ab
cross join lateral (
  select exists (
    select 1 from scratchings s
    where s.date = snap.date
      and upper(s.venue) = upper(snap.venue)
      and s.race_num::text = snap.race_num::text
      and upper(regexp_replace(s.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', ''))
        = upper(regexp_replace(snap.horse_name, '\s*\([A-Za-z]{2,3}\)\s*$', ''))
  ) as scratched
) sc
where snap.field_rank = 1;

comment on view tip_results is
  'One row per rank-1 (Top pick) race_feature_snapshots row, left-joined to its race_results row. settled = horse started (finish_pos > 0, or result_status FF/BD) and sp is not null; win = sp / dead_heat_winners - 1, anything else -1. excluded_reason (when not settled): no_sp, abandoned, scratched, no_result (checked in that order).';

-- Verification after applying:
--   1. One row per snapshot (expect 1):
--        select max(c) from (select snapshot_id, count(*) c from tip_results group by snapshot_id) x;
--   2. Privileges unchanged (expect no rows):
--        select grantee, privilege_type from information_schema.role_table_grants
--         where table_schema = 'public' and table_name = 'tip_results' and grantee in ('anon','authenticated');
--   3. OLE GRANDE now settled as a loss:
--        select settled, excluded_reason, result_status, sp from tip_results
--         where date = '2026-10-10' and venue = 'LEONORA' and race_num = '1';   -- expect true, null, FF, 4.20
