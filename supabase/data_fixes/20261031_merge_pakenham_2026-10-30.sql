-- NOT APPLIED. Draft for review only -- do not run until approved.
--
-- One-off data fix: the 30 Oct 2026 Pakenham meeting ran on the TURF track
-- (Soft 6; moved from Moonee Valley). The EveryRace CSV labelled it
-- "PAKENHAM SYNTHETIC", so CSV-sourced rows (race_schedule, race_cards,
-- today_meetings) went under that name while Racing Australia-sourced rows
-- (race_results, scratchings, today_meetings with the track condition) went
-- under "PAKENHAM". This moves the CSV-sourced rows to PAKENHAM.
--
-- Checked before drafting (read-only):
--   * no key clashes: race_schedule (date,venue,race_num), race_cards
--     (date,venue,race_num,horse_name) -- 0 overlapping keys under PAKENHAM
--   * all 86 result horses under PAKENHAM match the 86 card horses under
--     PAKENHAM SYNTHETIC by race + name (same meeting)
--
-- NOT touched (by instruction / out of scope):
--   * race_feature_snapshots (86 rows) and odds_snapshot (64,534 rows) stay
--     under PAKENHAM SYNTHETIC -- consequence: the 8 rank-1 tips for this
--     meeting stay unsettled ("no_result") in tip_results, and the 30 Oct
--     odds history won't show under PAKENHAM. See the report for options.
--
-- Expected counts (date 2026-10-30)      before            after
--   today_meetings  PAKENHAM / SYNTHETIC   1 / 1             1 / 0   (ONE ROW DELETED -- see step 3)
--   race_schedule   PAKENHAM / SYNTHETIC   0 / 8             8 / 0
--   race_cards      PAKENHAM / SYNTHETIC   0 / 109         109 / 0
--   race_results    PAKENHAM / SYNTHETIC  86 / 0            86 / 0   (unchanged)
--   scratchings     PAKENHAM / SYNTHETIC  23 / 0            23 / 0   (unchanged)

begin;

-- Before counts
select 'before' as phase, t, v, n from (
  select 'today_meetings' t, upper(venue) v, count(*) n from today_meetings where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_schedule', upper(venue), count(*) from race_schedule where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_cards', upper(venue), count(*) from race_cards where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_results', upper(venue), count(*) from race_results where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'scratchings', upper(venue), count(*) from scratchings where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
) x order by t, v;

-- 1. race_schedule: rename (8 rows, no key clash)
update race_schedule set venue = 'PAKENHAM'
 where date = '2026-10-30' and upper(venue) = 'PAKENHAM SYNTHETIC';

-- 2. race_cards: rename (109 rows, no key clash)
update race_cards set venue = 'PAKENHAM'
 where date = '2026-10-30' and upper(venue) = 'PAKENHAM SYNTHETIC';

-- 3. today_meetings: unique (date, venue) means the CSV's PAKENHAM SYNTHETIC
--    row can't be renamed into the existing PAKENHAM row (which already has
--    state VIC and track_condition Soft 6 from Racing Australia). The CSV row
--    (track_condition null) is REMOVED. This is the only deletion; needs
--    explicit approval.
delete from today_meetings
 where date = '2026-10-30' and upper(venue) = 'PAKENHAM SYNTHETIC'
   and exists (select 1 from today_meetings k where k.date = '2026-10-30' and upper(k.venue) = 'PAKENHAM');

-- 4. race_results, scratchings: already under PAKENHAM -- nothing to do.

-- After counts
select 'after' as phase, t, v, n from (
  select 'today_meetings' t, upper(venue) v, count(*) n from today_meetings where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_schedule', upper(venue), count(*) from race_schedule where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_cards', upper(venue), count(*) from race_cards where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'race_results', upper(venue), count(*) from race_results where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
  union all select 'scratchings', upper(venue), count(*) from scratchings where date = '2026-10-30' and upper(venue) in ('PAKENHAM','PAKENHAM SYNTHETIC') group by 2
) x order by t, v;

-- Guard: abort (and roll everything back) unless the result is exactly as expected.
do $$
begin
  if (select count(*) from race_schedule where date = '2026-10-30' and upper(venue) = 'PAKENHAM') <> 8
     or (select count(*) from race_cards where date = '2026-10-30' and upper(venue) = 'PAKENHAM') <> 109
     or (select count(*) from today_meetings where date = '2026-10-30' and upper(venue) like 'PAKENHAM%') <> 1
     or exists (select 1 from race_schedule where date = '2026-10-30' and upper(venue) = 'PAKENHAM SYNTHETIC')
     or exists (select 1 from race_cards where date = '2026-10-30' and upper(venue) = 'PAKENHAM SYNTHETIC') then
    raise exception 'Pakenham merge counts not as expected -- rolled back';
  end if;
end $$;

commit;
