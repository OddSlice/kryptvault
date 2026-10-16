-- KRYPTVAULT database update for v1.2.1: crash reports. Safe to run more than once.
-- How: Neon console > your project > SQL Editor > paste all of this > Run.
create table if not exists public.error_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ver text,         -- game version
  kind text,        -- frame / error / promise
  msg text not null,
  stack text,       -- where in the code it happened
  state jsonb,      -- screen, wave, level, hero, ascendancy, monsters, run time
  ua text,          -- browser and device
  screen text,      -- window size @ pixel density
  session text      -- random per visit: groups reports from one visit, nothing more
);
create index if not exists error_reports_created_idx on public.error_reports (created_at);

-- To read them later (paste one of these into the SQL Editor):
--   newest first:
--     select created_at, ver, kind, msg, state, ua from public.error_reports order by id desc limit 50;
--   most common:
--     select msg, count(*), max(created_at) as last_seen from public.error_reports group by msg order by count(*) desc;
