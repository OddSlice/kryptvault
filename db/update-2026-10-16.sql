-- KRYPTVAULT database update, 16 October 2026. Safe to run more than once.
-- How: Neon console > your project > SQL Editor > paste all of this > Run.
--
-- 1. Ranger and Bombardier runs never reached the leaderboard: the class
--    check on public.scores only allowed warrior, rogue and mage, so every
--    run with the two coin-unlocked heroes was rejected.
alter table public.scores drop constraint if exists scores_cls_check;
alter table public.scores add constraint scores_cls_check
  check (cls in ('warrior', 'rogue', 'mage', 'ranger', 'bombardier'));

-- 2. Endless runs past wave 300 were rejected by the score check (the table
--    itself already allows up to 999). Same function, new upper bound.
create or replace function public.validate_score()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- hard sanity bounds (client caps kills at 99999 and level at 99; the
  -- table allows waves up to 999, endless runs went past the old 300)
  if new.wave is null or new.wave < 1 or new.wave > 999 then
    raise exception 'invalid score';
  end if;
  if new.kills is null or new.kills < 0 or new.kills > 99999 then
    raise exception 'invalid score';
  end if;
  if new.level is not null and (new.level < 1 or new.level > 99) then
    raise exception 'invalid score';
  end if;
  -- plausibility: observed legit range is ~16-333 kills/wave
  if new.wave >= 3 and (new.kills < new.wave * 5 or new.kills > new.wave * 500) then
    raise exception 'invalid score';
  end if;
  -- rate limit: silently drop a second submission from the same player
  -- within 20s (one death per row; forged spam came in 4-6s apart)
  if exists (
    select 1 from public.scores s
    where s.name = new.name
      and coalesce(s.disc, '') = coalesce(new.disc, '')
      and s.created_at > now() - interval '20 seconds'
  ) then
    return null;
  end if;
  return new;
end
$$;
