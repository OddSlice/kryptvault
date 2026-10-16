-- KRYPTVAULT database schema (Neon Postgres).
-- Ported from the original Supabase project. The game never talks to the
-- database directly any more: everything goes through the Vercel functions
-- in /api, which call the functions below.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- leaderboard
-- ---------------------------------------------------------------------------
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) = 3),
  wave int not null check (wave between 1 and 999),
  kills int not null check (kills between 0 and 99999),
  level int not null check (level between 1 and 99),
  cls text not null check (cls in ('warrior', 'rogue', 'mage', 'ranger', 'bombardier')),
  mode text not null default 'normal' check (mode in ('normal', 'daily')),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  disc text,
  player_id uuid,
  ver text,
  upgrades jsonb
);

create index if not exists scores_rank_idx on public.scores (mode, wave desc, kills desc);
create index if not exists scores_daily_idx on public.scores (mode, day, wave desc, kills desc);

-- ---------------------------------------------------------------------------
-- player accounts: tag (MAR#1234) + secret vault key, progress synced as json
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[A-Z]{3}$'),
  disc text not null check (disc ~ '^[0-9]{4}$'),
  secret text not null,
  created_at timestamptz not null default now(),
  progress jsonb,
  progress_at timestamptz,
  unique (name, disc)
);

create or replace function public.register_player(p_name text)
returns json
language plpgsql
set search_path = public
as $$
declare
  d text;
  s text;
  pid uuid;
  tries int := 0;
begin
  if p_name !~ '^[A-Z]{3}$' then
    raise exception 'invalid name';
  end if;
  loop
    d := lpad(floor(random() * 10000)::int::text, 4, '0');
    s := upper(encode(gen_random_bytes(4), 'hex'));
    begin
      insert into players (name, disc, secret) values (p_name, d, s) returning id into pid;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 30 then
        raise exception 'no free tag for this name';
      end if;
    end;
  end loop;
  return json_build_object('id', pid, 'disc', d, 'secret', s);
end
$$;

-- login returns the stored progress so a new device can restore it
create or replace function public.login_player(p_name text, p_disc text, p_secret text)
returns json
language plpgsql
set search_path = public
as $$
declare
  pid uuid;
  prog jsonb;
begin
  select id, progress into pid, prog from players
   where name = upper(p_name) and disc = p_disc and secret = upper(p_secret);
  if pid is null then
    return null;
  end if;
  return json_build_object('id', pid, 'disc', p_disc, 'progress', prog);
end
$$;

-- upload progress; the vault key (secret) is the write credential
create or replace function public.save_progress(p_id uuid, p_secret text, p_progress jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if p_progress is null or length(p_progress::text) > 8000 then
    return false;
  end if;
  update players set progress = p_progress, progress_at = now()
   where id = p_id and secret = upper(p_secret);
  return found;
end
$$;

-- ---------------------------------------------------------------------------
-- score sanity checks + rate limit
-- ---------------------------------------------------------------------------
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

drop trigger if exists scores_validate on public.scores;
create trigger scores_validate
before insert on public.scores
for each row execute function public.validate_score();
