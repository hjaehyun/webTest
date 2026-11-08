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
-- Weather when the fragment was written, if the user allowed location (specs/haru-weather.spl).
-- Only the weather word and temperature are kept; coordinates are never stored.
alter table public.entries
  add column if not exists weather text check (weather in ('clear', 'cloudy', 'overcast', 'rain', 'rain_snow', 'snow', 'shower')),
  add column if not exists temp_c  smallint check (temp_c between -50 and 60);

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
-- 'song' added for song recommendation; the inline check above only applies to new databases.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('summarize', 'draw', 'curate', 'song'));

-- Song recommendation (docs/superpowers/specs/2026-11-05-song-recommendation-design.md).
-- Shared pool keyed by mood | weather | time_of_day. No user_id and no diary text on purpose.
-- Only the server (secret key) writes it. YouTube data older than 30 days is never picked and gets deleted.
-- The value lists must match src/server/music/key.ts.
create table if not exists public.song_pool (
  id          bigint generated always as identity primary key,
  mood        text not null check (mood in ('calm', 'upbeat', 'flutter', 'proud', 'lazy', 'tired', 'blue', 'nostalgic', 'busy', 'cozy')),
  weather     text not null check (weather in ('clear', 'cloudy', 'rain', 'snow', 'hot', 'unknown')),
  time_of_day text not null check (time_of_day in ('morning', 'day', 'night')),
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null check (char_length(title) <= 200),
  channel     text not null check (char_length(channel) <= 100),
  fetched_at  timestamptz not null default now(),
  unique (mood, weather, time_of_day, video_id)
);
create index if not exists song_pool_key on public.song_pool (mood, weather, time_of_day, fetched_at);

-- One reaction per user per pool song (1 = like, -1 = "다른 곡"). Own rows only; counts are
-- aggregated inside pick_song(), so nobody sees who reacted.
create table if not exists public.song_feedback (
  user_id uuid     not null default auth.uid() references auth.users (id) on delete cascade,
  song_id bigint   not null references public.song_pool (id) on delete cascade,
  vote    smallint not null check (vote in (1, -1)),
  primary key (user_id, song_id)
);

-- A picture's match key and song. song_id is only changed through set_artwork_song() below.
alter table public.daily_artworks
  add column if not exists mood        text check (mood in ('calm', 'upbeat', 'flutter', 'proud', 'lazy', 'tired', 'blue', 'nostalgic', 'busy', 'cozy')),
  add column if not exists weather     text check (weather in ('clear', 'cloudy', 'rain', 'snow', 'hot', 'unknown')),
  add column if not exists time_of_day text check (time_of_day in ('morning', 'day', 'night')),
  add column if not exists song_id     bigint references public.song_pool (id) on delete set null,
  -- YouTube search words the text AI wrote for this day (genre/mood only, specs/haru-gemini-text-ai.spl).
  -- Private like the rest of the row: only the song route reads it; never in song_pool or public exhibitions.
  add column if not exists song_query  text check (char_length(song_query) between 1 and 40);

-- The drawn picture (specs/haru-image-ai.spl): a path in the private artworks bucket, never a URL.
-- "{user_id}/{YYYY-MM-DD}-{32 letters}.jpg"; the first part must be the row's owner, so nobody can attach
-- someone else's file. The server hands out 1-hour signed URLs (owner, or a public exhibition only).
alter table public.daily_artworks
  add column if not exists image_path text
    check (image_path ~ '^[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}-[A-Za-z0-9]{32}\.jpg$');
alter table public.daily_artworks drop constraint if exists daily_artworks_image_path_owner;
alter table public.daily_artworks add constraint daily_artworks_image_path_owner
  check (image_path is null or split_part(image_path, '/', 1) = user_id::text);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.profiles, public.daily_artworks, public.exhibitions, public.exhibition_items to anon;
revoke insert, update, delete on public.ai_usage from anon, authenticated;
revoke select on public.ai_usage from anon;
-- Pictures: users may read and create them, never change or delete them directly (M3).
-- Creating is limited to the columns the app sends; image_url/status/created_at stay server-side.
-- Redrawing goes through redraw_artwork() below. Account deletion uses the secret key and is unaffected.
revoke insert, update, delete on public.daily_artworks from anon, authenticated;
grant insert (user_id, day, style, scene, summary, tags, mood, song_query, image_path) on public.daily_artworks to authenticated;
-- Fragments: editing may only change the text. id, day, written_at and user_id stay as written,
-- so an edit can't move a fragment to another day (e.g. into a closed one) or change its time.
revoke update on public.entries from anon, authenticated;
grant update (body) on public.entries to authenticated;
-- Song pool: readable by everyone (public exhibitions show songs), written only with the secret key.
grant select on public.song_pool to anon;
revoke insert, update, delete on public.song_pool from anon, authenticated;
revoke all on public.song_feedback from anon;

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

