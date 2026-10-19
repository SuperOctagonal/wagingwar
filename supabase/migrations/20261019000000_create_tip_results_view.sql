-- NOT APPLIED. Written for review only -- do not run until approved.
--
-- tip_results: one row per rank-1 ("Top pick") race_feature_snapshots row,
-- left-joined to its race_results row once the race has been resulted.
-- Unresolved tips (race not yet run, abandoned, scratched, name/venue the
-- join still can't match) come through with finish_pos/sp/result_status/
-- state all NULL -- the view returns every rank-1 snapshot row, settled or
-- not; "settled" is `finish_pos > 0 and sp is not null`, applied by
-- consumers (API route / page), not baked into a WHERE clause here.
--
-- Horse-name join fix: race_feature_snapshots.horse_name keeps the
-- trailing (NZ)/(IRE)/(GB) country suffix; race_results.horse_name has it
-- stripped. Matching on the de-suffixed name (both the join condition and
-- the `horse_name` column this view exposes) recovers 135 of the 177
-- previously-unmatched rank-1 tips in the 2026-09-16 to 2026-10-18 window,
-- with zero duplicate or ambiguous matches (proven below).
--
-- Dead heats: finish_pos > 0 as recorded by the source (two runners can
-- both be finish_pos = 1 in one race). Confirmed 4 such races in
-- race_results since 2026-09-16 (JERILDERIE 26 Sep, BENDIGO 4 Oct, FORBES
-- 10 Oct, GOLD COAST 17 Oct); exactly one of our rank-1 tips is itself a
-- dead-heat winner (FORBES 10 Oct R6, BITTA BON MAGIC, sp 5.50). The view
-- exposes `dead_heat_winners` (1 for a normal win) rather than silently
-- pre-dividing `sp` itself, so `sp` always stays the true official price.
-- The stake itself is split between dead-heat winners, so the correct
-- payout on a win is `sp / dead_heat_winners - 1` (not `(sp - 1) /
-- dead_heat_winners`) -- applied by the consumer with that count in hand.
-- For BITTA BON MAGIC (sp 5.50, 1 co-winner): 5.50 / 2 - 1 = +1.75.
--
-- security_invoker = true (so this view carries no elevated privilege of
-- its own -- it runs as whichever role queries it, same as querying the
-- base tables directly would) and anon/authenticated are explicitly
-- revoked below. Only the service key (via /api/tip-record, server-side)
-- reads this -- no browser code ever queries it directly.

create or replace view tip_results
with (security_invoker = true)
as
select
  snap.id as snapshot_id,
  snap.date,
  snap.venue,
  rr.state,
  snap.race_num,
  -- "clean" horse name: the de-suffixed form, matching race_results'
  -- spelling (and what a human reading the row would expect) rather than
  -- the raw snapshot value, which can still carry "(NZ)" etc.
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
  case when rr.finish_pos = 1 then dh.winners else 1 end as dead_heat_winners
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
where snap.field_rank = 1;

comment on view tip_results is
  'One row per rank-1 (Top pick) race_feature_snapshots row, left-joined to its race_results row by date/venue/race_num/de-suffixed horse name. finish_pos/sp/result_status/state are NULL until the race is resulted or matched. Settled = finish_pos > 0 and sp is not null. On a win, payout = sp / dead_heat_winners - 1 (dead_heat_winners is 1 for a normal win).';

-- Security: no privileges for the client-side roles. Service role/postgres
-- keep theirs implicitly (not owner-revoked); only the server-side
-- /api/tip-record route (service key) ever reads this.
revoke all privileges on tip_results from anon, authenticated;

-- ─── Validation queries (read-only, run against the live view before
-- applying for real -- these were run as equivalent ad-hoc SELECTs
-- against the base tables, not this view, since the view does not exist
-- yet; re-run against the view itself once created, numbers should match
-- exactly) ───────────────────────────────────────────────────────────────
--
-- 1. Exactly one row per snapshot row, no fan-out from the join:
--   select max(c) from (select snapshot_id, count(*) c from tip_results group by snapshot_id) x;
--   -> expect 1
--
-- 2. Settled totals through 2026-10-18:
--   select count(*) settled,
--     count(*) filter (where finish_pos = 1) wins,
--     count(*) filter (where finish_pos between 1 and 3) top3,
--     round(sum(case when finish_pos = 1 then sp / dead_heat_winners - 1 else -1 end)::numeric, 2) units
--   from tip_results
--   where date >= '2026-09-16' and date <= '2026-10-18' and finish_pos > 0 and sp is not null;
--   -> expect 1455 settled, 372 wins, 839 top3, -110.07 units
