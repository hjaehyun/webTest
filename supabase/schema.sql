-- haru-jogak Supabase schema. Paste into Supabase Dashboard > SQL Editor and Run.
-- Safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS everywhere).
--
-- Who can see what is enforced HERE by Row Level Security, not in app code:
--   * your profile, entries, pictures and exhibition: only you
--   * a public exhibition (is_public): anyone can see it, its hung pictures and the owner's nick
--   * entries (the raw fragments) are never public
-- Users live in auth.users (Supabase Auth); every table points at it and is deleted with it.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nick    text not null check (char_length(nick) between 1 and 12),
  style   text not null check (style in ('water', 'pencil', 'crayon', 'story'))
);

-- Fragments. An entry is a draft until daily_artworks has a row for its (user_id, day).
create table if not exists public.entries (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,                 -- the user's local date
  written_at timestamptz not null,
  body       text not null check (char_length(body) between 1 and 140)
);
create index if not exists entries_user_day on public.entries (user_id, day);

-- One picture per user per day.
create table if not exists public.daily_artworks (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  style      text not null check (style in ('water', 'pencil', 'crayon', 'story')),
  scene      text not null check (scene in ('day', 'cat', 'rain', 'park', 'cafe', 'night')), -- placeholder art until image_url
  image_url  text,
  summary    text not null,
  tags       text[] not null default '{}',
  status     text not null default 'done' check (status in ('drawing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- One exhibition per user for now (made by the sign-up trigger below).
create table if not exists public.exhibitions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  title       text not null default '나의 전시' check (char_length(title) <= 60),
  description text not null default '' check (char_length(description) <= 300),
  is_public   boolean not null default false
);

create table if not exists public.exhibition_items (
  exhibition_id uuid   not null references public.exhibitions (id) on delete cascade,
  artwork_id    bigint not null references public.daily_artworks (id) on delete cascade,
  position      int    not null,
  note          text check (char_length(note) <= 300),
  primary key (exhibition_id, artwork_id)
);

-- AI calls per user per day (Asia/Seoul date). Only consume_ai_quota() below writes it,
-- so a user can't reset their own count; they may read it.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('summarize', 'draw', 'curate')),
  count   int  not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.profiles, public.daily_artworks, public.exhibitions, public.exhibition_items to anon;
revoke insert, update, delete on public.ai_usage from anon, authenticated;
revoke select on public.ai_usage from anon;

-- ---------------------------------------------------------------- helpers

-- Is this picture hung in a public exhibition? (security definer so policies can ask without recursion)
create or replace function public.is_publicly_shown(p_artwork_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exhibition_items i
    join public.exhibitions e on e.id = i.exhibition_id
    where i.artwork_id = p_artwork_id and e.is_public
  );
$$;

-- Has this user already closed (drawn) that day?
create or replace function public.day_is_closed(p_user uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.daily_artworks a where a.user_id = p_user and a.day = p_day);
$$;

-- New account -> its exhibition.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.exhibitions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Replace the hung pictures in one transaction. Runs as the caller, so RLS still applies.
create or replace function public.set_exhibition_items(p_dates date[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  ex uuid;
  missing int;
begin
  select id into ex from public.exhibitions where user_id = auth.uid();
  if ex is null then
    raise exception '전시회가 없어요' using errcode = 'P0002';
  end if;

  select count(*) into missing from unnest(p_dates) d
   where not exists (select 1 from public.daily_artworks a where a.user_id = auth.uid() and a.day = d);
  if missing > 0 then
    raise exception '그림이 없는 날짜예요' using errcode = '22023';
  end if;

  delete from public.exhibition_items where exhibition_id = ex;
  insert into public.exhibition_items (exhibition_id, artwork_id, position)
    select ex, a.id, (o.ord - 1)::int
      from unnest(p_dates) with ordinality as o (d, ord)
      join public.daily_artworks a on a.user_id = auth.uid() and a.day = o.d;
end;
$$;

-- Counts one AI call for the caller and says whether it is within today's limit.
-- security definer so it can write ai_usage, which the caller can't; the limits live here, not in an
-- argument, so calling it directly can only use up your own quota. Change the numbers to retune.
create or replace function public.consume_ai_quota(p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  lim  int;
  used int;
begin
  if uid is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  lim := case p_kind when 'summarize' then 20 when 'draw' then 10 when 'curate' then 20 end;
  if lim is null then
    raise exception 'unknown AI kind: %', p_kind using errcode = '22023';
  end if;

  -- The upsert locks the row, so concurrent calls can't both slip past the limit.
  insert into public.ai_usage as u (user_id, day, kind, count)
    values (uid, (now() at time zone 'Asia/Seoul')::date, p_kind, 1)
    on conflict (user_id, day, kind) do update set count = u.count + 1 where u.count < lim
    returning u.count into used;
  return used is not null; -- no row back = the update was skipped = over the limit
end;
$$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.profiles         enable row level security;
alter table public.entries          enable row level security;
alter table public.daily_artworks   enable row level security;
alter table public.exhibitions      enable row level security;
alter table public.exhibition_items enable row level security;
alter table public.ai_usage         enable row level security;

-- profiles
drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "profiles: owner of a public exhibition" on public.profiles;
create policy "profiles: owner of a public exhibition" on public.profiles
  for select to anon, authenticated
  using (exists (select 1 from public.exhibitions e where e.user_id = profiles.user_id and e.is_public));

-- entries: private; can only be added or removed while the day is still open
drop policy if exists "entries: read own" on public.entries;
create policy "entries: read own" on public.entries
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "entries: add to open day" on public.entries;
create policy "entries: add to open day" on public.entries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day));
drop policy if exists "entries: remove from open day" on public.entries;
create policy "entries: remove from open day" on public.entries
  for delete to authenticated
  using (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day));

-- daily_artworks
drop policy if exists "artworks: own" on public.daily_artworks;
create policy "artworks: own" on public.daily_artworks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "artworks: hung in a public exhibition" on public.daily_artworks;
create policy "artworks: hung in a public exhibition" on public.daily_artworks
  for select to anon, authenticated using (public.is_publicly_shown(id));

-- exhibitions (created by the trigger, so no insert policy)
drop policy if exists "exhibitions: read own or public" on public.exhibitions;
create policy "exhibitions: read own or public" on public.exhibitions
  for select to anon, authenticated using (is_public or user_id = (select auth.uid()));
drop policy if exists "exhibitions: update own" on public.exhibitions;
create policy "exhibitions: update own" on public.exhibitions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- exhibition_items: you hang only your own pictures in your own exhibition
drop policy if exists "items: read own or public" on public.exhibition_items;
create policy "items: read own or public" on public.exhibition_items
  for select to anon, authenticated
  using (exists (select 1 from public.exhibitions e
                  where e.id = exhibition_id and (e.is_public or e.user_id = (select auth.uid()))));
drop policy if exists "items: write own" on public.exhibition_items;
create policy "items: write own" on public.exhibition_items
  for all to authenticated
  using (exists (select 1 from public.exhibitions e where e.id = exhibition_id and e.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.exhibitions e where e.id = exhibition_id and e.user_id = (select auth.uid()))
    and exists (select 1 from public.daily_artworks a where a.id = artwork_id and a.user_id = (select auth.uid()))
  );

-- ai_usage: read your own count; writes only through consume_ai_quota()
drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- storage (for the image AI, later)
-- Public bucket: anyone with a picture's URL can open it; paths start with the owner's id.

insert into storage.buckets (id, name, public) values ('artworks', 'artworks', true)
  on conflict (id) do nothing;

drop policy if exists "artworks bucket: upload to own folder" on storage.objects;
create policy "artworks bucket: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'artworks' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "artworks bucket: change own files" on storage.objects;
create policy "artworks bucket: change own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'artworks' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "artworks bucket: delete own files" on storage.objects;
create policy "artworks bucket: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'artworks' and (storage.foldername(name))[1] = (select auth.uid())::text);