-- Has the caller already closed (drawn) that day? Only answers about the caller (L1): asked about
-- anyone else it says false, so it can't be used over RPC to learn other users' diary days.
-- The entries policies only ever pass the caller's own user_id, so they are unaffected.
create or replace function public.day_is_closed(p_user uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
     and exists (select 1 from public.daily_artworks a where a.user_id = p_user and a.day = p_day);
$$;
revoke execute on function public.day_is_closed(uuid, date) from public, anon;
grant execute on function public.day_is_closed(uuid, date) to authenticated;

-- Tags on a picture: at most 10, each 1-20 characters (M4; same as AI_LIMITS in src/server/validate.ts).
create or replace function public.valid_tags(p_tags text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(p_tags) <= 10
     and coalesce((select bool_and(char_length(t) between 1 and 20) from unnest(p_tags) t), true);
$$;

-- Size limits on pictures (M4). NOT VALID: checked for new and changed rows only, so rows saved
-- before this change don't make this script fail. Find old rows that break them with:
--   select user_id, day from public.daily_artworks
--    where char_length(summary) not between 1 and 500 or not public.valid_tags(tags);
alter table public.daily_artworks drop constraint if exists daily_artworks_summary_len;
alter table public.daily_artworks add constraint daily_artworks_summary_len
  check (char_length(summary) between 1 and 500) not valid;
alter table public.daily_artworks drop constraint if exists daily_artworks_tags_ok;
alter table public.daily_artworks add constraint daily_artworks_tags_ok
  check (public.valid_tags(tags)) not valid;

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
  lim := case p_kind when 'summarize' then 20 when 'draw' then 10 when 'curate' then 20 when 'song' then 10 end;
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

-- "다시 그리기": replaces the caller's picture for a day in one transaction. The old row is deleted
-- and a new one created, but other sessions never see the day without a picture (so its entries stay
-- locked) and the picture keeps its place in any exhibition. security definer because users may not
-- delete pictures themselves (M3); it only ever touches auth.uid()'s own row, and the table's check
-- constraints still validate style, scene, summary, tags and the new image_path (format, owner).
-- Returns the old picture's file so the caller can delete it. Replaces the earlier 5-argument version.
drop function if exists public.redraw_artwork(date, text, text, text, text[]);
create or replace function public.redraw_artwork(
  p_day date, p_style text, p_scene text, p_summary text, p_tags text[], p_image_path text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  old    public.daily_artworks%rowtype;
  old_id bigint;
  new_id bigint;
  hung   jsonb;
begin
  if uid is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;

  select * into old from public.daily_artworks
   where user_id = uid and day = p_day
   for update;
  old_id := old.id;
  if old_id is null then
    raise exception '그림이 없는 날이에요' using errcode = 'P0002';
  end if;

  -- Remember where the picture hangs; deleting it cascades to exhibition_items.
  select coalesce(jsonb_agg(jsonb_build_object('ex', exhibition_id, 'pos', position, 'note', note)), '[]')
    into hung
    from public.exhibition_items where artwork_id = old_id;

  delete from public.daily_artworks where id = old_id;
  -- The song and its match key stay with the day (a redraw keeps the picture's song); the image is the new one.
  insert into public.daily_artworks (user_id, day, style, scene, summary, tags, mood, weather, time_of_day, song_id, song_query, image_path)
    values (uid, p_day, p_style, p_scene, p_summary, coalesce(p_tags, '{}'),
            old.mood, old.weather, old.time_of_day, old.song_id, old.song_query, p_image_path)
    returning id into new_id;

  insert into public.exhibition_items (exhibition_id, artwork_id, position, note)
    select (h ->> 'ex')::uuid, new_id, (h ->> 'pos')::int, h ->> 'note'
      from jsonb_array_elements(hung) h;

  return old.image_path; -- null when the old picture had no file
end;
$$;
revoke execute on function public.redraw_artwork(date, text, text, text, text[], text) from public, anon;
grant execute on function public.redraw_artwork(date, text, text, text, text[], text) to authenticated;

-- Picks one pool song for a match key by weighted random (Efraimidis-Spirakis):
-- weight = max(0.2, 1 + likes - 0.5 * skips). A null weather or time means "any".
-- Only songs fetched in the last 30 days, minus p_exclude. Returns null when nothing fits.
-- security definer so it can count everyone's reactions without exposing them.
create or replace function public.pick_song(p_mood text, p_weather text, p_time text, p_exclude bigint[])
returns bigint language sql volatile security definer set search_path = '' as $$
  select p.id
    from public.song_pool p
    left join (select song_id,
                      count(*) filter (where vote = 1)  as likes,
                      count(*) filter (where vote = -1) as skips
                 from public.song_feedback group by song_id) f on f.song_id = p.id
   where p.mood = p_mood
     and (p_weather is null or p.weather = p_weather)
     and (p_time is null or p.time_of_day = p_time)
     and p.fetched_at > now() - interval '30 days'
     and not (p.id = any (coalesce(p_exclude, '{}')))
   order by -ln(1 - random()) / greatest(0.2, 1 + coalesce(f.likes, 0) - 0.5 * coalesce(f.skips, 0))
   limit 1;
$$;
revoke execute on function public.pick_song(text, text, text, bigint[]) from public, anon;
grant execute on function public.pick_song(text, text, text, bigint[]) to authenticated;

-- Sets the song (or none) and match key of the caller's own picture for a day.
-- security definer because users may not update pictures directly (M3). Only auth.uid()'s row;
-- an unknown song id fails the foreign key (23503), bad weather/time fail the check constraints.
create or replace function public.set_artwork_song(p_day date, p_song_id bigint, p_weather text, p_time text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  update public.daily_artworks
     set song_id = p_song_id, weather = p_weather, time_of_day = p_time
   where user_id = auth.uid() and day = p_day;
  if not found then
    raise exception '그림이 없는 날이에요' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_artwork_song(date, bigint, text, text) from public, anon;
grant execute on function public.set_artwork_song(date, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.profiles         enable row level security;
alter table public.entries          enable row level security;
alter table public.daily_artworks   enable row level security;
alter table public.exhibitions      enable row level security;
alter table public.exhibition_items enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.song_pool        enable row level security;
alter table public.song_feedback    enable row level security;

-- profiles
drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "profiles: owner of a public exhibition" on public.profiles;
create policy "profiles: owner of a public exhibition" on public.profiles
  for select to anon, authenticated
  using (exists (select 1 from public.exhibitions e where e.user_id = profiles.user_id and e.is_public));

-- entries: private; can only be added, edited or removed while the day is still open
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
drop policy if exists "entries: edit on open day" on public.entries;
create policy "entries: edit on open day" on public.entries
  for update to authenticated
  using (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day))
  with check (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day));

-- daily_artworks
-- (M3) read and create only; no update/delete policy, so direct changes are refused
drop policy if exists "artworks: own" on public.daily_artworks;
drop policy if exists "artworks: read own" on public.daily_artworks;
create policy "artworks: read own" on public.daily_artworks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "artworks: add own" on public.daily_artworks;
create policy "artworks: add own" on public.daily_artworks
  for insert to authenticated with check (user_id = (select auth.uid()));
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

-- song_pool: anyone may read; no write policy, so only the secret key (bypasses RLS) can write
drop policy if exists "song_pool: read" on public.song_pool;
create policy "song_pool: read" on public.song_pool
  for select to anon, authenticated using (true);

-- song_feedback: your own reactions only
drop policy if exists "song_feedback: own" on public.song_feedback;
create policy "song_feedback: own" on public.song_feedback
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- storage (pictures)
-- Private bucket (specs/haru-image-ai.spl): no public URLs. Paths start with the owner's id; owners read
-- and write their own folder, and the server signs 1-hour URLs for the owner or for a public exhibition.

insert into storage.buckets (id, name, public) values ('artworks', 'artworks', false)
  on conflict (id) do update set public = false;

drop policy if exists "artworks bucket: read own files" on storage.objects;
create policy "artworks bucket: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'artworks' and (storage.foldername(name))[1] = (select auth.uid())::text);

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
